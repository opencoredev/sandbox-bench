"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { ProviderLogo } from "@/components/provider-logo";
import { useScrollFade } from "@/components/tabs";

import { formatTaskCost } from "@/lib/cost";
import { fillStyle } from "@/lib/dither";
import { providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { sdkSetup } from "@/lib/sdk-setup";
import { buildTrace, compareTrace, leaves, spanExtent } from "@/lib/spans";
import type { CompareRow, Span, SpanIcon, Trace } from "@/lib/spans";
import { hasTrace, traceKinds } from "@/lib/traces";
import type { TraceKind } from "@/lib/traces";
import type { TrackId } from "@/lib/tracks";

/*
 * Direction: flohoeller's trace waterfall (a card with a stat strip, a span
 * tree on the left, pill bars on a time axis with a playhead), redrawn in the
 * page's dark surfaces and mono numerals. Provider time is the provider's
 * colour, ours is grey hatching. It opens on every provider at once, one
 * stacked bar each on a shared axis; a row drills into that provider's tree.
 * Signature: collapsed groups draw their calls as a strip inside the bar.
 */

export interface WaterfallProvider {
  id: ProviderId;
  costUsd: number | null;
  /** Failures the provider caused on each trace's test, and every attempt. */
  failures: Record<TraceKind, { failed: number; attempts: number }>;
}

/** Bars grow from their left edge when a trace or provider changes; rows remount then. */
const motionCss = `.waterfall-bar{transform-origin:left center;animation:waterfall-grow 300ms cubic-bezier(0.23,1,0.32,1) both}@keyframes waterfall-grow{from{scale:0 1}}@media (prefers-reduced-motion:reduce){.waterfall-bar{animation:none}}`;

const kindLabel = { cold: "Cold start", pause: "Pause + resume", replay: "Tool replay" } as const satisfies Record<TraceKind, string>;

const formatMs = (ms: number) => (ms < 1000 ? `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`);

/** Axis ticks at 1, 2 or 5 × 10ⁿ, with headroom past the end for the labels. */
function axis(total: number) {
  const target = (total * 1.3) / 5;
  const pow = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= target) ?? pow * 10;
  const max = Math.ceil((total * 1.3) / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) }, (_, i) => i * step);
  return { max, ticks };
}

const tickLabel = (ms: number, max: number) => (ms === 0 ? "0s" : max < 2000 ? `${Math.round(ms)}ms` : `${+(ms / 1000).toFixed(2)}s`);

