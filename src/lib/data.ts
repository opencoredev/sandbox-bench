import defaultExport from "@/data/benchmark.default.json";
import sameSpecExport from "@/data/benchmark.same-spec.json";
import defaultExtras from "@/data/extras.default.json";
import sameSpecExtras from "@/data/extras.same-spec.json";

import type { Unit } from "@/lib/format";
import type { ExtrasExport, ExtrasProviderExport, SiteExport, SiteProviderExport } from "@/lib/inputs";
import { isProviderId, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { trackIds } from "@/lib/tracks";
import type { TrackId } from "@/lib/tracks";

/**
 * The benchmark data the page and the agent files read, one dataset per
 * track. This is the boundary: the JSON files are checked against the export
 * types in inputs.ts at compile time and parsed into the model below, without
 * the local Docker baseline (the site only compares providers someone can sign
 * up for). Regenerate the files with the commands in inputs.ts.
 */

export { isTrackId, trackIds, trackInfo } from "@/lib/tracks";
export type { TrackId } from "@/lib/tracks";

export interface Allocation {
  cpu: number;
  memoryGiB: number;
  diskGiB: number;
}

export type Provider = Omit<SiteProviderExport, "id" | "track" | "currency" | "costPerTask"> & {
  id: ProviderId;
  currency: "USD" | "EUR" | null;
};

export interface MetricValue {
  provider: ProviderId;
  n: number;
  p50: number | null;
  p95: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  failures: number;
  ourFailures: number;
  limitFailures: number;
  blocked?: number;
  blockedNote?: string;
}

export interface Metric {
  id: string;
  label: string;
  unit: Unit;
  better: "lower" | "higher";
  values: readonly MetricValue[];
}

/**
 * What one task cost: create a sandbox, run the 100-call tool replay, delete
 * it. Billed and metered come from the provider's billing per sandbox; an
 * estimate is list price, where the provider has no billing amount.
 */
export type TaskCost =
  | { kind: "billed" | "metered" | "estimate"; usd: number; n: number; confidence: "high" | "medium" | "low" | null; source: string | null }
  | { kind: "none"; why: string };

export type SdkReady = NonNullable<ExtrasProviderExport["sdkReady"]>;

export interface Track {
  id: TrackId;
  providers: readonly Provider[];
  metric: (id: string) => Metric;
  coldSamples: Partial<Record<ProviderId, readonly number[]>>;
  window: { start: string; end: string };
  runs: readonly { id: string; suite: string; samples: number }[];
  /** The harness run the data came from. */
  generatedFrom: string;
  /** Source runs discarded in full, with why. */
  excludedRuns: readonly { runId: string; reason: string }[];
  /** Every timed operation against the providers on the page, failures included. */
  timedOperations: number;
  costs: Partial<Record<ProviderId, TaskCost>>;
  sdkReady: Partial<Record<ProviderId, SdkReady>>;
  /** Providers in another track that this one leaves out. */
  absent: readonly ProviderId[];
  /** Where a chart's data comes from when it is not the track's main run, keyed by metric id or "cost". */
  sourceNotes: Readonly<Record<string, string>>;
  /** Why a provider has no result on a chart, from the data, keyed by metric id then provider. */
  missing: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Built from the local preview fixture: never real numbers. */
  preview: boolean;
}

const units = ["s", "ms", "ops/s", "MB/s", "IOPS"] as const satisfies readonly Unit[];
const isUnit = (u: string): u is Unit => (units as readonly string[]).includes(u);
const isBetter = (b: string): b is Metric["better"] => b === "lower" || b === "higher";
const toCurrency = (c: string | null) => (c === "USD" || c === "EUR" ? c : null);
const toConfidence = (c: string | null) => (c === "high" || c === "medium" || c === "low" ? c : null);
const costKinds = ["billed", "metered", "estimate"] as const;
const isCostKind = (k: string): k is (typeof costKinds)[number] => (costKinds as readonly string[]).includes(k);

/**
 * The one place that reads cost per task from an export. Only the cost
 * suite's per-task result counts: whole benchmark sandboxes ran different
 * scenarios per provider, so their bills are not comparable and are never used.
 */
function readCostPerTask(p: SiteProviderExport): TaskCost {
  const c = p.costPerTask;
  if (c === undefined || c === null || c.usd === null || c.n === 0) return { kind: "none", why: "coming in the next update" };
  if (!isCostKind(c.kind)) return { kind: "none", why: `unknown cost kind "${c.kind}"` };
  return { kind: c.kind, usd: c.usd, n: c.n, confidence: toConfidence(c.confidence), source: c.source };
}

function parseProvider(p: SiteProviderExport): Provider[] {
  if (!isProviderId(p.id)) return [];
  const { track: _track, costPerTask: _cost, ...rest } = p;
  return [{ ...rest, id: p.id, currency: toCurrency(p.currency) }];
}

function parseTrack(id: TrackId, raw: SiteExport, extras: ExtrasExport): Omit<Track, "absent"> {
  if (raw.track !== id || extras.track !== id) throw new Error(`Data for ${id} holds track ${raw.track} / ${extras.track}`);
  const providers = raw.providers.flatMap(parseProvider);
  const metrics: Metric[] = raw.metrics.flatMap((m) =>
    isUnit(m.unit) && isBetter(m.better)
      ? [{ id: m.id, label: m.label, unit: m.unit, better: m.better, values: m.values.flatMap((v) => (isProviderId(v.provider) ? [{ ...v, provider: v.provider }] : [])) }]
      : [],
  );
  const metric = (metricId: string) => {
    const found = metrics.find((m) => m.id === metricId);
    if (!found) throw new Error(`Unknown metric ${metricId}`);
    return found;
  };
  const extra = (pid: ProviderId) => extras.providers.find((e) => e.id === pid);
  const timedOperations = metrics.reduce((sum, m) => sum + m.values.reduce((s, v) => s + v.n + v.failures, 0), 0);
  return {
    id,
    providers,
    metric,
    coldSamples: Object.fromEntries(Object.entries(raw.coldSamples).filter(([pid]) => isProviderId(pid))),
    window: raw.window,
    runs: raw.runs,
    generatedFrom: raw.generatedFrom,
    excludedRuns: raw.excluded,
    timedOperations,
    costs: Object.fromEntries(raw.providers.flatMap((p) => (isProviderId(p.id) ? [[p.id, readCostPerTask(p)]] : []))),
    sdkReady: Object.fromEntries(providers.flatMap((p) => { const s = extra(p.id)?.sdkReady; return s ? [[p.id, s]] : []; })),
    preview: raw.generatedFrom.startsWith("preview-fixture"),
    sourceNotes: raw.sourceNotes ?? {},
    missing: raw.missing ?? {},
  };
}

const parsed = {
  default: parseTrack("default", defaultExport satisfies SiteExport, defaultExtras satisfies ExtrasExport),
  "same-spec": parseTrack("same-spec", sameSpecExport satisfies SiteExport, sameSpecExtras satisfies ExtrasExport),
};

// Every provider the site covers, so one missing from a track's data is named as absent, not silently dropped.
const everyone = new Set<ProviderId>(Object.keys(providerInfo).filter(isProviderId));

export const tracks: Record<TrackId, Track> = {
  default: { ...parsed.default, absent: [...everyone].filter((pid) => !parsed.default.providers.some((p) => p.id === pid)) },
  "same-spec": { ...parsed["same-spec"], absent: [...everyone].filter((pid) => !parsed["same-spec"].providers.some((p) => p.id === pid)) },
};

/** Tracks with results, in page order. A track collected later shows a placeholder until then. */
export const hasResults = (t: Track) => t.providers.length > 0;

/** Every provider on the site, in the fixed order of providerInfo. */
export const allProviders = Object.keys(providerInfo).filter(isProviderId).filter((pid) => everyone.has(pid));

export const isPreview = trackIds.some((t) => tracks[t].preview);

export const provider = (t: Track, id: ProviderId) => t.providers.find((p) => p.id === id);
