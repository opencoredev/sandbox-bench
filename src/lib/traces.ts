import defaultTraces from "@/data/traces.default.json";
import sameSpecTraces from "@/data/traces.same-spec.json";

import type { ColdPhases, PausePhases, TraceProviderExport, TracesExport } from "@/lib/inputs";
import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import type { TrackId } from "@/lib/tracks";

/**
 * Where each provider's time goes, behind the cold start, pause and tool
 * replay charts. Parsed from traces.<track>.json (scripts/site-traces.ts).
 * Kept apart from data.ts so the breakdown panel, a client component, only
 * bundles these small files.
 */

/** The charts a column can open a breakdown from. */
export type TraceKind = "cold" | "pause" | "replay";
export const traceKinds = ["cold", "pause", "replay"] as const satisfies readonly TraceKind[];
export const isTraceKind = (value: string): value is TraceKind => (traceKinds as readonly string[]).includes(value);

/** The replay's operations, in the order bench/src/workloads.ts runs them. */
export const replayOps = ["write", "read", "edit", "ls", "grep", "test"] as const;
export type ReplayOp = (typeof replayOps)[number];
const isReplayOp = (value: string): value is ReplayOp => (replayOps as readonly string[]).includes(value);

export interface ReplayTrace {
  n: number;
  totalP50: number;
  ops: readonly { op: ReplayOp; n: number; p50: number; p95: number }[];
  /** The attempt with the median total, step by step. */
  sample: readonly { op: ReplayOp; ms: number }[];
}

export interface ProviderTrace {
  cold: { n: number; median: ColdPhases } | null;
  pause: { n: number; median: PausePhases } | null;
  replay: ReplayTrace | null;
}

function parseReplay(r: TraceProviderExport["replay"]): ReplayTrace | null {
  if (!r) return null;
  return {
    n: r.n,
    totalP50: r.totalP50,
    ops: r.ops.flatMap((o) => (isReplayOp(o.op) ? [{ ...o, op: o.op }] : [])),
    sample: r.sample.flatMap((s) => (isReplayOp(s.op) ? [{ op: s.op, ms: s.ms }] : [])),
  };
}

function parse(id: TrackId, raw: TracesExport) {
  if (raw.track !== id) throw new Error(`Traces for ${id} hold track ${raw.track}`);
  const out: Partial<Record<ProviderId, ProviderTrace>> = {};
  for (const p of raw.providers) {
    if (isProviderId(p.id)) out[p.id] = { cold: p.cold, pause: p.pauseResume, replay: parseReplay(p.replay) };
  }
  return { generatedFrom: raw.generatedFrom, providers: out };
}

export const traces: Record<TrackId, ReturnType<typeof parse>> = {
  default: parse("default", defaultTraces satisfies TracesExport),
  "same-spec": parse("same-spec", sameSpecTraces satisfies TracesExport),
};

export const providerTrace = (track: TrackId, provider: ProviderId) => traces[track].providers[provider];

/** Whether a column for this provider can open a breakdown of this kind. */
export function hasTrace(track: TrackId, kind: TraceKind, provider: ProviderId) {
  const t = providerTrace(track, provider);
  if (!t) return false;
  switch (kind) {
    case "cold":
      return t.cold !== null;
    case "pause":
      return t.pause !== null;
    case "replay":
      return t.replay !== null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