function Icon({ icon, color }: { icon: SpanIcon; color: string }) {
  const paths: Record<SpanIcon, ReactNode> = {
    trace: <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.2 4.2l1.6 1.6M10.2 10.2l1.6 1.6M4.2 11.8l1.6-1.6M10.2 5.8l1.6-1.6" />,
    group: <path d="M3 4.5h10M3 8h10M3 11.5h6" />,
    create: <path d="M8 3.5v9M3.5 8h9" />,
    command: <path d="M3.5 5l3 3-3 3M8.5 11.5h4" />,
    pause: <path d="M6 4v8M10 4v8" />,
    resume: <path d="M5.5 3.8l6.5 4.2-6.5 4.2z" />,
    sdk: <path d="M8 2.8l4.6 2.6v5.2L8 13.2l-4.6-2.6V5.4zM8 8v5.2M8 8l4.6-2.6M8 8L3.4 5.4" />,
    write: <path d="M10.5 3l2.5 2.5-7 7H3.5V10z" />,
    read: <path d="M4.5 2.8h5l2.5 2.5v7.9h-7.5zM6.5 8h3.5M6.5 10.5h3.5" />,
    edit: <path d="M3 12.5h10M9.5 3.5l2 2-5.5 5.5H4v-2z" />,
    ls: <path d="M2.8 4.5h3l1.2 1.3h6.2v6.7H2.8z" />,
    grep: <path d="M7 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM9.6 9.6l3 3" />,
    test: <path d="M6 2.8h4M6.8 2.8v3.6L3.6 12.2a.7.7 0 0 0 .6 1h7.6a.7.7 0 0 0 .6-1L9.2 6.4V2.8" />,
  };
  return (
    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[5px] border border-[var(--wf-line)] bg-[#0a0a0a]">
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {paths[icon]}
      </svg>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** How a bar is painted: provider colour, or grey for our time. */
function barStyle(span: Span, color: string, group: boolean): CSSProperties {
  if (group) return { background: "linear-gradient(90deg, oklch(0.3 0 0), oklch(0.26 0 0))", boxShadow: "inset 0 0 0 1px oklch(0.36 0 0)" };
  switch (span.owner) {
    case "provider":
      return { background: `color-mix(in oklch, ${color} 34%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 70%, transparent)` };
    case "ours":
      return { background: "rgba(255,255,255,0.05)", boxShadow: "inset 0 0 0 1px oklch(0.48 0 0)" };
    default: {
      const _exhaustive: never = span.owner;
      return _exhaustive;
    }
  }
}

interface Row {
  span: Span;
  depth: number;
  open: boolean;
  /** Draws its children as a strip inside its bar. */
  strip: boolean;
  /** "leaf" marks the slowest call itself; "group" marks a collapsed group that contains it. */
  slowest?: "leaf" | "group";
}

function flatten(root: Span, collapsed: ReadonlySet<string>, slowest: Span | undefined): Row[] {
  const rows: Row[] = [];
  const walk = (span: Span, depth: number) => {
    const isGroup = span.children.length > 0;
    const open = isGroup && !collapsed.has(span.id);
    const hidesSlowest = isGroup && !open && slowest !== undefined && leaves(span).includes(slowest);
    rows.push({ span, depth, open, strip: isGroup && !open, slowest: span === slowest ? "leaf" : hidesSlowest ? "group" : undefined });
    if (open) for (const c of span.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return rows;
}

const defaultCollapsed = (trace: Trace) => new Set(trace.kind === "replay" ? trace.root.children.map((c) => c.id) : []);

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" }) {
  return (
    <div className="min-w-0 border-[var(--wf-line)] px-4 py-3 sm:px-5 [&:not(:first-child)]:sm:border-l max-sm:[&:nth-child(even)]:border-l max-sm:[&:nth-child(n+3)]:border-t">
      <div className="text-[11px] font-medium tracking-[0.08em] text-[var(--muted)] uppercase">{label}</div>
      <div className={`mt-1 font-mono text-[22px] leading-tight tabular-nums ${tone === "bad" ? "text-[var(--bad)]" : ""}`}>{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">{sub}</div> : null}
    </div>
  );
}

function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: readonly { id: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="group" aria-label={label} className="scroll-fade flex max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--wf-line)] bg-[var(--wf-card)] p-1 [scrollbar-width:none]">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={it.id === value}
          disabled={it.disabled}
          onClick={() => onChange(it.id)}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] whitespace-nowrap text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:bg-[var(--chip)] aria-pressed:text-[var(--foreground)]"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

type Pick = ProviderId | "all";

/** Shades for a row's provider steps, so neighbouring steps stay apart in one colour. */
const stepMix = [82, 50, 30, 66, 40, 22] as const;

export function TraceWaterfallView({ track, providers }: { track: TrackId; providers: readonly WaterfallProvider[] }) {
  const usable = providers.filter((p) => traceKinds.some((k) => hasTrace(track, k, p.id)));
  const [pick, setPick] = useState<Pick>("all");
  const [kind, setKind] = useState<TraceKind>("cold");
  const provider = pick === "all" ? undefined : usable.find((p) => p.id === pick);
  const activeKind = provider && !hasTrace(track, kind, provider.id) ? (traceKinds.find((k) => hasTrace(track, k, provider.id)) ?? kind) : kind;
  const trace = useMemo(() => (provider ? buildTrace({ track, provider: provider.id, kind: activeKind }) : null), [track, provider, activeKind]);

  const [collapsedFor, setCollapsedFor] = useState<{ key: string; ids: ReadonlySet<string> } | null>(null);
  const key = `${pick}:${activeKind}`;
  const collapsed = trace ? (collapsedFor?.key === key ? collapsedFor.ids : defaultCollapsed(trace)) : new Set<string>();
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsedFor({ key, ids: next });
  };

  const scroller = useScrollFade<HTMLDivElement>();

  const controls = (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Segmented
        label="Trace"
        items={traceKinds.map((k) => ({ id: k, label: kindLabel[k], disabled: provider ? !hasTrace(track, k, provider.id) : !usable.some((p) => hasTrace(track, k, p.id)) }))}
        value={activeKind}
        onChange={setKind}
      />
      <Segmented<Pick>
        label="Provider"
        items={[
          { id: "all", label: "All" },
          ...usable.map((p) => ({
            id: p.id,
            label: (
              <>
                <ProviderLogo id={p.id} />
                {providerName(p.id)}
              </>
            ),
          })),
        ]}
        value={pick}
        onChange={setPick}
      />
    </div>
  );

  if (pick === "all") {
    return (
      <div className="[--wf-card:#111111] [--wf-hover:#181818] [--wf-line:rgba(255,255,255,0.08)]">
        <style>{motionCss}</style>
        {controls}
        <CompareCard key={activeKind} kind={activeKind} track={track} providers={usable} onPick={setPick} />
      </div>
    );
  }

  if (!provider || !trace) return null;
  const color = providerColor(provider.id);
  // A breakdown has no shared clock: scale to its longest bar, drop the root row and the playhead.
  const breakdown = trace.layout === "breakdown";
  const { max, ticks } = axis(breakdown ? Math.max(...trace.root.children.map((c) => c.ms)) : trace.total);
  const pct = (ms: number) => `${(ms / max) * 100}%`;
  // Sequential steps get a SLOWEST badge; the replay breakdown is already sorted by time.
  const slowest = trace.kind === "replay" ? undefined : leaves(trace.root).reduce<Span | undefined>((a, s) => (!a || s.ms > a.ms ? s : a), undefined);
  const rows = breakdown ? trace.root.children.map((span) => ({ span, depth: 0, open: false, strip: false })) : flatten(trace.root, collapsed, slowest);
  const ours = trace.total - trace.providerMs;
  const failures = provider.failures[activeKind];
  const playhead = trace.total;

  return (
    <div className="[--wf-card:#111111] [--wf-hover:#181818] [--wf-line:rgba(255,255,255,0.08)]">
      <style>{motionCss}</style>
      {controls}

      <div className="overflow-hidden rounded-xl border border-[var(--wf-line)] bg-[var(--wf-card)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--wf-line)] px-4 py-3 sm:px-5">
          <button type="button" onClick={() => setPick("all")} className="-my-1 flex h-7 shrink-0 items-center gap-1 rounded-full pr-2.5 pl-1.5 text-[12.5px] text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--chip)] hover:text-[var(--foreground)] focus-visible:outline-1 focus-visible:outline-[var(--foreground)]">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M10 4L6 8l4 4" /></svg>
            All
          </button>
          <span className="text-[14px] font-medium">Trace</span>
          <span className="min-w-0 truncate text-[14px] text-[var(--muted)]">
            {trace.title} · {trace.kind === "replay" ? "median run" : "median of each step"}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px]" style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 40%, transparent)` }}>
            <ProviderLogo id={provider.id} size={12} />
            {providerName(provider.id)}
          </span>
        </div>

        <div className="grid grid-cols-2 border-b border-[var(--wf-line)] sm:grid-cols-4">
          <Stat label="Total time" value={formatMs(trace.total)} sub={ours > 0 ? `${formatMs(trace.providerMs)} provider · ${formatMs(ours)} ours` : trace.basis} />
          <Stat label="Cost per task" value={provider.costUsd === null ? "n/a" : formatTaskCost(provider.costUsd)} sub="create, replay, delete" />
          <Stat label="Calls" value={String(trace.calls)} sub={trace.basis} />
          <Stat label="Failures" value={failures.failed.toLocaleString("en-US")} sub={`of ${failures.attempts.toLocaleString("en-US")} attempts`} tone={failures.failed > 0 ? "bad" : undefined} />
        </div>

        <div className="relative">
        <div ref={scroller} className="peer max-h-[560px] overflow-auto overscroll-x-contain [--span-col:132px] [--wf-indent:8px] sm:[--span-col:280px] sm:[--wf-indent:14px]">
          <div className={`relative grid grid-cols-[var(--span-col)_1fr] sm:min-w-0 ${breakdown ? "" : "min-w-[640px]"}`}>
            {/* Time axis */}
            <div className="sticky top-0 left-0 z-30 flex h-9 items-center border-r border-b border-[var(--wf-line)] bg-[var(--wf-card)] pl-4 text-[10.5px] font-medium tracking-[0.08em] text-[var(--muted)] uppercase sm:pl-5">Span</div>
            <div className="sticky top-0 z-20 h-9 border-b border-[var(--wf-line)] bg-[var(--wf-card)]">
              {ticks.map((t) => (
                <span key={t} className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-[11px] text-[var(--muted)] tabular-nums" style={{ left: pct(t) }}>
                  {tickLabel(t, max)}
                </span>
              ))}
              {breakdown ? null : <span aria-hidden className="absolute bottom-[-4px] z-10 size-[7px] -translate-x-1/2 rounded-full" style={{ left: pct(playhead), background: color }} />}
            </div>

            {/* Gridlines and playhead, under the rows */}
            <div aria-hidden className="pointer-events-none absolute top-9 right-0 bottom-0 left-[var(--span-col)]">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-[rgba(255,255,255,0.05)]" style={{ left: pct(t) }} />
              ))}
              {breakdown ? null : <span className="absolute inset-y-0 z-10 w-px" style={{ left: pct(playhead), background: `color-mix(in oklch, ${color} 70%, transparent)` }} />}
            </div>

            <ul key={key} className="contents">
              {rows.map((row, i) => (
                <SpanRow key={row.span.id} row={row} index={i} color={color} pct={pct} onToggle={toggle} />
              ))}
            </ul>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-40 w-8 bg-gradient-to-l from-[var(--wf-card)] to-transparent opacity-0 transition-opacity duration-150 peer-data-[fade-end]:opacity-100" />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--wf-line)] px-4 py-2.5 text-[11.5px] text-[var(--muted)] sm:px-5">
          <Legend style={barStyle({ ...trace.root, owner: "provider" }, color, false)}>{providerName(provider.id)}&apos;s time</Legend>
          {ours > 0 ? <Legend style={barStyle({ ...trace.root, owner: "ours" }, color, false)} hatched>Ours: Sandbox SDK</Legend> : null}
          <span className="sm:ml-auto">{trace.kind === "cold" ? coldNote(track) : footnote[trace.kind]}</span>
        </div>
      </div>
    </div>
  );
}

