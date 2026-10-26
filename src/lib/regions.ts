import regionalExport from "@/data/regions.default.json";

import { formatValue } from "@/lib/format";
import type { Unit } from "@/lib/format";
import { isProviderId, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { isTrackId } from "@/lib/tracks";
import type { TrackId } from "@/lib/tracks";

/**
 * Results of the same benchmark run from several client locations
 * ("vantage points"), a separate and smaller collection than the headline
 * run. This is the boundary: regions.default.json is the `RegionalSiteData`
 * export of the regional runner (SBX-65), checked here at build time and
 * parsed into the model below. Values come out in display units: the export
 * stores latency in ms, and each metric's `scale` turns it into the unit the
 * page prints. Rows for providers the site does not know are left out.
 */

export type RegionId = string & { readonly __brand: "RegionId" };

/**
 * Where a metric's time goes. `vantage`: every call crosses the network from
 * the benchmark client, so its location changes the result. `invariant`: the
 * work runs inside the sandbox, so the client's location should not matter.
 */
export type Sensitivity = "vantage" | "invariant";

export interface Vantage {
  id: RegionId;
  label: string;
  city: string | null;
  country: string | null;
  /** The network the runner's IP belongs to: "OVH SAS". */
  network: string | null;
  host: { provider: string; location: string; serverType: string | null } | null;
  runs: number;
}

export interface RegionMetric {
  id: string;
  label: string;
  unit: Unit;
  better: "lower" | "higher";
  sensitivity: Sensitivity;
}

/** One provider, metric and location. `p50` and `p95` are in the metric's display unit. */
export interface RegionCell {
  n: number;
  failures: number;
  p50: number;
  p95: number | null;
}

export interface RegionRow {
  provider: ProviderId;
  metric: string;
  cells: ReadonlyMap<RegionId, RegionCell>;
}

export interface RoundTrip {
  region: RegionId;
  provider: ProviderId;
  tcpMs: number | null;
  firstByteMs: number | null;
}

export interface RegionalData {
  batchId: string;
  commit: string;
  track: TrackId;
  window: { start: string; end: string };
  /** Vantage points with results, in display order. */
  regions: readonly Vantage[];
  /** Vantage points known but not measured yet. */
  planned: readonly { id: RegionId; label: string }[];
  metrics: readonly RegionMetric[];
  rows: readonly RegionRow[];
  rtt: readonly RoundTrip[];
  /** Providers with at least one regional result, in the site's provider order. */
  providers: readonly ProviderId[];
}

// A small hand-written parser: the site has no schema library, and this is its only untyped input.

class ShapeError extends Error {}

type Obj = { readonly [key: string]: unknown };

const fail = (path: string, want: string): never => {
  throw new ShapeError(`regions.default.json: ${path} should be ${want}`);
};
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, "an object"));
const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, "an array"));
const str = (v: unknown, path: string): string => (typeof v === "string" ? v : fail(path, "a string"));
const num = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(path, "a number"));
const count = (v: unknown, path: string): number => (Number.isInteger(v) && typeof v === "number" && v >= 0 ? v : fail(path, "a whole number, 0 or more"));
const positiveCount = (v: unknown, path: string): number => (count(v, path) > 0 ? count(v, path) : fail(path, "a whole number, 1 or more"));
const positive = (v: unknown, path: string): number => (num(v, path) > 0 ? num(v, path) : fail(path, "a number above 0"));
const nonNegative = (v: unknown, path: string): number => (num(v, path) >= 0 ? num(v, path) : fail(path, "a number, 0 or more"));
/** An ISO timestamp, returned as given and as epoch ms. */
const instant = (v: unknown, path: string) => {
  const text = str(v, path);
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? fail(path, "an ISO timestamp") : { text, ms };
};
/** Fails when `key` was already seen, naming where it first appeared. */
const unique = (seen: Map<string, string>, key: string, path: string, what: string) => {
  const first = seen.get(key);
  if (first !== undefined) fail(path, `${what} not already used by ${first}`);
  seen.set(key, path);
};
const nullable = <T>(read: (v: unknown, path: string) => T) => (v: unknown, path: string): T | null => (v === null || v === undefined ? null : read(v, path));
const oneOf = <const T extends string>(options: readonly T[]) => (v: unknown, path: string): T => {
  const found = options.find((o) => o === v);
  return found ?? fail(path, options.join(" or "));
};

const units = ["s", "ms", "ops/s", "MB/s", "IOPS"] as const satisfies readonly Unit[];
const regionId = (v: unknown, path: string) => str(v, path) as RegionId;

