"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { Button, Toggle, ToggleGroup } from "@graphical";

import { ProviderName } from "@/components/provider-name";
import { markFill } from "@/lib/marks";
import type { ColdPhases, PausePhases } from "@/lib/inputs";
import { isProviderId, providerColor, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { hasTrace, isTraceKind, providerTrace, replayOps, traces } from "@/lib/traces";
import type { ReplayOp, ReplayTrace, TraceKind } from "@/lib/traces";
import { isTrackId, landingTrack, trackInfo } from "@/lib/tracks";
import type { TrackId } from "@/lib/tracks";

/*
 * Direction: a network-panel waterfall (Chrome DevTools, the trace view in
 * flohoeller's post) drawn in the page's own flat marks. Provider time is
 * the provider's colour, our time is grey stripes, everywhere, so nobody
 * reads our overhead as theirs. One panel per page: columns carry
 * data-trace="<kind>:<provider>" and this listens on the document.
 */

interface Open {
  track: TrackId;
  provider: ProviderId;
  kind: TraceKind;
}

const kindLabel = { cold: "Cold start", pause: "Pause + resume", replay: "Tool replay" } as const satisfies Record<TraceKind, string>;

const CLOSE_MS = 150;

const formatMs = (ms: number) => (ms < 1000 ? `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`);

/** Reads the column a click or key landed on: its kind, provider, and the track view around it. */
function target(el: EventTarget | null): (Open & { trigger: HTMLElement }) | null {
  if (!(el instanceof Element)) return null;
  const trigger = el.closest<HTMLElement>("[data-trace]");
  const [kind = "", provider = ""] = trigger?.dataset.trace?.split(":") ?? [];
  const track = trigger?.closest<HTMLElement>("[data-track-view]")?.dataset.trackView ?? landingTrack;
  if (!trigger || !isTraceKind(kind) || !isProviderId(provider) || !isTrackId(track)) return null;
  return { trigger, kind, provider, track };
}

export function TracePanel() {
  const [open, setOpen] = useState<Open | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const show = useCallback((next: Open & { trigger: HTMLElement }) => {
    trigger.current = next.trigger;
    setOpen({ track: next.track, provider: next.provider, kind: next.kind });
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const hit = target(event.target);
      if (hit) show(hit);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const hit = target(event.target);
      if (!hit) return;
      event.preventDefault();
      show(hit);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [show]);

  // Open as a modal: the page goes inert, Escape is caught below, and the page keeps its width.
  const isOpen = open !== null;
  useEffect(() => {
    const el = dialog.current;
    if (!isOpen || !el || el.open) return;
    const root = document.documentElement;
    const gutter = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    if (gutter > 0) root.style.paddingRight = `${gutter}px`;
    el.removeAttribute("data-closing");
    el.showModal();
    return () => {
      root.style.overflow = "";
      root.style.paddingRight = "";
    };
  }, [isOpen]);

  const close = useCallback(() => {
    const el = dialog.current;
    if (!el || el.hasAttribute("data-closing")) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.setAttribute("data-closing", "");
    window.setTimeout(
      () => {
        el.close();
        setOpen(null);
        trigger.current?.focus({ preventScroll: true });
      },
      reduce ? 0 : CLOSE_MS,
    );
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="trace-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // The panel fills the dialog, so a click on the dialog itself is a click on the backdrop.
        if (event.target === event.currentTarget) close();
      }}
      className={[
        // The theme's Drawer: Neutral 2 with a Neutral 4 transparent edge, L elevation, a Neutral 1 transparent backdrop.
        "fixed m-0 max-h-none max-w-none overflow-hidden bg-neutral-2 p-0 text-neutral-10 shadow-[inset_0_0_0_var(--border-s)_var(--neutral-4-transparent),var(--shadow-l)] backdrop:bg-[var(--neutral-1-transparent)]",
        // Phones: a bottom sheet. Wider screens: a panel down the right edge.
        "inset-x-0 top-auto bottom-0 h-[min(88dvh,820px)] w-full rounded-t-m",
        "sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:w-[min(600px,100vw)] sm:rounded-none",
        "transition-[translate,opacity] duration-[var(--motion-large-duration)] ease-[var(--motion-large-easing)] motion-reduce:transition-none",
        "starting:open:translate-y-8 starting:open:opacity-0 sm:starting:open:translate-x-8 sm:starting:open:translate-y-0",
        "data-closing:translate-y-4 data-closing:opacity-0 data-closing:duration-[var(--motion-duration)] sm:data-closing:translate-x-4 sm:data-closing:translate-y-0",
      ].join(" ")}
    >
      {open ? <Panel open={open} onChange={setOpen} onClose={close} /> : null}
    </dialog>
  );
}

function Panel({ open, onChange, onClose }: { open: Open; onChange: (next: Open) => void; onClose: () => void }) {
  const { track, provider, kind } = open;
  const trace = providerTrace(track, provider);
  const color = providerColor(provider);
  const kinds = (["cold", "pause", "replay"] as const).filter((k) => hasTrace(track, k, provider));
  const others = Object.keys(providerInfo).filter(isProviderId).filter((p) => hasTrace(track, kind, p));
  const body = useRef<HTMLDivElement>(null);
  // A new provider or section starts at the top.
  // A block body: newer browsers return a promise from scrollTo, which React would call as a cleanup.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [provider, kind]);

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-m pt-s pb-xs sm:px-l sm:pt-l">
        <div aria-hidden className="mx-auto mb-s h-1 w-10 rounded-full bg-neutral-4 sm:hidden" />
        <div className="flex items-start justify-between gap-m">
          <div className="min-w-0">
            <p className="text-xs text-neutral-7">
              Where the time goes · {trackInfo[track].short}
            </p>
            <h2 id="trace-title" className="mt-0.5 text-l font-medium">
              <span style={{ color }}><ProviderName id={provider} /></span>
              <span className="text-neutral-7"> · {kindLabel[kind]}</span>
            </h2>
          </div>
          <Button variant="ghost" autoFocus onClick={onClose} aria-label="Close" className="-mr-xs shrink-0 px-xs text-neutral-7">
            <X aria-hidden />
          </Button>
        </div>
        <ToggleGroup className="mt-s flex-wrap" aria-label="Breakdown" value={[kind]}>
          {kinds.map((k) => (
            <Chip key={k} value={k} pressed={k === kind} onClick={() => onChange({ ...open, kind: k })}>
              {kindLabel[k]}
            </Chip>
          ))}
        </ToggleGroup>
        {others.length > 1 ? (
          <ToggleGroup className="-mx-m mt-xs overflow-x-auto px-m [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Provider" value={[provider]}>
            {others.map((p) => (
              <Chip key={p} value={p} pressed={p === provider} color={providerColor(p)} onClick={() => onChange({ ...open, provider: p })}>
                <ProviderName id={p} />
              </Chip>
            ))}
          </ToggleGroup>
        ) : null}
      </header>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-m py-m sm:px-l">
        {kind === "cold" && trace?.cold ? <ColdView data={trace.cold} provider={provider} /> : null}
        {kind === "pause" && trace?.pause ? <PauseView data={trace.pause} provider={provider} /> : null}
        {kind === "replay" && trace?.replay ? <ReplayView data={trace.replay} /> : null}
        <p className="mt-xl text-xs text-neutral-7">
          From run {traces[track].generatedFrom}. Every call runs from our server through Sandbox SDK&apos;s adapter for{" "}
          <ProviderName id={provider} />, so each includes the network round trip.
        </p>
      </div>
    </div>
  );
}

