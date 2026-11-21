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

export interface Expanded {
  scenarioCount: number;
  /** When the sweep's export was written, if it says. */
  generatedAt: string | null;
  runId: string | null;
  /** Runs per provider the sweep asked for, if it says. */
  runs: number | null;
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
