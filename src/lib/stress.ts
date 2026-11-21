import type {
  BurstSurvivalExport,
  CpuBurstExport,
  CpuSustainedExport,
  StressAllocationExport,
  StressExport,
  StressFailuresExport,
  StressRatioExport,
  StressSpreadExport,
  StressThroughputExport,
} from "@/lib/inputs";
import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * The stress suites, per track: CPU sustained, CPU under burst and burst
 * survival, from the `stress` block of benchmark.<track>.json
 * (bench/src/stress-site.ts). Parsed from `unknown` here into rows the page
 * can chart: only providers on the site, one row per provider per chart.
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

function fail(track: string, what: string): never {
  throw new Error(`${track} stress: ${what}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const isFinitePos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function readRecord(v: unknown, track: string, where: string): Record<string, unknown> {
  if (!isRecord(v)) return fail(track, `${where} must be an object`);
  return v;
}

function readArray(v: unknown, track: string, where: string): readonly unknown[] {
  if (!Array.isArray(v)) return fail(track, `${where} must be an array`);
  return v;
}

function readString(v: unknown, track: string, where: string): string {
  if (typeof v !== "string" || v.trim().length === 0) return fail(track, `${where} must be a non-empty string`);
  return v;
}

function readNullableString(v: unknown, track: string, where: string): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return fail(track, `${where} must be a string or null`);
  return v;
}

function readCount(v: unknown, track: string, where: string): number {
  if (!isCount(v)) return fail(track, `${where} is ${String(v)}`);
  return v;
}

function readPosInt(v: unknown, track: string, where: string): number {
  if (!isPosInt(v)) return fail(track, `${where} is ${String(v)}`);
  return v;
}

function readNullableFinite(v: unknown, track: string, where: string, min = 0, strictMin = false): number | null {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || (strictMin ? v <= min : v < min)) return fail(track, `${where} is ${String(v)}`);
  return v;
}

function readCountMap(v: unknown, track: string, where: string): Record<string, number> {
  const obj = readRecord(v, track, where);
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = readCount(val, track, `${where}.${k}`);
  return out;
}

function readAllocation(obj: Record<string, unknown>, track: string, where: string): StressAllocationExport {
  const rawSize = obj.requestedSize;
  let requestedSize: StressAllocationExport["requestedSize"];
  if (rawSize === null || typeof rawSize === "string") {
    requestedSize = rawSize;
  } else if (isRecord(rawSize)) {
    const cpu = rawSize.cpu;
    const memoryMb = rawSize.memoryMb;
    const diskGb = rawSize.diskGb;
    if (!isFinitePos(cpu)) return fail(track, `${where}.requestedSize.cpu is ${String(cpu)}`);
    if (!isPosInt(memoryMb)) return fail(track, `${where}.requestedSize.memoryMb is ${String(memoryMb)}`);
    if (diskGb !== undefined && !isFinitePos(diskGb)) return fail(track, `${where}.requestedSize.diskGb is ${String(diskGb)}`);
    requestedSize = diskGb === undefined ? { cpu, memoryMb } : { cpu, memoryMb, diskGb };
  } else {
    return fail(track, `${where}.requestedSize is invalid`);
  }
  return {
    requestedSize,
    template: readNullableString(obj.template, track, `${where}.template`),
  };
}

function readFailures(v: unknown, track: string, where: string): StressFailuresExport {
  const obj = readRecord(v, track, where);
  return {
    accountLimit: readCount(obj.accountLimit, track, `${where}.accountLimit`),
    clientNetwork: readCount(obj.clientNetwork, track, `${where}.clientNetwork`),
    provider: readCount(obj.provider, track, `${where}.provider`),
  };
}

function readThroughput(v: unknown, track: string, where: string): StressThroughputExport {
  const obj = readRecord(v, track, where);
  const n = readCount(obj.n, track, `${where}.n`);
  const p50 = readNullableFinite(obj.p50, track, `${where}.p50`, 0, true);
  const p95 = readNullableFinite(obj.p95, track, `${where}.p95`, 0, true);
  const min = readNullableFinite(obj.min, track, `${where}.min`, 0, true);
  const max = readNullableFinite(obj.max, track, `${where}.max`, 0, true);
  const ciLow = readNullableFinite(obj.ciLow, track, `${where}.ciLow`, 0, false);
  const ciHigh = readNullableFinite(obj.ciHigh, track, `${where}.ciHigh`, 0, false);
  if (n === 0 && (p50 !== null || p95 !== null || min !== null || max !== null)) fail(track, `${where} has values with n=0`);
  if (n > 0 && p50 === null) fail(track, `${where} has n=${n} without p50`);
  if (min !== null && p50 !== null && min > p50) fail(track, `${where} has min ${min} > p50 ${p50}`);
  if (max !== null && p50 !== null && p50 > max) fail(track, `${where} has p50 ${p50} > max ${max}`);
  if (ciLow !== null && ciHigh !== null && ciLow > ciHigh) fail(track, `${where} has ciLow ${ciLow} > ciHigh ${ciHigh}`);
  return { n, p50, p95, min, max, ciLow, ciHigh };
}

function readSpread(v: unknown, track: string, where: string): StressSpreadExport {
  const obj = readRecord(v, track, where);
  const n = readCount(obj.n, track, `${where}.n`);
  const p50 = readNullableFinite(obj.p50, track, `${where}.p50`, 0, true);
  const p95 = readNullableFinite(obj.p95, track, `${where}.p95`, 0, true);
  const min = readNullableFinite(obj.min, track, `${where}.min`, 0, true);
  const max = readNullableFinite(obj.max, track, `${where}.max`, 0, true);
  const mean = readNullableFinite(obj.mean, track, `${where}.mean`, 0, true);
  const maxOverMin = readNullableFinite(obj.maxOverMin, track, `${where}.maxOverMin`, 1, false);
  const cv = readNullableFinite(obj.cv, track, `${where}.cv`, 0, false);
  if (n === 0 && (p50 !== null || p95 !== null || min !== null || max !== null || mean !== null)) fail(track, `${where} has values with n=0`);
  if (n > 0 && p50 === null) fail(track, `${where} has n=${n} without p50`);
  if (min !== null && p50 !== null && min > p50) fail(track, `${where} has min ${min} > p50 ${p50}`);
  if (max !== null && p50 !== null && p50 > max) fail(track, `${where} has p50 ${p50} > max ${max}`);
  return { n, p50, p95, min, max, mean, maxOverMin, cv };
}

function readRatio(v: unknown, track: string, where: string): StressRatioExport {
  if (v === null) return null;
  const obj = readRecord(v, track, where);
  const p50 = readNullableFinite(obj.p50, track, `${where}.p50`, 0, false);
  const min = readNullableFinite(obj.min, track, `${where}.min`, 0, false);
  if (min !== null && p50 !== null && min > p50) fail(track, `${where} has min ${min} > p50 ${p50}`);
  return { p50, min };
}

function readP50Max(v: unknown, track: string, where: string, minValue = 0): { p50: number | null; max: number | null } | null {
  if (v === null) return null;
  const obj = readRecord(v, track, where);
  const p50 = readNullableFinite(obj.p50, track, `${where}.p50`, minValue, false);
  const max = readNullableFinite(obj.max, track, `${where}.max`, minValue, false);
  if (p50 !== null && max !== null && p50 > max) fail(track, `${where} has p50 ${p50} > max ${max}`);
  return { p50, max };
}

function readValueCounts(v: unknown, track: string, where: string): readonly { value: number; count: number }[] {
  return readArray(v, track, where).map((item, i) => {
    const obj = readRecord(item, track, `${where}[${i}]`);
    const value = obj.value;
    if (!isFinitePos(value)) return fail(track, `${where}[${i}].value is ${String(value)}`);
    return { value, count: readPosInt(obj.count, track, `${where}[${i}].count`) };
  });
}

function readIncomplete(v: unknown, track: string, where: string): { cohorts: number; members: number } {
  const obj = readRecord(v, track, where);
  return {
    cohorts: readCount(obj.cohorts, track, `${where}.cohorts`),
    members: readCount(obj.members, track, `${where}.members`),
  };
}

function parseSustainedRow(v: unknown, track: string, index: number): CpuSustainedExport {
  const obj = readRecord(v, track, `cpuSustained[${index}]`);
  const provider = readString(obj.provider, track, `cpuSustained[${index}].provider`);
  const where = `${provider} cpuSustained`;
  const consistency = readRecord(obj.consistency, track, `${where}.consistency`);
  const trend = readRecord(obj.trend, track, `${where}.trend`);
  const attempts = readRecord(obj.attempts, track, `${where}.attempts`);
  return {
    provider,
    ...readAllocation(obj, track, where),
    single: readThroughput(obj.single, track, `${where}.single`),
    all: readThroughput(obj.all, track, `${where}.all`),
    singleSeconds: readP50Max(obj.singleSeconds, track, `${where}.singleSeconds`),
    allSeconds: readP50Max(obj.allSeconds, track, `${where}.allSeconds`),
    consistency: {
      single: readRatio(consistency.single, track, `${where}.consistency.single`),
      all: readRatio(consistency.all, track, `${where}.consistency.all`),
    },
    trend: {
      single: readRatio(trend.single, track, `${where}.trend.single`),
      all: readRatio(trend.all, track, `${where}.trend.all`),
    },
    guestVcpus: readValueCounts(obj.guestVcpus, track, `${where}.guestVcpus`),
    workers: readValueCounts(obj.workers, track, `${where}.workers`),
    attempts: {
      successes: readCount(attempts.successes, track, `${where}.attempts.successes`),
      failures: readFailures(attempts.failures, track, `${where}.attempts.failures`),
      blocked: readCount(attempts.blocked, track, `${where}.attempts.blocked`),
      skipped: readCount(attempts.skipped, track, `${where}.attempts.skipped`),
    },
  };
}

function parseBurstRow(v: unknown, track: string, k: number, index: number): CpuBurstExport {
  const obj = readRecord(v, track, `cpuBurst(k=${k})[${index}]`);
  const provider = readString(obj.provider, track, `cpuBurst(k=${k})[${index}].provider`);
  const where = `${provider} cpuBurst at ${k}`;
  let work: CpuBurstExport["work"] = null;
  if (obj.work !== null) {
    const w = readRecord(obj.work, track, `${where}.work`);
    work = {
      segments: readPosInt(w.segments, track, `${where}.work.segments`),
      steps: readPosInt(w.steps, track, `${where}.work.steps`),
    };
  }
  const cohorts = readCount(obj.cohorts, track, `${where}.cohorts`);
  const completeCohorts = readCount(obj.completeCohorts, track, `${where}.completeCohorts`);
  if (completeCohorts > cohorts) fail(track, `${where} has completeCohorts ${completeCohorts} > cohorts ${cohorts}`);
  const excludedObj = readRecord(obj.excluded, track, `${where}.excluded`);
  const excluded = {
    lowOverlap: readCount(excludedObj.lowOverlap, track, `${where}.excluded.lowOverlap`),
    invalidEvidence: readCount(excludedObj.invalidEvidence, track, `${where}.excluded.invalidEvidence`),
  };
  const membersObj = readRecord(obj.members, track, `${where}.members`);
  const members = {
    attempted: readCount(membersObj.attempted, track, `${where}.members.attempted`),
    ready: readCount(membersObj.ready, track, `${where}.members.ready`),
    completed: readCount(membersObj.completed, track, `${where}.members.completed`),
  };
  if (members.ready > members.attempted || members.completed > members.ready) {
    fail(track, `${where} has invalid member counts (${members.completed}/${members.ready}/${members.attempted})`);
  }
  const perObj = readRecord(obj.perSandbox, track, `${where}.perSandbox`);
  const perSandbox = {
    cohorts: readCount(perObj.cohorts, track, `${where}.perSandbox.cohorts`),
    single: readSpread(perObj.single, track, `${where}.perSandbox.single`),
    all: readSpread(perObj.all, track, `${where}.perSandbox.all`),
  };
  if (perSandbox.cohorts > completeCohorts) fail(track, `${where} counted ${perSandbox.cohorts} cohorts > complete ${completeCohorts}`);
  let allCompleteS: CpuBurstExport["allCompleteS"] = null;
  if (obj.allCompleteS !== null) {
    const ac = readRecord(obj.allCompleteS, track, `${where}.allCompleteS`);
    const p50Max = readP50Max(ac, track, `${where}.allCompleteS`, 0);
    allCompleteS = {
      n: readCount(ac.n, track, `${where}.allCompleteS.n`),
      p50: p50Max?.p50 ?? null,
      max: p50Max?.max ?? null,
    };
  }
  return {
    provider,
    ...readAllocation(obj, track, where),
    work,
    cohorts,
    completeCohorts,
    excluded,
    incomplete: readIncomplete(obj.incomplete, track, `${where}.incomplete`),
    members,
    failures: readFailures(obj.failures, track, `${where}.failures`),
    perSandbox,
    withinCohortMaxOverMin: readP50Max(obj.withinCohortMaxOverMin, track, `${where}.withinCohortMaxOverMin`, 1),
    dispatchSkewMs: readP50Max(obj.dispatchSkewMs, track, `${where}.dispatchSkewMs`, 0),
    allCompleteS,
  };
}

/** Exact denominator from bench/src/stress-site.ts: members the provider had a fair chance with. */
export function survivalDenominator(r: Pick<BurstSurvivalExport, "attempted" | "createFailed" | "interrupted" | "invalidEvidence" | "windowFailures">) {
  return (
    r.attempted -
    r.createFailed.accountLimit -
    r.createFailed.clientNetwork -
    r.interrupted -
    r.invalidEvidence -
    r.windowFailures.accountLimit
  );
}

function parseSurvivalRow(v: unknown, track: string, k: number, index: number): BurstSurvivalExport {
  const obj = readRecord(v, track, `burstSurvival(k=${k})[${index}]`);
  const provider = readString(obj.provider, track, `burstSurvival(k=${k})[${index}].provider`);
  const where = `${provider} survival at ${k}`;
  const cfObj = readRecord(obj.createFailed, track, `${where}.createFailed`);
  const cfClasses = readFailures(cfObj, track, `${where}.createFailed`);
  const cfTotal = readCount(cfObj.total, track, `${where}.createFailed.total`);
  if (cfTotal !== cfClasses.accountLimit + cfClasses.clientNetwork + cfClasses.provider) {
    fail(track, `${where} createFailed.total ${cfTotal} does not match class sum`);
  }
  const row: BurstSurvivalExport = {
    provider,
    ...readAllocation(obj, track, where),
    windowS: readNullableFinite(obj.windowS, track, `${where}.windowS`, 0, true),
    heartbeatS: readNullableFinite(obj.heartbeatS, track, `${where}.heartbeatS`, 0, true),
    cohorts: readCount(obj.cohorts, track, `${where}.cohorts`),
    incomplete: readIncomplete(obj.incomplete, track, `${where}.incomplete`),
    attempted: readCount(obj.attempted, track, `${where}.attempted`),
    survived: readCount(obj.survived, track, `${where}.survived`),
    createFailed: { total: cfTotal, ...cfClasses },
    died: readCount(obj.died, track, `${where}.died`),
    unresponsive: readCount(obj.unresponsive, track, `${where}.unresponsive`),
    interrupted: readCount(obj.interrupted, track, `${where}.interrupted`),
    invalidEvidence: readCount(obj.invalidEvidence, track, `${where}.invalidEvidence`),
    invalidReasons: readCountMap(obj.invalidReasons, track, `${where}.invalidReasons`),
    windowFailures: readFailures(obj.windowFailures, track, `${where}.windowFailures`),
    survivalRate: readNullableFinite(obj.survivalRate, track, `${where}.survivalRate`, 0, false),
  };
  if (row.survived > row.attempted) fail(track, `${where} survived ${row.survived} of ${row.attempted}`);
  if (row.survivalRate !== null && row.survivalRate > 1) fail(track, `${where} has survival rate ${row.survivalRate}`);
  const denominator = survivalDenominator(row);
  if (denominator < 0) fail(track, `${where} has negative fair-chance denominator ${denominator}`);
  if (denominator === 0) {
    if (row.survived !== 0) fail(track, `${where} survived ${row.survived} with 0 fair-chance attempts`);
    if (row.survivalRate !== null) fail(track, `${where} has survival rate ${row.survivalRate} with 0 fair-chance attempts`);
  } else {
    if (row.survived > denominator) fail(track, `${where} survived ${row.survived} of ${denominator} fair-chance attempts`);
    const expected = Number((row.survived / denominator).toFixed(4));
    if (row.survivalRate === null || Math.abs(row.survivalRate - expected) > 1e-9) {
      fail(track, `${where} has survival rate ${String(row.survivalRate)}, expected ${expected} (${row.survived}/${denominator})`);
    }
  }
  return row;
}

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

/**
 * The stress block, or null when the export has none or nothing in it can be
 * charted, so a track without stress results shows no stress section at all.
 * Parsed strictly from `unknown`: any malformed count, non-finite metric or
 * contradictory survival rate stops the build instead of reaching the page.
 */
export function parseStress(raw: unknown, track: string): StressData | null {
  if (raw === undefined || raw === null) return null;
  const obj = readRecord(raw, track, "root");
  const observations = readCount(obj.observations, track, "observations");
  const runs = readArray(obj.runs, track, "runs").map((item, i) => {
    const r = readRecord(item, track, `runs[${i}]`);
    return {
      id: readString(r.id, track, `runs[${i}].id`),
      suite: readString(r.suite, track, `runs[${i}].suite`),
      samples: readCount(r.samples, track, `runs[${i}].samples`),
    };
  });
  const selectionRemoved = readCountMap(obj.selectionRemoved, track, "selectionRemoved");
  const cpuSustainedRows = readArray(obj.cpuSustained, track, "cpuSustained").map((item, i) => parseSustainedRow(item, track, i));
  const cpuBurstGroups = readArray(obj.cpuBurst, track, "cpuBurst").map((item, i) => {
    const g = readRecord(item, track, `cpuBurst[${i}]`);
    if (!isPosInt(g.k)) return fail(track, `cohort size ${String(g.k)} is not a positive whole number`);
    const k = g.k;
    const rows = readArray(g.providers, track, `cpuBurst[${i}].providers`).map((row, j) => parseBurstRow(row, track, k, j));
    return { k, ...onePerProvider(known(rows), (r) => r.members.completed) };
  });
  const burstSurvivalGroups = readArray(obj.burstSurvival, track, "burstSurvival").map((item, i) => {
    const g = readRecord(item, track, `burstSurvival[${i}]`);
    if (!isPosInt(g.k)) return fail(track, `cohort size ${String(g.k)} is not a positive whole number`);
    const k = g.k;
    const rows = readArray(g.providers, track, `burstSurvival[${i}].providers`).map((row, j) => parseSurvivalRow(row, track, k, j));
    return { k, ...onePerProvider(known(rows), (r) => r.attempted) };
  });
  const data: StressData = {
    observations,
    runs,
    selectionRemoved,
    cpuSustained: onePerProvider(known(cpuSustainedRows), (r) => r.single.n + r.all.n),
    cpuBurst: cpuBurstGroups,
    burstSurvival: burstSurvivalGroups,
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
