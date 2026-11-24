import type { ExpandedUnit } from "@/lib/format";
import { isProviderId, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * The expanded benchmarks: 24 seed-verified scenarios in six categories, from
 * the harness's expanded sweep (bench/src/expanded, `exportExpandedSiteData`),
 * written into src/data/expanded.json. Parsed here from `unknown`, so a
 * malformed file stops the build instead of reaching the page; providers the
 * site doesn't list are dropped.
 */

export const expandedCategories = ["cpu", "agent-tasks", "agent-loops", "filesystem", "builds", "runtime"] as const;
export type ExpandedCategory = (typeof expandedCategories)[number];

export const categoryLabels = {
  cpu: "CPU",
  "agent-tasks": "Agent tasks",
  "agent-loops": "Agent loops",
  filesystem: "Filesystem",
  builds: "Builds",
  runtime: "Runtime",
} as const satisfies Record<ExpandedCategory, string>;

const expandedUnits = ["s", "ops/s", "MB/s", "files/s", "queries/s", "spawns/s"] as const satisfies readonly ExpandedUnit[];

export interface ExpandedValue {
  provider: ProviderId;
  /** Verified runs behind the median. */
  n: number;
  median: number;
  min: number;
  max: number;
}

export interface ExpandedMetric {
  id: string;
  category: ExpandedCategory;
  label: string;
  description: string;
  unit: ExpandedUnit;
  better: "lower" | "higher";
  /** Best first. */
  values: readonly ExpandedValue[];
}

export interface ExpandedGroup {
  category: ExpandedCategory;
  label: string;
  metrics: readonly ExpandedMetric[];
}

/** A run of a provider's own, outside the sweep `runId` names, and the tests whose values came from it. */
export interface ExpandedProviderRun {
  id: string;
  startedAt: string;
  sdkCommit: string;
  /** Metric ids this run produced for the provider. */
  metrics: readonly string[];
}

/** Providers whose values came from their own runs, keyed by provider. A provider not listed is from `runId`. */
export type ExpandedProviderRuns = Partial<Record<ProviderId, readonly ExpandedProviderRun[]>>;

export interface Expanded {
  scenarioCount: number;
  /** When the sweep's export was written, if it says. */
  generatedAt: string | null;
  runId: string | null;
  /** Runs per provider the sweep asked for, if it says. */
  runs: number | null;
  providerRuns: ExpandedProviderRuns;
  /** Every category the export lists, in the harness's order. */
  groups: readonly ExpandedGroup[];
}

type Json = Record<string, unknown>;
const fail = (path: string, what: string): never => {
  throw new Error(`expanded.json: ${path} ${what}`);
};
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Json => (isObject(v) ? v : fail(path, "must be an object"));
const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, "must be an array"));
const str = (v: unknown, path: string): string => (typeof v === "string" ? v : fail(path, "must be a string"));
const positive = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fail(path, "must be a finite number above 0"));
const count = (v: unknown, path: string): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fail(path, "must be a whole number"));
const timestamp = (v: unknown, path: string): string => {
  const s = str(v, path);
  return Number.isNaN(Date.parse(s)) ? fail(path, `is not a date: ${s}`) : s;
};
const optional = <T>(read: (v: unknown, path: string) => T) => (v: unknown, path: string): T | null => (v === undefined || v === null ? null : read(v, path));

const isCategory = (c: unknown): c is ExpandedCategory => expandedCategories.some((k) => k === c);
const isUnit = (u: unknown): u is ExpandedUnit => expandedUnits.some((k) => k === u);
const category = (v: unknown, path: string): ExpandedCategory => (isCategory(v) ? v : fail(path, `is not a known category: ${String(v)}`));