/** One option in the panel's pickers, on the theme's toggle. A provider's option takes its colour when pressed. */
function Chip({ value, pressed, color, onClick, children }: { value: string; pressed: boolean; color?: string; onClick: () => void; children: ReactNode }) {
  return (
    <Toggle
      value={value}
      onClick={onClick}
      style={pressed && color ? { color } : undefined}
      className={`shrink-0 whitespace-nowrap text-s ${pressed ? "" : "text-neutral-7"}`}
    >
      {children}
    </Toggle>
  );
}

type Owner = "provider" | "ours";

interface Step {
  label: string;
  what: string;
  ms: number;
  owner: Owner;
  /** Counts toward the number on the chart. */
  counted: boolean;
}

const ownerFill = (owner: Owner, color: string): CSSProperties =>
  owner === "provider" ? markFill("solid", color) : markFill("striped", "var(--neutral-7)");

function Legend({ color, ours }: { color: string; ours: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-7">
      <span className="flex items-center gap-xs">
        <span aria-hidden className="inline-block size-3 rounded-[2px]" style={markFill("solid", color)} />
        The provider&apos;s time
      </span>
      {ours ? (
        <span className="flex items-center gap-xs">
          <span aria-hidden className="inline-block size-3 rounded-[2px]" style={markFill("striped", "var(--neutral-7)")} />
          Our benchmark or SDK, not the provider
        </span>
      ) : null}
    </div>
  );
}