export function parseRegional(raw: unknown): RegionalData {
  const root = obj(raw, "root");
  if (root.schemaVersion !== 1) fail("schemaVersion", "1");
  const trackRaw = str(root.track, "track");
  const track = isTrackId(trackRaw) ? trackRaw : fail("track", "a track id");
  const windowRaw = obj(root.window, "window");
  const start = instant(windowRaw.start, "window.start");
  const end = instant(windowRaw.end, "window.end");
  if (end.ms < start.ms) fail("window.end", "at or after window.start");
  const regionIds = new Map<string, string>();

  const regions = arr(root.regions, "regions").map((v, i): Vantage => {
    const r = obj(v, `regions[${i}]`);
    const host = nullable(obj)(r.host, `regions[${i}].host`);
    const id = regionId(r.id, `regions[${i}].id`);
    unique(regionIds, id, `regions[${i}].id`, "a region id");
    return {
      id,
      label: str(r.label, `regions[${i}].label`),
      city: nullable(str)(r.city, `regions[${i}].city`),
      country: nullable(str)(r.country, `regions[${i}].country`),
      network: nullable(str)(r.network, `regions[${i}].network`),
      host: host
        ? { provider: str(host.provider, `regions[${i}].host.provider`), location: str(host.location, `regions[${i}].host.location`), serverType: nullable(str)(host.serverType, `regions[${i}].host.serverType`) }
        : null,
      runs: count(r.runs, `regions[${i}].runs`),
    };
  });
  const known = new Set<string>(regions.map((r) => r.id));
  const planned = arr(root.plannedRegions, "plannedRegions").map((v, i) => {
    const r = obj(v, `plannedRegions[${i}]`);
    const id = regionId(r.id, `plannedRegions[${i}].id`);
    unique(regionIds, id, `plannedRegions[${i}].id`, "a region id");
    return { id, label: str(r.label, `plannedRegions[${i}].label`) };
  });

  const scales = new Map<string, number>();
  const metricIds = new Map<string, string>();
  const metrics = arr(root.metrics, "metrics").map((v, i): RegionMetric => {
    const m = obj(v, `metrics[${i}]`);
    const id = str(m.id, `metrics[${i}].id`);
    unique(metricIds, id, `metrics[${i}].id`, "a metric id");
    scales.set(id, positive(m.scale, `metrics[${i}].scale`));
    return {
      id,
      label: str(m.label, `metrics[${i}].label`),
      unit: oneOf(units)(m.unit, `metrics[${i}].unit`),
      better: oneOf(["lower", "higher"] as const)(m.better, `metrics[${i}].better`),
      sensitivity: oneOf(["vantage", "invariant"] as const)(m.sensitivity, `metrics[${i}].sensitivity`),
    };
  });

  const rowKeys = new Map<string, string>();
  const rows = arr(root.rows, "rows").flatMap((v, i): RegionRow[] => {
    const r = obj(v, `rows[${i}]`);
    const provider = str(r.provider, `rows[${i}].provider`);
    const metric = str(r.metric, `rows[${i}].metric`);
    const scale = scales.get(metric) ?? fail(`rows[${i}].metric`, "a metric listed in metrics");
    unique(rowKeys, `${provider} ${metric}`, `rows[${i}]`, "a provider and metric pair");
    if (!isProviderId(provider)) return [];
    const cells = new Map<RegionId, RegionCell>();
    for (const [region, c] of Object.entries(obj(r.cells, `rows[${i}].cells`))) {
      const path = `rows[${i}].cells.${region}`;
      if (!known.has(region)) fail(path, "a cell for a region listed in regions");
      const cell = obj(c, path);
      const p95 = nullable(nonNegative)(cell.p95, `${path}.p95`);
      cells.set(regionId(region, path), {
        n: positiveCount(cell.n, `${path}.n`),
        failures: count(cell.failures, `${path}.failures`),
        p50: nonNegative(cell.p50, `${path}.p50`) * scale,
        p95: p95 === null ? null : p95 * scale,
      });
    }
    return cells.size > 0 ? [{ provider, metric, cells }] : [];
  });

  const rttKeys = new Map<string, string>();
  const rtt = arr(root.rtt, "rtt").flatMap((v, i): RoundTrip[] => {
    const r = obj(v, `rtt[${i}]`);
    const provider = str(r.provider, `rtt[${i}].provider`);
    const region = regionId(r.region, `rtt[${i}].region`);
    if (!known.has(region)) fail(`rtt[${i}].region`, "a region listed in regions");
    unique(rttKeys, `${region} ${provider}`, `rtt[${i}]`, "a region and provider pair");
    if (!isProviderId(provider)) return [];
    return [{ region, provider, tcpMs: nullable(nonNegative)(r.tcpMs, `rtt[${i}].tcpMs`), firstByteMs: nullable(nonNegative)(r.firstByteMs, `rtt[${i}].firstByteMs`) }];
  });

  const measured = new Set<ProviderId>(rows.map((r) => r.provider));
  return {
    batchId: str(root.batchId, "batchId"),
    commit: str(root.commit, "commit"),
    track,
    window: { start: start.text, end: end.text },
    regions,
    planned,
    // Only metrics with a row, so no column is empty.
    metrics: metrics.filter((m) => rows.some((r) => r.metric === m.id)),
    rows,
    rtt,
    providers: Object.keys(providerInfo).filter(isProviderId).filter((id) => measured.has(id)),
  };
}