/** Where the cold-start trace's SDK step comes from, or why it is missing. */
const coldNote = (track: TrackId) =>
  track === "default"
    ? `SDK setup is our new SDK, measured separately: ${sdkSetup.creates} creates per provider on ${sdkSetup.date}. It used to take 0.8 to 7.3 s. Cold start never includes it.`
    : "Our SDK's setup after create was measured on default machines only. Cold start never includes it.";

const footnote = {
  pause: "Medians of each step.",
  replay: "Time per kind of call, added up over the median run, longest first.",
} as const satisfies Record<Exclude<TraceKind, "cold">, string>;

/** Every provider's trace as one stacked bar on a shared axis; a row opens that provider's tree. */
function CompareCard({ kind, track, providers, onPick }: { kind: TraceKind; track: TrackId; providers: readonly WaterfallProvider[]; onPick: (id: ProviderId) => void }) {
  const scroller = useScrollFade<HTMLDivElement>();
  const rows: CompareRow[] = compareTrace(track, kind, providers.map((p) => p.id));
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return null;
  const { max, ticks } = axis(Math.max(...rows.map((r) => r.total)));
  const pct = (ms: number) => `${(ms / max) * 100}%`;
  const shown = providers.filter((p) => rows.some((r) => r.provider === p.id));
  const failed = shown.reduce((a, p) => a + p.failures[kind].failed, 0);
  const attempts = shown.reduce((a, p) => a + p.failures[kind].attempts, 0);
  const hasOurs = first.steps.some((s) => s.owner === "ours");

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--wf-line)] bg-[var(--wf-card)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--wf-line)] px-4 py-3 sm:px-5">
        <Icon icon="trace" color="var(--brand)" />
        <span className="text-[14px] font-medium">Trace</span>
        <span className="min-w-0 truncate text-[14px] text-[var(--muted)]">
          {kindLabel[kind]} · every provider, {kind === "replay" ? "median run" : "median of each step"}
        </span>
      </div>

      <div className="grid grid-cols-2 border-b border-[var(--wf-line)] sm:grid-cols-4">
        <Stat label="Fastest" value={formatMs(first.providerMs)} sub={`${providerName(first.provider)} · provider time`} />
        <Stat label="Slowest" value={formatMs(last.providerMs)} sub={`${providerName(last.provider)} · provider time`} />
        <Stat label="Spread" value={`${(last.providerMs / first.providerMs).toFixed(1)}×`} sub="slowest vs fastest" />
        <Stat label="Failures" value={failed.toLocaleString("en-US")} sub={`of ${attempts.toLocaleString("en-US")} attempts`} tone={failed > 0 ? "bad" : undefined} />
      </div>

      <div className="relative">
        <div ref={scroller} className="peer overflow-x-auto overscroll-x-contain [--span-col:124px] sm:[--span-col:200px]">
          <div className="relative grid min-w-[560px] grid-cols-[var(--span-col)_1fr] sm:min-w-0">
            <div className="sticky top-0 left-0 z-30 flex h-9 items-center border-r border-b border-[var(--wf-line)] bg-[var(--wf-card)] pl-4 text-[10.5px] font-medium tracking-[0.08em] text-[var(--muted)] uppercase sm:pl-5">Provider</div>
            <div className="sticky top-0 z-20 h-9 border-b border-[var(--wf-line)] bg-[var(--wf-card)]">
              {ticks.map((t) => (
                <span key={t} className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-[11px] text-[var(--muted)] tabular-nums" style={{ left: pct(t) }}>
                  {tickLabel(t, max)}
                </span>
              ))}
            </div>
            <div aria-hidden className="pointer-events-none absolute top-9 right-0 bottom-0 left-[var(--span-col)]">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-[rgba(255,255,255,0.05)]" style={{ left: pct(t) }} />
              ))}
            </div>
            <ul className="contents">
              {rows.map((row, i) => (
                <CompareRowView key={row.provider} row={row} index={i} pct={pct} onPick={onPick} />
              ))}
            </ul>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-40 w-8 bg-gradient-to-l from-[var(--wf-card)] to-transparent opacity-0 transition-opacity duration-150 peer-data-[fade-end]:opacity-100" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--wf-line)] px-4 py-2.5 text-[11.5px] text-[var(--muted)] sm:px-5">
        {first.steps
          .filter((s) => s.owner === "provider")
          .map((s, i) => (
            <Legend key={s.id} style={{ background: `color-mix(in oklch, oklch(0.9 0 0) ${stepMix[i % stepMix.length]}%, transparent)` }}>
              {s.name}
            </Legend>
          ))}
        {hasOurs ? <Legend style={barStyle({ id: "", name: "", sub: "", icon: "sdk", owner: "ours", start: 0, ms: 0, usd: null, children: [] }, "", false)} hatched>Ours: Sandbox SDK</Legend> : null}
        <span className="sm:ml-auto">{kind === "cold" ? `${coldNote(track)} ` : ""}Ranked by provider time · pick a provider for its full trace.</span>
      </div>
    </div>
  );
}