function Headline({ value, label, sub }: { value: string; label: string; sub: ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs text-neutral-7">{label}</p>
      <p className="mt-xxs font-mono text-xl leading-none tabular-nums">{value}</p>
      <p className="mt-xs text-xs text-neutral-7">{sub}</p>
    </div>
  );
}

/** Steps laid end to end on one time axis, one row each, as a network waterfall draws requests. */
function Waterfall({ steps, color }: { steps: readonly Step[]; color: string }) {
  const total = steps.reduce((sum, s) => sum + s.ms, 0) || 1;
  let at = 0;
  return (
    <ol className="flex flex-col">
      {steps.map((s) => {
        const start = at;
        at += s.ms;
        return (
          <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-s py-2.5">
            <div className="min-w-0">
              <p className="flex items-baseline gap-xs text-s">
                <span className={s.owner === "provider" ? "font-medium" : "text-neutral-7"}>{s.label}</span>
                <span className="text-xxs text-neutral-7">
                  {s.owner === "provider" ? (s.counted ? "provider" : "provider, not counted") : s.counted ? "ours" : "ours, excluded"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-neutral-7">{s.what}</p>
              <div aria-hidden className="relative mt-xs h-2.5 border-l border-neutral-5">
                <div
                  className="absolute inset-y-0"
                  style={{ left: `${(start / total) * 100}%`, width: `max(${(s.ms / total) * 100}%, 2px)`, ...ownerFill(s.owner, color) }}
                />
              </div>
            </div>
            <span className="pt-px text-right font-mono text-xs tabular-nums">{formatMs(s.ms)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h3 className="mb-s text-s font-medium">{title}</h3>
      {children}
    </section>
  );
}

function ColdView({ data, provider }: { data: { n: number; median: ColdPhases }; provider: ProviderId }) {
  const m = data.median;
  const color = providerColor(provider);
  const steps: Step[] = [
    { label: "Create", what: "create() until the provider's API returns a sandbox", ms: m.create, owner: "provider", counted: true },
    { label: "Ownership check", what: "We confirm the sandbox belongs to this run. Paused out of the clock.", ms: m.verify, owner: "ours", counted: false },
    { label: "Journal write", what: "We record the sandbox so cleanup can find it. Paused out of the clock.", ms: m.persist, owner: "ours", counted: false },
    { label: "First command", what: "A bare true command runs in the new sandbox", ms: m.firstCommand, owner: "provider", counted: true },
  ];
  return (
    <>
      <Headline
        label="Cold start, the provider's time"
        value={formatMs(m.create + m.firstCommand)}
        sub={<>Create plus first command. Each part is its median over {data.n} cold starts, so the sum can differ a little from the chart.</>}
      />
      <Legend color={color} ours />
      <Section title="In order, on one time axis">
        <Waterfall steps={steps} color={color} />
      </Section>
    </>
  );
}

function PauseView({ data, provider }: { data: { n: number; median: PausePhases }; provider: ProviderId }) {
  const m = data.median;
  const color = providerColor(provider);
  const steps: Step[] = [
    { label: "Pause", what: "pause() until the provider confirms", ms: m.pause, owner: "provider", counted: true },
    { label: "Resume", what: "resume() until the provider's API returns", ms: m.resume, owner: "provider", counted: true },
    { label: "First command", what: "A bare true command runs in the resumed sandbox", ms: m.firstCommand, owner: "provider", counted: true },
  ];
  return (
    <>
      <Headline
        label="Pause + resume"
        value={formatMs(m.pause + m.resume + m.firstCommand)}
        sub={<>All of it is the provider&apos;s time. The chart&apos;s resume is resume plus first command. Medians over {data.n} attempts.</>}
      />
      <Legend color={color} ours={false} />
      <Section title="In order, on one time axis">
        <Waterfall steps={steps} color={color} />
      </Section>
    </>
  );
}

const opInfo = {
  write: { label: "Write", what: "Write a small file", color: "var(--series-blue)" },
  read: { label: "Read", what: "Read it back", color: "var(--series-green)" },
  edit: { label: "Edit", what: "Find and replace: our SDK reads, then writes, so two calls", color: "var(--series-purple)" },
  ls: { label: "List", what: "List /workspace", color: "var(--series-grey)" },
  grep: { label: "Grep", what: "Run grep through the shell", color: "var(--series-orange)" },
  test: { label: "Test", what: "Run node --test on a small app", color: "var(--series-pink)" },
} as const satisfies Record<ReplayOp, { label: string; what: string; color: string }>;

/** Calls slower than this many times their operation's median are flagged. */
const SLOW = 2;

function ReplayView({ data }: { data: ReplayTrace }) {
  const runTotal = data.sample.reduce((sum, s) => sum + s.ms, 0) || 1;
  const byOp = new Map(data.ops.map((o) => [o.op, o]));
  const counts = new Map(replayOps.map((op) => [op, data.sample.filter((s) => s.op === op).length]));
  const spent = (op: ReplayOp) => data.sample.reduce((sum, s) => (s.op === op ? sum + s.ms : sum), 0);
  const slowest = Math.max(...data.sample.map((s) => s.ms), 1);
  let at = 0;
  return (
    <>
      <Headline
        label="Tool replay, 100 calls in a row"
        value={formatMs(data.totalP50)}
        sub={<>Median total over {data.n} runs. Every call is the provider&apos;s time, reached through our SDK.</>}
      />

      <Section title="The median run, call by call">
        <div aria-hidden className="flex h-5 w-full overflow-hidden rounded-[3px] bg-neutral-3">
          {data.sample.map((s, i) => (
            <span
              key={i}
              className="h-full border-r border-neutral-2 last:border-r-0"
              style={{ width: `${(s.ms / runTotal) * 100}%`, backgroundColor: opInfo[s.op].color }}
            />
          ))}
        </div>
        <ul className="mt-s flex flex-wrap gap-x-m gap-y-1.5 text-xs text-neutral-7">
          {replayOps.map((op) => (
            <li key={op} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ backgroundColor: opInfo[op].color }} />
              {opInfo[op].label} {Math.round((spent(op) / runTotal) * 100)}%
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Median per call">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-xs text-neutral-7">
                <th className="pb-xs font-normal">Operation</th>
                <th className="pb-xs text-right font-normal">Calls</th>
                <th className="pb-xs text-right font-normal">Median</th>
                <th className="pb-xs text-right font-normal">p95</th>
              </tr>
            </thead>
            <tbody>
              {replayOps.map((op) => {
                const o = byOp.get(op);
                if (!o) return null;
                return (
                  <tr key={op} className="align-top">
                    <td className="py-xs pr-s">
                      <span className="flex items-center gap-xs font-medium">
                        <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: opInfo[op].color }} />
                        {opInfo[op].label}
                      </span>
                      <span className="mt-0.5 block pl-[18px] text-xs text-neutral-7">{opInfo[op].what}</span>
                    </td>
                    <td className="py-xs text-right font-mono tabular-nums text-neutral-7">{counts.get(op)}</td>
                    <td className="py-xs pl-s text-right font-mono whitespace-nowrap tabular-nums">{formatMs(o.p50)}</td>
                    <td className="py-xs pl-s text-right font-mono whitespace-nowrap tabular-nums text-neutral-7">{formatMs(o.p95)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-xs text-xs text-neutral-7">Median and p95 over every call of that kind in all {data.n} runs.</p>
      </Section>

      <Section title="Every call in the median run">
        <ol className="flex flex-col text-xs">
          {data.sample.map((s, i) => {
            const start = at;
            at += s.ms;
            const typical = byOp.get(s.op)?.p50 ?? s.ms;
            const slow = s.ms > SLOW * typical;
            return (
              <li key={i} className="grid h-7 grid-cols-[2rem_3.25rem_minmax(0,1fr)_4.5rem] items-center gap-x-xs">
                <span className="font-mono text-xxs text-neutral-7 tabular-nums">{i + 1}</span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: opInfo[s.op].color }} />
                  {opInfo[s.op].label}
                </span>
                <span className="relative h-2 min-w-0" title={`starts at ${formatMs(start)}`}>
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-r-[2px]"
                    style={{ width: `max(${(s.ms / slowest) * 100}%, 2px)`, backgroundColor: opInfo[s.op].color, opacity: slow ? 1 : 0.7 }}
                  />
                </span>
                <span className={`text-right font-mono tabular-nums ${slow ? "text-warning" : ""}`}>
                  {formatMs(s.ms)}
                  {slow ? <span className="sr-only">, over {SLOW} times the median {opInfo[s.op].label.toLowerCase()}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-xs text-xs text-neutral-7">
          Bars are scaled to the slowest call. Times in <span className="text-warning">amber</span> took over {SLOW}× their operation&apos;s median.
        </p>
      </Section>
    </>
  );
}