export const regional: RegionalData = parseRegional(regionalExport);

export const rowOf = (data: RegionalData, provider: ProviderId, metric: string) => data.rows.find((r) => r.provider === provider && r.metric === metric);

/**
 * Two locations count as tied when the slower one is under 5% behind. The
 * medians come from a handful of runs, so a smaller gap says nothing about
 * which location is faster, and 5% is wider than the two-digit precision the
 * page prints most values at.
 */
export const TIE_RATIO = 1.05;

/** How many times worse `worse` is than `better`, by the metric's direction. Undefined (null) when it would divide by zero. */
function ratioOf(metric: RegionMetric, better: RegionCell, worse: RegionCell): number | null {
  const [top, bottom] = metric.better === "lower" ? [worse.p50, better.p50] : [better.p50, worse.p50];
  return bottom > 0 ? top / bottom : null;
}

/**
 * Where one provider did best on one test. `fastest` holds every location
 * within TIE_RATIO of the best, best first, so more than one entry means a
 * tie. `spread` is how far the worst location is behind the best: 1.7 means
 * it takes 1.7 times as long (or does 1/1.7 the work). It is null when only
 * one location measured the test, or when a zero median makes it undefined.
 */
export interface Standing {
  fastest: readonly [RegionId, ...RegionId[]];
  cell: RegionCell;
  locations: number;
  spread: number | null;
}

export function standingOf(row: RegionRow, metric: RegionMetric): Standing | null {
  const sorted = [...row.cells].sort(([, a], [, b]) => (metric.better === "lower" ? a.p50 - b.p50 : b.p50 - a.p50));
  const [best, ...rest] = sorted;
  if (!best) return null;
  const worst = rest.at(-1);
  const tied = rest.flatMap(([id, c]) => {
    const r = ratioOf(metric, best[1], c);
    return r !== null && r < TIE_RATIO ? [id] : [];
  });
  return { fastest: [best[0], ...tied], cell: best[1], locations: sorted.length, spread: worst ? ratioOf(metric, best[1], worst[1]) : null };
}

/**
 * How one location differs from another, in a form a reader can weigh:
 * time in ms or s, throughput as a percentage, since a raw "+3.1M ops/s"
 * means little. A percentage of a zero baseline is undefined, so that case
 * falls back to the absolute difference rather than a made-up ±0%.
 */
export type Delta = { kind: "time"; ms: number } | { kind: "percent"; value: number } | { kind: "absolute"; value: number; unit: Unit };

export function deltaOf(metric: RegionMetric, a: RegionCell, b: RegionCell): Delta {
  switch (metric.unit) {
    case "s":
      return { kind: "time", ms: (a.p50 - b.p50) * 1000 };
    case "ms":
      return { kind: "time", ms: a.p50 - b.p50 };
    case "ops/s":
    case "MB/s":
    case "IOPS":
      return b.p50 === 0 ? { kind: "absolute", value: a.p50 - b.p50, unit: metric.unit } : { kind: "percent", value: a.p50 / b.p50 - 1 };
    default: {
      const _exhaustive: never = metric.unit;
      return _exhaustive;
    }
  }
}

// A difference that rounds to zero gets "±", so "−0.0 ms" never shows.
const signed = (text: string, v: number) => `${Number.parseFloat(text) === 0 ? "±" : v > 0 ? "+" : v < 0 ? "−" : "±"}${text}`;

/** "+490 ms", "−16.7 s", "+12%", "+3.1M/s". */
export function formatDelta(d: Delta) {
  switch (d.kind) {
    case "time": {
      const abs = Math.abs(d.ms);
      const text = abs < 1000 ? `${abs.toFixed(abs < 10 ? 1 : 0)} ms` : `${(abs / 1000).toFixed(abs < 10_000 ? 2 : 1)} s`;
      return signed(text, d.ms);
    }
    case "percent":
      return signed(`${Math.abs(d.value * 100).toFixed(0)}%`, d.value);
    case "absolute":
      return signed(formatValue(Math.abs(d.value), d.unit), d.value);
    default: {
      const _exhaustive: never = d;
      return _exhaustive;
    }
  }
}

/** Whether a delta favours the first location, by the metric's own direction. */
export const deltaFavoursFirst = (metric: RegionMetric, d: Delta) => {
  const v = d.kind === "time" ? d.ms : d.value;
  return metric.better === "lower" ? v < 0 : v > 0;
};

/** Smallest and largest sample per cell, for "2 to 3 runs per test". */
export function sampleRange(data: RegionalData): { min: number; max: number } | null {
  const ns = data.rows.flatMap((r) => [...r.cells.values()].map((c) => c.n));
  return ns.length ? { min: Math.min(...ns), max: Math.max(...ns) } : null;
}

/** The middle of a list, for "typical gap between locations". */
export function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2;
}