function CompareRowView({ row, index, pct, onPick }: { row: CompareRow; index: number; pct: (ms: number) => string; onPick: (id: ProviderId) => void }) {
  const color = providerColor(row.provider);
  const ours = row.total - row.providerMs;
  let providerStep = 0;
  return (
    <li className="contents">
      <button
        type="button"
        onClick={() => onPick(row.provider)}
        aria-label={`${providerName(row.provider)}: ${formatMs(row.providerMs)} provider time${ours > 0 ? `, plus ${formatMs(ours)} of our SDK setup` : ""}. Open its full trace.`}
        className="group col-span-2 grid grid-cols-subgrid text-left focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--foreground)]"
      >
        <span className="sticky left-0 z-10 flex h-10 min-w-0 items-center gap-2 border-r border-[var(--wf-line)] bg-[var(--wf-card)] pr-3 pl-4 group-hover:bg-[var(--wf-hover)] sm:pl-5">
          <ProviderLogo id={row.provider} size={16} />
          <span className="min-w-0 truncate text-[13.5px] font-medium">{providerName(row.provider)}</span>
        </span>
        <span className="relative h-10 group-hover:bg-[var(--wf-hover)]">
          <span className="waterfall-bar absolute top-1/2 flex h-[16px] -translate-y-1/2 gap-px overflow-hidden rounded-full" style={{ left: 0, width: pct(row.total), animationDelay: `${index * 15}ms` }}>
            {row.steps.map((s) => {
              const width = `${(s.ms / row.total) * 100}%`;
              if (s.owner === "ours") {
                return (
                  <span key={s.id} className="relative h-full shrink-0" style={{ width, ...barStyle({ id: s.id, name: s.name, sub: "", icon: "sdk", owner: "ours", start: 0, ms: s.ms, usd: null, children: [] }, color, false) }}>
                    <Hatch />
                  </span>
                );
              }
              const mix = stepMix[providerStep++ % stepMix.length];
              return <span key={s.id} className="h-full shrink-0" style={{ width, background: `color-mix(in oklch, ${color} ${mix}%, transparent)` }} />;
            })}
          </span>
          <span className="pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 pl-1.5 font-mono text-[12px] whitespace-nowrap tabular-nums" style={{ left: pct(row.total) }}>
            <span className="rounded-[3px] bg-[var(--surface)] px-1 text-[var(--foreground)]">{formatMs(row.providerMs)}</span>
            {ours > 0 ? <span className="text-[var(--muted)]">+ {formatMs(ours)} SDK</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Grey hatching inside a pill, for time that is ours. */
const Hatch = () => <span aria-hidden className="absolute inset-0" style={fillStyle("hatched", { color: "oklch(0.6 0 0)" })} />;

function Legend({ style, hatched = false, children }: { style: CSSProperties; hatched?: boolean; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="relative h-2.5 w-5 overflow-hidden rounded-full" style={style}>
        {hatched ? <Hatch /> : null}
      </span>
      {children}
    </span>
  );
}

function SpanRow({ row, index, color, pct, onToggle }: { row: Row; index: number; color: string; pct: (ms: number) => string; onToggle: (id: string) => void }) {
  const { span, depth, open, strip, slowest } = row;
  const isGroup = span.children.length > 0;
  const { start, ms } = spanExtent(span);
  const hidden = leaves(span);
  const label = `${formatMs(span.ms)}${span.usd !== null ? ` · ${formatTaskCost(span.usd)}` : ""}`;
  const delay = { animationDelay: `${Math.min(index, 20) * 15}ms` };
  return (
    <li className="group contents">
      <div className="sticky left-0 z-10 flex h-[34px] min-w-0 items-center gap-1.5 overflow-hidden border-r border-[var(--wf-line)] bg-[var(--wf-card)] pr-3 group-hover:bg-[var(--wf-hover)]" style={{ paddingLeft: `calc(${depth} * var(--wf-indent) + 10px)` }}>
        {isGroup ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${span.name}`}
            onClick={() => onToggle(span.id)}
            className="-m-1 grid size-6 shrink-0 place-items-center rounded-[4px] text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-1 focus-visible:outline-[var(--foreground)]"
          >
            <Chevron open={open} />
          </button>
        ) : (
          <span aria-hidden className="w-4 shrink-0" />
        )}
        <span className="hidden sm:contents">
          <Icon icon={span.icon} color={span.owner === "provider" ? color : "var(--muted)"} />
        </span>
        <span className={`min-w-0 truncate text-[13px] sm:shrink-0 sm:text-[13.5px] ${depth === 0 || isGroup ? "font-medium" : ""}`}>{span.name}</span>
        <span className="hidden min-w-0 truncate text-[12.5px] text-[var(--muted)] sm:block">{span.sub}</span>
        {strip ? <span className="ml-auto shrink-0 rounded-[4px] sm:ml-0 bg-[var(--chip)] px-1.5 font-mono text-[11px] leading-[18px] text-[var(--muted)] tabular-nums">+{hidden.length}</span> : null}
      </div>
      <div className="relative h-[34px] group-hover:bg-[var(--wf-hover)]">
        <div
          className="waterfall-bar absolute top-1/2 h-[14px] -translate-y-1/2 overflow-hidden rounded-full"
          style={{ left: pct(start), width: `max(3px, ${pct(ms)})`, ...barStyle(span, color, isGroup), ...delay }}
        >
          {span.owner === "ours" && !isGroup ? <Hatch /> : null}
          {strip
            ? hidden.map((c) => (
                <span
                  key={c.id}
                  className="absolute inset-y-[3px] rounded-full"
                  style={{ left: `${((c.start - start) / ms) * 100}%`, width: `max(1.5px, ${(c.ms / ms) * 100}%)`, background: c.owner === "provider" ? color : "oklch(0.6 0 0)", opacity: 0.85 }}
                />
              ))
            : null}
        </div>
        <span className="pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 pl-1 font-mono text-[12px] whitespace-nowrap text-[var(--muted)] tabular-nums" style={{ left: pct(start + ms) }}>
          {/* Opaque backing so the playhead line passes behind the label, not through it */}
          <span className={`rounded-[3px] bg-[var(--surface)] px-1 ${isGroup ? "" : "text-[var(--foreground)]"}`}>{label}</span>
          {slowest ? <span className="rounded-[4px] border border-[color-mix(in_oklch,var(--warn)_45%,transparent)] bg-[color-mix(in_oklch,var(--warn)_16%,transparent)] px-1.5 font-sans text-[10px] leading-[17px] font-semibold tracking-[0.06em] text-[var(--warn)]">{slowest === "group" ? "SLOWEST CALL" : "SLOWEST"}</span> : null}
        </span>
      </div>
    </li>
  );
}
