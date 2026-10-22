import { providerTrace, replayOps } from "@/lib/traces";
import type { ReplayOp, TraceKind } from "@/lib/traces";
import type { ProviderId } from "@/lib/providers";
import type { TrackId } from "@/lib/tracks";

/**
 * Turns a provider's median phases into the span tree the trace waterfall
 * draws. Provider spans are the provider's own time; ours are our Sandbox SDK,
 * drawn grey.
 */

export type SpanOwner = "provider" | "ours";

export type SpanIcon = "create" | "command" | "pause" | "resume" | "sdk" | "trace" | "group" | ReplayOp;

export interface Span {
  id: string;
  name: string;
  sub: string;
  icon: SpanIcon;
  owner: SpanOwner;
  start: number;
  ms: number;
  /** Share of the task's cost, when the trace is the costed task. */
  usd: number | null;
  children: readonly Span[];
}

export interface Trace {
  kind: TraceKind;
  title: string;
  /** What a sample is, for the stat strip: "median of 100 starts". */
  basis: string;
  total: number;
  /** Provider-owned time inside total. */
  providerMs: number;
  calls: number;
  root: Span;
}

const leaf = (s: Omit<Span, "children" | "usd"> & { usd?: number | null }): Span => ({ usd: null, ...s, children: [] });

/** Lays phases end to end from `at`. */
function chain(at: number, phases: readonly Omit<Span, "children" | "usd" | "start">[]): Span[] {
  let t = at;
  return phases.map((p) => {
    const s = leaf({ ...p, start: t });
    t += p.ms;
    return s;
  });
}

const sumMs = (spans: readonly Span[]) => spans.reduce((a, s) => a + s.ms, 0);
const extent = (spans: readonly Span[]) => {
  const start = Math.min(...spans.map((s) => s.start));
  return { start, ms: Math.max(...spans.map((s) => s.start + s.ms)) - start };
};

const opInfo = {
  write: { name: "write", sub: "writeFile" },
  read: { name: "read", sub: "readFile" },
  edit: { name: "edit", sub: "read + write" },
  ls: { name: "list", sub: "ls -la" },
  grep: { name: "grep", sub: "search tree" },
  test: { name: "test", sub: "run tests" },
} as const satisfies Record<ReplayOp, { name: string; sub: string }>;

export function buildTrace({ track, provider, kind, costUsd }: { track: TrackId; provider: ProviderId; kind: TraceKind; costUsd: number | null }): Trace | null {
  const t = providerTrace(track, provider);
  if (!t) return null;
  switch (kind) {
    case "cold": {
      if (!t.cold) return null;
      const m = t.cold.median;
      // Our ownership check and journal write sit between create and the first
      // command in the raw run. No published number includes them, so the trace
      // leaves them out and the view says so in a footnote.
      const [create, first, sdk] = chain(0, [
        { id: "create", name: "create()", sub: "provider API", icon: "create", owner: "provider", ms: m.create },
        { id: "first", name: "First command", sub: "echo ok", icon: "command", owner: "provider", ms: m.firstCommand },
        { id: "sdk", name: "SDK setup", sub: "Sandbox SDK", icon: "sdk", owner: "ours", ms: m.sdkSetup },
      ]);
      if (!create || !first || !sdk) return null;
      const children = [create, first, sdk];
      const total = sumMs(children);
      return {
        kind,
        title: "Cold start",
        basis: `median of ${t.cold.n} starts`,
        total,
        providerMs: create.ms + first.ms,
        calls: 3,
        root: { id: "root", name: "Cold start", sub: "create → ready", icon: "trace", owner: "provider", start: 0, ms: total, usd: null, children },
      };
    }
    case "pause": {
      if (!t.pause) return null;
      const m = t.pause.median;
      const children = chain(0, [
        { id: "pause", name: "pause()", sub: "provider API", icon: "pause", owner: "provider", ms: m.pause },
        { id: "resume", name: "resume()", sub: "provider API", icon: "resume", owner: "provider", ms: m.resume },
        { id: "first", name: "First command", sub: "after resume", icon: "command", owner: "provider", ms: m.firstCommand },
      ]);
      const total = sumMs(children);
      return {
        kind,
        title: "Pause + resume",
        basis: `median of ${t.pause.n} cycles`,
        total,
        providerMs: total,
        calls: children.length,
        root: { id: "root", name: "Pause + resume", sub: "state kept", icon: "trace", owner: "provider", start: 0, ms: total, usd: null, children },
      };
    }
    case "replay": {
      if (!t.replay) return null;
      const calls = chain(
        0,
        t.replay.sample.map((s, i) => ({ id: `call-${i}`, name: `${opInfo[s.op].name} #${i + 1}`, sub: opInfo[s.op].sub, icon: s.op, owner: "provider", ms: s.ms })),
      );
      const total = sumMs(calls);
      const share = (ms: number) => (costUsd === null || total === 0 ? null : (costUsd * ms) / total);
      const priced = calls.map((c) => ({ ...c, usd: share(c.ms) }));
      const groups: Span[] = replayOps.flatMap((op) => {
        const mine = priced.filter((c) => c.icon === op);
        if (mine.length === 0) return [];
        const ms = sumMs(mine);
        return [{ id: op, name: opInfo[op].name, sub: opInfo[op].sub, icon: op, owner: "provider", start: extent(mine).start, ms, usd: share(ms), children: mine }];
      });
      return {
        kind,
        title: "Tool replay",
        basis: `median of ${t.replay.n} runs`,
        total,
        providerMs: total,
        calls: calls.length,
        root: { id: "root", name: "Tool replay", sub: `${calls.length} calls`, icon: "trace", owner: "provider", start: 0, ms: total, usd: costUsd, children: groups },
      };
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Every leaf under a span: the spans the SLOWEST badge is chosen from. */
export const leaves = (s: Span): Span[] => (s.children.length === 0 ? [s] : s.children.flatMap(leaves));

/**
 * The extent a group's bar draws. Replay groups interleave, so their bar
 * spans first call to last call while their label carries summed time.
 */
export const spanExtent = (s: Span) => (s.children.length === 0 ? { start: s.start, ms: s.ms } : extent(leaves(s)));

/** One provider's row in the all-providers view: its trace's top-level steps, end to end. */
export interface CompareRow {
  provider: ProviderId;
  /** Provider-owned time, the number rows are ranked by. */
  providerMs: number;
  total: number;
  steps: readonly { id: string; name: string; owner: SpanOwner; ms: number }[];
}

/** Every provider with this trace, fastest provider time first. */
export function compareTrace(track: TrackId, kind: TraceKind, providers: readonly ProviderId[]): CompareRow[] {
  return providers
    .flatMap((provider) => {
      const trace = buildTrace({ track, provider, kind, costUsd: null });
      if (!trace) return [];
      const steps = trace.root.children.map((c) => ({ id: c.id, name: c.name, owner: c.owner, ms: c.ms }));
      return [{ provider, providerMs: trace.providerMs, total: trace.total, steps }];
    })
    .sort((a, b) => a.providerMs - b.providerMs);
}