function parseValue(v: unknown, path: string): ExpandedValue[] {
  const o = obj(v, path);
  const id = str(o.provider, `${path}.provider`);
  if (!isProviderId(id)) return [];
  const n = count(o.n, `${path}.n`);
  if (n < 1) fail(`${path}.n`, "must be at least 1");
  const median = positive(o.median, `${path}.median`);
  const min = positive(o.min, `${path}.min`);
  const max = positive(o.max, `${path}.max`);
  if (!(min <= median && median <= max)) fail(path, `has min ${min}, median ${median}, max ${max} out of order`);
  return [{ provider: id, n, median, min, max }];
}

/** Values best first by median, ties in the site's provider order. */
export function bestFirst(values: readonly ExpandedValue[], better: ExpandedMetric["better"]): ExpandedValue[] {
  const sign = better === "lower" ? 1 : -1;
  const order = Object.keys(providerInfo);
  return [...values].sort((a, b) => sign * (a.median - b.median) || order.indexOf(a.provider) - order.indexOf(b.provider));
}

function parseMetric(v: unknown, path: string): ExpandedMetric {
  const o = obj(v, path);
  const better = o.better === "lower" || o.better === "higher" ? o.better : fail(`${path}.better`, "must be lower or higher");
  const unit = isUnit(o.unit) ? o.unit : fail(`${path}.unit`, `is not a known unit: ${String(o.unit)}`);
  const values = arr(o.values, `${path}.values`).flatMap((x, i) => parseValue(x, `${path}.values[${i}]`));
  const seen = new Set<ProviderId>();
  for (const x of values) {
    if (seen.has(x.provider)) fail(`${path}.values`, `lists ${x.provider} twice`);
    seen.add(x.provider);
  }
  return {
    id: str(o.id, `${path}.id`),
    category: category(o.category, `${path}.category`),
    label: str(o.label, `${path}.label`),
    description: str(o.description, `${path}.description`),
    unit,
    better,
    values: bestFirst(values, better),
  };
}

function parseProviderRun(v: unknown, path: string, metricIds: ReadonlySet<string>): ExpandedProviderRun {
  const o = obj(v, path);
  const metrics = arr(o.metrics, `${path}.metrics`).map((m, i) => str(m, `${path}.metrics[${i}]`));
  if (metrics.length === 0) fail(`${path}.metrics`, "must list at least one test");
  for (const m of metrics) if (!metricIds.has(m)) fail(`${path}.metrics`, `lists ${m}, which metrics does not have`);
  return { id: str(o.id, `${path}.id`), startedAt: timestamp(o.startedAt, `${path}.startedAt`), sdkCommit: str(o.sdkCommit, `${path}.sdkCommit`), metrics };
}

/**
 * Each provider's own runs. Every test a provider has a value in must come
 * from exactly one of its runs, so no value is left attributed to the sweep
 * by mistake; providers the site doesn't list are dropped.
 */
function parseProviderRuns(v: unknown, metrics: readonly ExpandedMetric[]): ExpandedProviderRuns {
  if (v === undefined || v === null) return {};
  const o = obj(v, "providerRuns");
  const metricIds = new Set(metrics.map((m) => m.id));
  const out: ExpandedProviderRuns = {};
  for (const [id, list] of Object.entries(o)) {
    if (!isProviderId(id)) continue;
    const path = `providerRuns.${id}`;
    const runs = arr(list, path).map((r, i) => parseProviderRun(r, `${path}[${i}]`, metricIds));
    if (runs.length === 0) fail(path, "must list at least one run");
    const covered = new Set<string>();
    for (const m of runs.flatMap((r) => r.metrics)) {
      if (covered.has(m)) fail(path, `lists ${m} in more than one run`);
      covered.add(m);
    }
    for (const m of metrics)
      if (m.values.some((x) => x.provider === id) && !covered.has(m.id)) fail(path, `has a value in ${m.id} but no run lists it`);
    out[id] = runs;
  }
  return out;
}

/** The provider's own run behind its value in a test, or null when the value is from the sweep `runId` names. */
export const ownRun = (e: Pick<Expanded, "providerRuns">, provider: ProviderId, metricId: string): ExpandedProviderRun | null =>
  e.providerRuns[provider]?.find((r) => r.metrics.includes(metricId)) ?? null;

