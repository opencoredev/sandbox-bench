import type { BurstSurvivalExport, CpuBurstExport, CpuSustainedExport, StressExport } from "@/lib/inputs";
import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * The stress suites, per track: CPU sustained, CPU under burst and burst
 * survival, from the `stress` block of benchmark.<track>.json
 * (bench/src/stress-site.ts). Parsed here into rows the page can chart: only
 * providers on the site, one row per provider per chart.
 */

type Known<T extends { provider: string }> = Omit<T, "provider"> & { provider: ProviderId };

export type CpuSustained = Known<CpuSustainedExport>;
export type CpuBurst = Known<CpuBurstExport>;
export type BurstSurvival = Known<BurstSurvivalExport>;

/**
 * One row per provider. The harness groups by provider and allocation (and,
 * for cohorts, the work or survival plan), so a provider collected two ways
 * has two rows; the one with the most data is shown and `others` counts the rest.
 */
export interface OnePerProvider<T> {
  rows: readonly T[];
  /** Providers with rows left out, and how many. */
  others: readonly { provider: ProviderId; count: number }[];
}

export type Cohorts<T> = OnePerProvider<T> & { k: number };

export interface StressData {
  observations: number;
  runs: StressExport["runs"];
  /** Stress rows the attempt policy removed, by reason. */
  selectionRemoved: StressExport["selectionRemoved"];
  cpuSustained: OnePerProvider<CpuSustained>;
  cpuBurst: readonly Cohorts<CpuBurst>[];
  burstSurvival: readonly Cohorts<BurstSurvival>[];
}

const fail = (track: string, what: string): never => {
  throw new Error(`${track} stress: ${what}`);
};

function known<T extends { provider: string }>(rows: readonly T[]): Known<T>[] {
  return rows.flatMap((r) => (isProviderId(r.provider) ? [{ ...r, provider: r.provider }] : []));
}

/** Keeps each provider's row with the most data, in first-seen order, and counts the rows left out. */
function onePerProvider<T extends { provider: ProviderId }>(rows: readonly T[], weight: (row: T) => number): OnePerProvider<T> {
  const best = new Map<ProviderId, T>();
  const others = new Map<ProviderId, number>();
  for (const row of rows) {
    const held = best.get(row.provider);
    if (held === undefined) {
      best.set(row.provider, row);
      continue;
    }
    others.set(row.provider, (others.get(row.provider) ?? 0) + 1);
    if (weight(row) > weight(held)) best.set(row.provider, row);
  }
  return { rows: [...best.values()], others: [...others].map(([provider, count]) => ({ provider, count })) };
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

function checkSurvival(track: string, k: number, r: BurstSurvival) {
  const where = `${r.provider} survival at ${k}`;
  if (![r.attempted, r.survived, r.died, r.unresponsive, r.interrupted, r.invalidEvidence].every(isCount)) fail(track, `${where} has a count that is not a whole number`);
  if (r.survived > r.attempted) fail(track, `${where} survived ${r.survived} of ${r.attempted}`);
  if (r.survivalRate !== null && !(r.survivalRate >= 0 && r.survivalRate <= 1)) fail(track, `${where} has survival rate ${r.survivalRate}`);
}

/**
 * The stress block, or null when the export has none or nothing in it can be
 * charted, so a track without stress results shows no stress section at all.
 * A malformed count or rate stops the build instead of reaching the page.
 */
export function parseStress(raw: StressExport | undefined, track: string): StressData | null {
  if (raw === undefined) return null;
  if (!isCount(raw.observations)) fail(track, `observations is ${raw.observations}`);
  for (const group of [...raw.cpuBurst, ...raw.burstSurvival]) if (!Number.isInteger(group.k) || group.k < 1) fail(track, `cohort size ${group.k} is not a positive whole number`);
  const data: StressData = {
    observations: raw.observations,
    runs: raw.runs,
    selectionRemoved: raw.selectionRemoved,
    cpuSustained: onePerProvider(known(raw.cpuSustained), (r) => r.single.n + r.all.n),
    cpuBurst: raw.cpuBurst.map((g) => ({ k: g.k, ...onePerProvider(known(g.providers), (r) => r.members.completed) })),
    burstSurvival: raw.burstSurvival.map((g) => {
      const rows = known(g.providers);
      for (const r of rows) checkSurvival(track, g.k, r);
      return { k: g.k, ...onePerProvider(rows, (r) => r.attempted) };
    }),
  };
  return hasStress(data) ? data : null;
}

/** Single core or all cores. */
export type CpuMode = "single" | "all";

/** Rows with a median for `value`, highest first: every stress chart is higher-is-better. */
export function highestFirst<T>(rows: readonly T[], value: (row: T) => number | null): { row: T; value: number }[] {
  return rows.flatMap((row) => {
    const v = value(row);
    return v === null ? [] : [{ row, value: v }];
  }).sort((a, b) => b.value - a.value);
}

/** Rows a chart has no value for. */
export const withoutValue = <T>(rows: readonly T[], value: (row: T) => number | null) => rows.filter((row) => value(row) === null);

export const sustainedValue = (mode: CpuMode) => (r: CpuSustained) => r[mode].p50;
export const burstValue = (r: CpuBurst) => r.perSandbox.single.p50;
export const survivalValue = (r: BurstSurvival) => r.survivalRate;

/** Survival best first: highest rate, then more members behind it. */
export function survivalRanked(rows: readonly BurstSurvival[]) {
  return highestFirst(rows, survivalValue).sort((a, b) => b.value - a.value || b.row.attempted - a.row.attempted);
}

export const sustainedReady = (s: StressData) => s.cpuSustained.rows.some((r) => r.single.p50 !== null || r.all.p50 !== null);
export const burstReady = (s: StressData) => s.cpuBurst.some((g) => g.rows.some((r) => burstValue(r) !== null));
export const survivalReady = (s: StressData) => s.burstSurvival.some((g) => g.rows.some((r) => survivalValue(r) !== null));

/** Whether there is anything to show: observations, and at least one suite with a charted value. */
export function hasStress(s: StressData | null): s is StressData {
  return s !== null && s.observations > 0 && (sustainedReady(s) || burstReady(s) || survivalReady(s));
}

/** The most common value first: "4", or "4, 2" when runs saw more than one. */
export const countsText = (xs: readonly { value: number; count: number }[]) => (xs.length === 0 ? null : xs.map((x) => String(x.value)).join(", "));

/** "1.12×". */
export const timesText = (x: number) => `${x.toFixed(2)}×`;
