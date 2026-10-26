"use client";

import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { Button, Toggle, ToggleGroup } from "@graphical";

import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import { useScrollFade } from "@/components/tabs";

import { formatTaskCost } from "@/lib/cost";
import { markFill } from "@/lib/marks";
import { providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
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
    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-s bg-neutral-1">
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {paths[icon]}
      </svg>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-3.5 transition-transform duration-[var(--motion-duration)] ease-[var(--motion-easing)] motion-reduce:transition-none ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** How a bar is painted: provider colour, or grey for our time. */
function barStyle(span: Span, color: string, group: boolean): CSSProperties {
  if (group) return { background: "linear-gradient(90deg, var(--neutral-4), var(--neutral-3))", boxShadow: "inset 0 0 0 1px var(--neutral-5)" };
  switch (span.owner) {
    case "provider":
      return { background: `color-mix(in oklch, ${color} 34%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 70%, transparent)` };
    case "ours":
      return { background: "var(--neutral-3-transparent)", boxShadow: "inset 0 0 0 1px var(--neutral-6)" };
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

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "bad" }) {
  return (
    <div className="min-w-0 px-m py-s sm:px-l">
      <div className="text-s text-neutral-7">{label}</div>
      <div className={`mt-xxs font-mono text-l tabular-nums ${tone === "bad" ? "text-error" : ""}`}>{value}</div>
      {sub ? <div className="mt-0.5 truncate text-xs text-neutral-7">{sub}</div> : null}
    </div>
  );
}

/** One of a few options, on the theme's toggle group. Pressing the current option again keeps it. */
function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: readonly { id: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (id: T) => void }) {
  const scroller = useScrollFade<HTMLDivElement>();
  return (
    <ToggleGroup
      ref={scroller}
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const id = items.find((it) => next.includes(it.id))?.id;
        if (id !== undefined) onChange(id);
      }}
      className="surface scroll-fade max-w-full overflow-x-auto p-xxs [scrollbar-width:none]"
    >
      {items.map((it) => (
        <Toggle key={it.id} value={it.id} disabled={it.disabled} className={`shrink-0 whitespace-nowrap text-s ${it.id === value ? "" : "text-neutral-7"}`}>
          {it.label}
        </Toggle>
      ))}
    </ToggleGroup>
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
    // Stacked at every width: with nine providers the chips need the card's full width.
    <div className="mb-s flex flex-col items-start gap-xs">
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
                <ProviderName id={p.id} />
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
      <div className="[--wf-card:var(--neutral-2)] [--wf-hover:var(--neutral-3)]">
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
    <div className="[--wf-card:var(--neutral-2)] [--wf-hover:var(--neutral-3)]">
      <style>{motionCss}</style>
      {controls}

      <div className="surface overflow-hidden">
        <div className="flex items-center gap-xs px-m pt-m pb-xs sm:px-l">
          <Button variant="ghost" onClick={() => setPick("all")} className="-my-xxs shrink-0 pl-xs text-neutral-7">
            <ChevronLeft aria-hidden />
            All
          </Button>
          <span className="text-s font-medium">Trace</span>
          <span className="min-w-0 truncate text-s text-neutral-7">
            {trace.title} · {trace.kind === "replay" ? "median run" : "median of each step"}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs" style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 40%, transparent)` }}>
            <ProviderLogo id={provider.id} size={12} />
            <ProviderName id={provider.id} />
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Stat label="Total time" value={formatMs(trace.total)} sub={ours > 0 ? `${formatMs(trace.providerMs)} provider · ${formatMs(ours)} ours` : trace.basis} />
          <Stat label="Cost per task" value={provider.costUsd === null ? "n/a" : formatTaskCost(provider.costUsd)} sub="create, replay, delete" />
          <Stat label="Calls" value={String(trace.calls)} sub={trace.basis} />
          <Stat label="Failures" value={failures.failed.toLocaleString("en-US")} sub={`of ${failures.attempts.toLocaleString("en-US")} attempts`} tone={failures.failed > 0 ? "bad" : undefined} />
        </div>

        <div className="relative">
        <div ref={scroller} className="peer max-h-[560px] overflow-auto overscroll-x-contain [--span-col:132px] [--wf-indent:8px] sm:[--span-col:280px] sm:[--wf-indent:14px]">
          <div className={`relative grid grid-cols-[var(--span-col)_1fr] sm:min-w-0 ${breakdown ? "" : "min-w-[640px]"}`}>
            {/* Time axis */}
            <div className="sticky top-0 left-0 z-30 flex h-9 items-center bg-[var(--wf-card)] pl-m text-s text-neutral-7 sm:pl-l">Span</div>
            <div className="sticky top-0 z-20 h-9 bg-[var(--wf-card)]">
              {ticks.map((t) => (
                <span key={t} className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-xxs text-neutral-7 tabular-nums" style={{ left: pct(t) }}>
                  {tickLabel(t, max)}
                </span>
              ))}
              {breakdown ? null : <span aria-hidden className="absolute bottom-[-4px] z-10 size-[7px] -translate-x-1/2 rounded-full" style={{ left: pct(playhead), background: color }} />}
            </div>

            {/* Gridlines and playhead, under the rows */}
            <div aria-hidden className="pointer-events-none absolute top-9 right-0 bottom-0 left-[var(--span-col)]">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-neutral-3" style={{ left: pct(t) }} />
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
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-40 w-8 bg-gradient-to-l from-[var(--wf-card)] to-transparent opacity-0 transition-opacity duration-[var(--motion-duration)] peer-data-[fade-end]:opacity-100" />
        </div>

        <div className="flex flex-wrap items-center gap-x-m gap-y-xs px-m py-s text-xs text-neutral-7 sm:px-l">
          <Legend style={barStyle({ ...trace.root, owner: "provider" }, color, false)}><ProviderName id={provider.id} />&apos;s time</Legend>
          {ours > 0 ? <Legend style={barStyle({ ...trace.root, owner: "ours" }, color, false)} hatched>Ours: Sandbox SDK</Legend> : null}
        </div>
      </div>
    </div>
  );
}

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
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-xs px-m pt-m pb-xs sm:px-l">
        <Icon icon="trace" color="var(--color-1)" />
        <span className="text-s font-medium">Trace</span>
        <span className="min-w-0 truncate text-s text-neutral-7">
          {kindLabel[kind]} · every provider, {kind === "replay" ? "median run" : "median of each step"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4">
        <Stat label="Fastest" value={formatMs(first.providerMs)} sub={<><ProviderName id={first.provider} /> · provider time</>} />
        <Stat label="Slowest" value={formatMs(last.providerMs)} sub={<><ProviderName id={last.provider} /> · provider time</>} />
        <Stat label="Spread" value={`${(last.providerMs / first.providerMs).toFixed(1)}×`} sub="slowest vs fastest" />
        <Stat label="Failures" value={failed.toLocaleString("en-US")} sub={`of ${attempts.toLocaleString("en-US")} attempts`} tone={failed > 0 ? "bad" : undefined} />
      </div>

      <div className="relative">
        <div ref={scroller} className="peer overflow-x-auto overscroll-x-contain [--span-col:180px] sm:[--span-col:200px]">
          <div className="relative grid min-w-[560px] grid-cols-[var(--span-col)_1fr] sm:min-w-0">
            <div className="sticky top-0 left-0 z-30 flex h-9 items-center bg-[var(--wf-card)] pl-m text-s text-neutral-7 sm:pl-l">Provider</div>
            <div className="sticky top-0 z-20 h-9 bg-[var(--wf-card)]">
              {ticks.map((t) => (
                <span key={t} className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-xxs text-neutral-7 tabular-nums" style={{ left: pct(t) }}>
                  {tickLabel(t, max)}
                </span>
              ))}
            </div>
            <div aria-hidden className="pointer-events-none absolute top-9 right-0 bottom-0 left-[var(--span-col)]">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-neutral-3" style={{ left: pct(t) }} />
              ))}
            </div>
            <ul className="contents">
              {rows.map((row, i) => (
                <CompareRowView key={row.provider} row={row} index={i} pct={pct} onPick={onPick} />
              ))}
            </ul>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-40 w-8 bg-gradient-to-l from-[var(--wf-card)] to-transparent opacity-0 transition-opacity duration-[var(--motion-duration)] peer-data-[fade-end]:opacity-100" />
      </div>

      <div className="flex flex-wrap items-center gap-x-m gap-y-xs px-m py-s text-xs text-neutral-7 sm:px-l">
        {first.steps
          .filter((s) => s.owner === "provider")
          .map((s, i) => (
            <Legend key={s.id} style={{ background: `color-mix(in oklch, var(--neutral-9) ${stepMix[i % stepMix.length]}%, transparent)` }}>
              {s.name}
            </Legend>
          ))}
        {hasOurs ? <Legend style={barStyle({ id: "", name: "", sub: "", icon: "sdk", owner: "ours", start: 0, ms: 0, usd: null, children: [] }, "", false)} hatched>Ours: Sandbox SDK</Legend> : null}
        <span className="sm:ml-auto">Ranked by provider time · pick a provider for its full trace.</span>
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
        className="group col-span-2 grid grid-cols-subgrid text-left focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-neutral-10"
      >
        <span className="sticky left-0 z-10 flex h-10 min-w-0 items-center gap-xs bg-[var(--wf-card)] pr-s pl-m group-hover:bg-[var(--wf-hover)] sm:pl-5">
          <ProviderLogo id={row.provider} size={16} />
          <span className="min-w-0 truncate text-s font-medium"><ProviderName id={row.provider} /></span>
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
          <span className="pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 pl-1.5 font-mono text-xs whitespace-nowrap tabular-nums" style={{ left: pct(row.total) }}>
            <span className="rounded-[3px] bg-neutral-2 px-xxs text-neutral-10">{formatMs(row.providerMs)}</span>
            {ours > 0 ? <span className="text-neutral-7">+ {formatMs(ours)} SDK</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Grey hatching inside a pill, for time that is ours. */
const Hatch = () => <span aria-hidden className="absolute inset-0" style={markFill("striped", "var(--neutral-6)")} />;

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
      <div className="sticky left-0 z-10 flex h-[34px] min-w-0 items-center gap-1.5 overflow-hidden bg-[var(--wf-card)] pr-s group-hover:bg-[var(--wf-hover)]" style={{ paddingLeft: `calc(${depth} * var(--wf-indent) + 10px)` }}>
        {isGroup ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${span.name}`}
            onClick={() => onToggle(span.id)}
            className="-m-xxs grid size-6 shrink-0 place-items-center rounded-[4px] text-neutral-7 hover:text-neutral-10 focus-visible:outline-1 focus-visible:outline-neutral-10"
          >
            <Chevron open={open} />
          </button>
        ) : (
          <span aria-hidden className="w-4 shrink-0" />
        )}
        <span className="hidden sm:contents">
          <Icon icon={span.icon} color={span.owner === "provider" ? color : "var(--neutral-7)"} />
        </span>
        <span className={`min-w-0 truncate text-s sm:shrink-0 sm:text-s ${depth === 0 || isGroup ? "font-medium" : ""}`}>{span.name}</span>
        <span className="hidden min-w-0 truncate text-xs text-neutral-7 sm:block">{span.sub}</span>
        {strip ? <span className="ml-auto shrink-0 rounded-[4px] sm:ml-0 bg-neutral-4 px-1.5 font-mono text-xxs leading-[18px] text-neutral-7 tabular-nums">+{hidden.length}</span> : null}
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
                  style={{ left: `${((c.start - start) / ms) * 100}%`, width: `max(1.5px, ${(c.ms / ms) * 100}%)`, background: c.owner === "provider" ? color : "var(--neutral-6)", opacity: 0.85 }}
                />
              ))
            : null}
        </div>
        <span className="pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-xs pl-xxs font-mono text-xs whitespace-nowrap text-neutral-7 tabular-nums" style={{ left: pct(start + ms) }}>
          {/* Opaque backing so the playhead line passes behind the label, not through it */}
          <span className={`rounded-[3px] bg-neutral-2 px-xxs ${isGroup ? "" : "text-neutral-10"}`}>{label}</span>
          {slowest ? <span className="rounded-[4px] border border-[color-mix(in_oklch,var(--warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--warning)_16%,transparent)] px-1.5 font-sans text-xxs leading-[17px] font-medium tracking-xl text-warning">{slowest === "group" ? "SLOWEST CALL" : "SLOWEST"}</span> : null}
        </span>
      </div>
    </li>
  );
}