/** "Nov 24": a run's start date, in UTC. */
export const runDate = (r: Pick<ExpandedProviderRun, "startedAt">) =>
  new Date(r.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function parseExpanded(raw: unknown): Expanded {
  const o = obj(raw, "root");
  if (o.version !== 1) fail("version", "must be 1");
  const categories = arr(o.categories, "categories").map((c, i) => category(c, `categories[${i}]`));
  const metrics = arr(o.metrics, "metrics").map((m, i) => parseMetric(m, `metrics[${i}]`));
  const ids = new Set<string>();
  for (const m of metrics) {
    if (ids.has(m.id)) fail("metrics", `lists ${m.id} twice`);
    if (!categories.includes(m.category)) fail("metrics", `${m.id} is in ${m.category}, which categories does not list`);
    ids.add(m.id);
  }
  return {
    scenarioCount: count(o.scenarioCount, "scenarioCount"),
    generatedAt: optional(timestamp)(o.generatedAt, "generatedAt"),
    runId: optional(str)(o.runId, "runId"),
    runs: optional(count)(o.runs, "runs"),
    providerRuns: parseProviderRuns(o.providerRuns, metrics),
    groups: [...new Set(categories)].map((c) => ({ category: c, label: categoryLabels[c], metrics: metrics.filter((m) => m.category === c) })),
  };
}

export const hasValues = (m: ExpandedMetric) => m.values.length > 0;
export const groupHasValues = (g: ExpandedGroup) => g.metrics.some(hasValues);

/** Whether any test has a result to chart; nothing is shown otherwise. */
export const hasExpanded = (e: Expanded) => e.groups.some(groupHasValues);

/** Every provider with at least one result, in the site's provider order. */
export function expandedProviders(e: Expanded): ProviderId[] {
  const seen = new Set(e.groups.flatMap((g) => g.metrics.flatMap((m) => m.values.map((v) => v.provider))));
  return Object.keys(providerInfo).filter(isProviderId).filter((id) => seen.has(id));
}

/** "run A on Nov 24 (UTC), commit de32eb5". */
const runText = (r: ExpandedProviderRun) => `run ${r.id} on ${runDate(r)} (UTC), commit ${r.sdkCommit}`;

/**
 * Where a provider's values in these tests came from, when some came from its
 * own runs: "from its own run …", or with several runs, the tests each smaller
 * run produced and "the rest" from the largest. Null for a provider whose
 * values in these tests are all from the sweep.
 */
export function ownRunsText(e: Pick<Expanded, "providerRuns" | "runId">, metrics: readonly ExpandedMetric[], provider: ProviderId): string | null {
  const valued = metrics.filter((m) => m.values.some((v) => v.provider === provider));
  const byRun = new Map<ExpandedProviderRun, ExpandedMetric[]>();
  for (const m of valued) {
    const r = ownRun(e, provider, m.id);
    if (r) byRun.set(r, [...(byRun.get(r) ?? []), m]);
  }
  if (byRun.size === 0) return null;
  const notSweep = e.runId === null ? "" : `, not ${e.runId}`;
  const [largest, ...rest] = [...byRun].sort((a, b) => b[1].length - a[1].length);
  if (!largest) return null;
  if (rest.length === 0) return `from its own ${runText(largest[0])}${notSweep}`;
  const parts = rest.map(([r, ms]) => `${ms.map((m) => m.label).join(", ")} from ${runText(r)}`);
  return `from its own runs${notSweep}: ${parts.join("; ")}; the rest from ${runText(largest[0])}`;
}

/** Providers with a value in these tests from their own runs, in the site's provider order. */
export const ownRunProviders = (e: Pick<Expanded, "providerRuns">, metrics: readonly ExpandedMetric[]): ProviderId[] =>
  Object.keys(providerInfo)
    .filter(isProviderId)
    .filter((id) => metrics.some((m) => m.values.some((v) => v.provider === id) && ownRun(e, id, m.id) !== null));
