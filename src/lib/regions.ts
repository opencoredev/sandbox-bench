import regionalExport from "@/data/regions.default.json";

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
const nullable = <T>(read: (v: unknown, path: string) => T) => (v: unknown, path: string): T | null => (v === null || v === undefined ? null : read(v, path));
const oneOf = <const T extends string>(options: readonly T[]) => (v: unknown, path: string): T => {
  const found = options.find((o) => o === v);
  return found ?? fail(path, options.join(" or "));
};

const units = ["s", "ms", "ops/s", "MB/s", "IOPS"] as const satisfies readonly Unit[];
const regionId = (v: unknown, path: string) => str(v, path) as RegionId;

function parse(raw: unknown): RegionalData {
  const root = obj(raw, "root");
  if (root.schemaVersion !== 1) fail("schemaVersion", "1");
  const trackRaw = str(root.track, "track");
  const track = isTrackId(trackRaw) ? trackRaw : fail("track", "a track id");
  const window = obj(root.window, "window");

  const regions = arr(root.regions, "regions").map((v, i): Vantage => {
    const r = obj(v, `regions[${i}]`);
    const host = nullable(obj)(r.host, `regions[${i}].host`);
    return {
      id: regionId(r.id, `regions[${i}].id`),
      label: str(r.label, `regions[${i}].label`),
      city: nullable(str)(r.city, `regions[${i}].city`),
      country: nullable(str)(r.country, `regions[${i}].country`),
      network: nullable(str)(r.network, `regions[${i}].network`),
      host: host
        ? { provider: str(host.provider, `regions[${i}].host.provider`), location: str(host.location, `regions[${i}].host.location`), serverType: nullable(str)(host.serverType, `regions[${i}].host.serverType`) }
        : null,
      runs: num(r.runs, `regions[${i}].runs`),
    };
  });
  const known = new Set<string>(regions.map((r) => r.id));
  const planned = arr(root.plannedRegions, "plannedRegions").map((v, i) => {
    const r = obj(v, `plannedRegions[${i}]`);
    return { id: regionId(r.id, `plannedRegions[${i}].id`), label: str(r.label, `plannedRegions[${i}].label`) };
  });

  const scales = new Map<string, number>();
  const metrics = arr(root.metrics, "metrics").map((v, i): RegionMetric => {
    const m = obj(v, `metrics[${i}]`);
    const id = str(m.id, `metrics[${i}].id`);
    scales.set(id, num(m.scale, `metrics[${i}].scale`));
    return {
      id,
      label: str(m.label, `metrics[${i}].label`),
      unit: oneOf(units)(m.unit, `metrics[${i}].unit`),
      better: oneOf(["lower", "higher"] as const)(m.better, `metrics[${i}].better`),
      sensitivity: oneOf(["vantage", "invariant"] as const)(m.sensitivity, `metrics[${i}].sensitivity`),
    };
  });

  const rows = arr(root.rows, "rows").flatMap((v, i): RegionRow[] => {
    const r = obj(v, `rows[${i}]`);
    const provider = str(r.provider, `rows[${i}].provider`);
    const metric = str(r.metric, `rows[${i}].metric`);
    const scale = scales.get(metric) ?? fail(`rows[${i}].metric`, "a metric listed in metrics");
    if (!isProviderId(provider)) return [];
    const cells = new Map<RegionId, RegionCell>();
    for (const [region, c] of Object.entries(obj(r.cells, `rows[${i}].cells`))) {
      const path = `rows[${i}].cells.${region}`;
      if (!known.has(region)) fail(path, "a cell for a region listed in regions");
      const cell = obj(c, path);
      const p95 = nullable(num)(cell.p95, `${path}.p95`);
      cells.set(regionId(region, path), {
        n: num(cell.n, `${path}.n`),
        failures: num(cell.failures, `${path}.failures`),
        p50: num(cell.p50, `${path}.p50`) * scale,
        p95: p95 === null ? null : p95 * scale,
      });
    }
    return cells.size > 0 ? [{ provider, metric, cells }] : [];
  });

  const rtt = arr(root.rtt, "rtt").flatMap((v, i): RoundTrip[] => {
    const r = obj(v, `rtt[${i}]`);
    const provider = str(r.provider, `rtt[${i}].provider`);
    if (!isProviderId(provider)) return [];
    return [{ region: regionId(r.region, `rtt[${i}].region`), provider, tcpMs: nullable(num)(r.tcpMs, `rtt[${i}].tcpMs`), firstByteMs: nullable(num)(r.firstByteMs, `rtt[${i}].firstByteMs`) }];
  });

  const measured = new Set<ProviderId>(rows.map((r) => r.provider));
  return {
    batchId: str(root.batchId, "batchId"),
    commit: str(root.commit, "commit"),
    track,
    window: { start: str(window.start, "window.start"), end: str(window.end, "window.end") },
    regions,
    planned,
    // Only metrics with a row, so no column is empty.
    metrics: metrics.filter((m) => rows.some((r) => r.metric === m.id)),
    rows,
    rtt,
    providers: Object.keys(providerInfo).filter(isProviderId).filter((id) => measured.has(id)),
  };
}

export const regional: RegionalData = parse(regionalExport);

export const rowOf = (data: RegionalData, provider: ProviderId, metric: string) => data.rows.find((r) => r.provider === provider && r.metric === metric);

/** The best location for one row, and how far the worst one is behind it: 1.7 means the slowest takes 1.7× as long (or does 1/1.7 the work). Needs two locations. */
export function spreadOf(row: RegionRow, metric: RegionMetric): { best: RegionId; ratio: number } | null {
  const cells = [...row.cells].filter(([, c]) => c.p50 > 0);
  if (cells.length < 2) return null;
  const sorted = cells.sort(([, a], [, b]) => (metric.better === "lower" ? a.p50 - b.p50 : b.p50 - a.p50));
  const best = sorted[0];
  const worst = sorted.at(-1);
  if (!best || !worst) return null;
  const ratio = metric.better === "lower" ? worst[1].p50 / best[1].p50 : best[1].p50 / worst[1].p50;
  return { best: best[0], ratio };
}

/**
 * How one location differs from another, in a form a reader can weigh:
 * time in ms or s, throughput as a percentage, since a raw "+3.1M ops/s" means little.
 */
export type Delta = { kind: "time"; ms: number } | { kind: "percent"; value: number };

export function deltaOf(metric: RegionMetric, a: RegionCell, b: RegionCell): Delta {
  switch (metric.unit) {
    case "s":
      return { kind: "time", ms: (a.p50 - b.p50) * 1000 };
    case "ms":
      return { kind: "time", ms: a.p50 - b.p50 };
    case "ops/s":
    case "MB/s":
    case "IOPS":
      return { kind: "percent", value: b.p50 === 0 ? 0 : a.p50 / b.p50 - 1 };
    default: {
      const _exhaustive: never = metric.unit;
      return _exhaustive;
    }
  }
}

const signed = (text: string, v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${text}`;

/** "+490 ms", "−16.7 s", "+12%". */
export function formatDelta(d: Delta) {
  switch (d.kind) {
    case "time": {
      const abs = Math.abs(d.ms);
      const text = abs < 1000 ? `${abs.toFixed(abs < 10 ? 1 : 0)} ms` : `${(abs / 1000).toFixed(abs < 10_000 ? 2 : 1)} s`;
      return signed(text, d.ms);
    }
    case "percent":
      return signed(`${Math.abs(d.value * 100).toFixed(0)}%`, d.value);
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
