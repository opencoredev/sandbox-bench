import { formatShort } from "@/lib/format";
import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * Sustained CPU over 15 minutes: every provider's 4 vCPU, 8 GB sandbox kept
 * busy on all cores for 30 back-to-back 30-second segments, so a CPU that
 * runs on burst credit shows the speed it falls to once the credit is spent.
 * This is the site's model of `src/data/sustained-cpu.json`, its parser (the
 * boundary: a malformed file stops the build) and the pure rules the chart
 * and the agent files share.
 *
 * The file, `sustained-cpu.v1`:
 *
 *   schema            "sustained-cpu.v1"
 *   generatedAt       ISO timestamp
 *   track             "same-machine"
 *   targetDurationS   900, segmentDurationS 30, segmentsTarget 30
 *   run               { id, sdkCommit, startedAt (ISO) }
 *   providers[]       one per provider, no repeats:
 *     provider        a provider id
 *     status          "completed" (every segment ran), "stopped-early" (some
 *                     segments ran, then the run stopped) or "failed"
 *     stopReason      why it stopped: null when completed, a string otherwise
 *     guestVcpus      vCPUs the guest reported, a whole number above 0, or null
 *     durationS       seconds from the first segment's start to the end of the run
 *     segments[]      { index (0, 1, 2, ...), startS, durationS, opsPerS,
 *                     checksumVerified: true }, each starting no earlier than
 *                     the one before it ended. opsPerS is all-core 32-bit LCG
 *                     operations per second; a segment whose checksum failed is
 *                     not listed, and the run says why it stopped.
 *     first3MinOps    mean opsPerS of the segments starting in minutes 0–3, or null with none
 *     last3MinOps     mean opsPerS of the segments starting in minutes 12–15, or null with none
 *     retention       last3MinOps / first3MinOps, or null when either is null
 *
 * The stored means and retention must agree with the segments to within rounding.
 */

export const SCHEMA = "sustained-cpu.v1";

export const sustainedStatuses = ["completed", "stopped-early", "failed"] as const;
export type SustainedStatus = (typeof sustainedStatuses)[number];

/** The run's shape, fixed by the schema: 30 segments of 30 seconds. */
export const TARGET_DURATION_S = 900;
export const SEGMENT_DURATION_S = 30;
export const SEGMENTS_TARGET = 30;
/** The windows retention compares: the first 3 minutes and the last 3. */
export const WINDOW_S = 180;
export const firstWindowLabel = "Minutes 0–3";
export const lastWindowLabel = "Minutes 12–15";

export interface CpuSegment {
  index: number;
  startS: number;
  durationS: number;
  opsPerS: number;
}

interface RunFigures {
  provider: ProviderId;
  guestVcpus: number | null;
  durationS: number;
  segments: readonly CpuSegment[];
}

/** A provider's run. Only a completed run is sure to have both windows; a run that stopped early may have reached minute 12 or not. */
export type SustainedProvider =
  | (RunFigures & { status: "completed"; stopReason: null; first3MinOps: number; last3MinOps: number; retention: number })
  | (RunFigures & { status: "stopped-early" | "failed"; stopReason: string; first3MinOps: number | null; last3MinOps: number | null; retention: number | null });

export interface SustainedRun {
  id: string;
  sdkCommit: string;
  startedAt: string;
}

export interface SustainedCpuData {
  generatedAt: string;
  track: "same-machine";
  targetDurationS: typeof TARGET_DURATION_S;
  segmentDurationS: typeof SEGMENT_DURATION_S;
  segmentsTarget: typeof SEGMENTS_TARGET;
  run: SustainedRun;
  providers: readonly SustainedProvider[];
}

// ---------------------------------------------------------------------------
// The parser.

type Json = Record<string, unknown>;

const fail = (path: string, what: string): never => {
  throw new Error(`sustained-cpu.json: ${path} ${what}`);
};
const isJson = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Json => (isJson(v) ? v : fail(path, "must be an object"));
const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, "must be an array"));
const str = (v: unknown, path: string): string => (typeof v === "string" && v.length > 0 ? v : fail(path, "must be a non-empty string"));
const nonNegative = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fail(path, "must be a finite number, 0 or more"));
const positive = (v: unknown, path: string): number => {
  const n = nonNegative(v, path);
  return n > 0 ? n : fail(path, "must be above 0");
};
const wholeAbove0 = (v: unknown, path: string): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fail(path, "must be a whole number above 0"));
const orNull =
  <T>(read: (v: unknown, path: string) => T) =>
  (v: unknown, path: string): T | null =>
    v === null ? null : read(v, path);

function iso(v: unknown, path: string): string {
  const s = str(v, path);
  return Number.isNaN(Date.parse(s)) ? fail(path, `must be a valid timestamp, not ${s}`) : s;
}

const isStatus = (v: unknown): v is SustainedStatus => sustainedStatuses.some((s) => s === v);

const mean = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((sum, x) => sum + x, 0) / xs.length);

/** Mean opsPerS of the segments that start in the first 3 minutes (0–3 min), and in minutes 12–15 (720 s ≤ startS < 900 s). */
export function windowMeans(segments: readonly CpuSegment[]) {
  return {
    first: mean(segments.filter((s) => s.startS < WINDOW_S).map((s) => s.opsPerS)),
    last: mean(segments.filter((s) => s.startS >= TARGET_DURATION_S - WINDOW_S && s.startS < TARGET_DURATION_S).map((s) => s.opsPerS)),
  };
}

/** A stored figure, null exactly when its derived one is, and within `tolerance` of it. */
function agrees({ stored, derived, tolerance, path }: { stored: number | null; derived: number | null; tolerance: number; path: string }) {
  if (stored === null && derived === null) return;
  if (stored === null || derived === null) fail(path, `is ${String(stored)} but its segments give ${String(derived)}`);
  else if (Math.abs(stored - derived) > tolerance) fail(path, `is ${stored} but its segments give ${derived}`);
}

/** Rounded to 2 decimals, a ratio can be off by 0.005; floating point adds a hair. */
const RETENTION_TOLERANCE = 0.005 + 1e-9;
/** A stored mean may be rounded, at most this share of its value. */
const MEAN_TOLERANCE = 0.005;
/** Timers on either side of a segment boundary can disagree by this much. */
const CLOCK_SLACK_S = 1;

function parseSegment(v: unknown, path: string, index: number): CpuSegment {
  const o = obj(v, path);
  if (o.index !== index) fail(`${path}.index`, `must be ${index}`);
  if (o.checksumVerified !== true) fail(`${path}.checksumVerified`, "must be true: a segment whose checksum failed isn't published");
  const durationS = positive(o.durationS, `${path}.durationS`);
  if (durationS < SEGMENT_DURATION_S - CLOCK_SLACK_S) fail(`${path}.durationS`, `is ${durationS}, shorter than a ${SEGMENT_DURATION_S}-second segment`);
  if (durationS > SEGMENT_DURATION_S * 4) fail(`${path}.durationS`, `is ${durationS}, too long for a ${SEGMENT_DURATION_S}-second segment`);
  return { index, startS: nonNegative(o.startS, `${path}.startS`), durationS, opsPerS: nonNegative(o.opsPerS, `${path}.opsPerS`) };
}

function parseSegments(v: unknown, path: string): CpuSegment[] {
  const segments = arr(v, path).map((s, i) => parseSegment(s, `${path}[${i}]`, i));
  if (segments.length > SEGMENTS_TARGET) fail(path, `has ${segments.length} segments, more than ${SEGMENTS_TARGET}`);
  segments.forEach((s, i) => {
    const prev = segments[i - 1];
    if (prev && s.startS < prev.startS + prev.durationS - CLOCK_SLACK_S) fail(`${path}[${i}].startS`, `is ${s.startS}, before the previous segment ended at ${prev.startS + prev.durationS}`);
    if (s.startS >= TARGET_DURATION_S * 2) fail(`${path}[${i}].startS`, `is ${s.startS}, past twice the ${TARGET_DURATION_S} s run`);
  });
  return segments;
}

function parseProvider(v: unknown, path: string): SustainedProvider {
  const o = obj(v, path);
  const id = str(o.provider, `${path}.provider`);
  const provider = isProviderId(id) ? id : fail(`${path}.provider`, `is not a known provider: ${id}`);
  const status = isStatus(o.status) ? o.status : fail(`${path}.status`, `must be one of ${sustainedStatuses.join(", ")}`);
  const segments = parseSegments(o.segments, `${path}.segments`);
  const durationS = nonNegative(o.durationS, `${path}.durationS`);
  const last = segments.at(-1);
  if (last && durationS + CLOCK_SLACK_S < last.startS + last.durationS) fail(`${path}.durationS`, `is ${durationS}, shorter than its segments, which end at ${last.startS + last.durationS}`);
  const guestVcpus = orNull(wholeAbove0)(o.guestVcpus, `${path}.guestVcpus`);
  const first3MinOps = orNull(nonNegative)(o.first3MinOps, `${path}.first3MinOps`);
  const last3MinOps = orNull(nonNegative)(o.last3MinOps, `${path}.last3MinOps`);
  const retention = orNull(nonNegative)(o.retention, `${path}.retention`);
  const derived = windowMeans(segments);
  agrees({ stored: first3MinOps, derived: derived.first, tolerance: Math.abs(derived.first ?? 0) * MEAN_TOLERANCE, path: `${path}.first3MinOps` });
  agrees({ stored: last3MinOps, derived: derived.last, tolerance: Math.abs(derived.last ?? 0) * MEAN_TOLERANCE, path: `${path}.last3MinOps` });
  // From the stored means, so a file that rounds them still agrees with itself; a first window of 0 ops has no ratio.
  const ratio = first3MinOps !== null && last3MinOps !== null && first3MinOps > 0 ? last3MinOps / first3MinOps : null;
  agrees({ stored: retention, derived: ratio, tolerance: RETENTION_TOLERANCE, path: `${path}.retention` });
  const common = { provider, guestVcpus, durationS, segments };
  switch (status) {
    case "completed": {
      if (o.stopReason !== null) fail(`${path}.stopReason`, "must be null on a completed run");
      if (segments.length !== SEGMENTS_TARGET) fail(`${path}.segments`, `has ${segments.length} segments; a completed run has ${SEGMENTS_TARGET}`);
      // Both windows have segments in a full run, so the agreement checks above already made these non-null.
      if (first3MinOps === null || last3MinOps === null || retention === null) return fail(path, "a completed run needs first3MinOps, last3MinOps and retention");
      return { ...common, status, stopReason: null, first3MinOps, last3MinOps, retention };
    }
    case "stopped-early":
    case "failed": {
      const stopReason = str(o.stopReason, `${path}.stopReason`);
      if (status === "stopped-early" && segments.length === 0) fail(`${path}.segments`, "is empty; a run with no segment failed, it didn't stop early");
      if (segments.length === SEGMENTS_TARGET) fail(`${path}.status`, `is ${status}, but all ${SEGMENTS_TARGET} segments ran`);
      return { ...common, status, stopReason, first3MinOps, last3MinOps, retention };
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Parses the file, so a malformed one stops the build instead of reaching the page. */
export function parseSustainedCpu(raw: unknown): SustainedCpuData {
  const o = obj(raw, "root");
  if (o.schema !== SCHEMA) fail("schema", `must be ${SCHEMA}`);
  if (o.track !== "same-machine") fail("track", "must be same-machine");
  if (o.targetDurationS !== TARGET_DURATION_S) fail("targetDurationS", `must be ${TARGET_DURATION_S}`);
  if (o.segmentDurationS !== SEGMENT_DURATION_S) fail("segmentDurationS", `must be ${SEGMENT_DURATION_S}`);
  if (o.segmentsTarget !== SEGMENTS_TARGET) fail("segmentsTarget", `must be ${SEGMENTS_TARGET}`);
  const run = obj(o.run, "run");
  const providers = arr(o.providers, "providers").map((p, i) => parseProvider(p, `providers[${i}]`));
  const seen = new Set<ProviderId>();
  for (const p of providers) {
    if (seen.has(p.provider)) fail("providers", `lists ${p.provider} twice`);
    seen.add(p.provider);
  }
  return {
    generatedAt: iso(o.generatedAt, "generatedAt"),
    track: "same-machine",
    targetDurationS: TARGET_DURATION_S,
    segmentDurationS: SEGMENT_DURATION_S,
    segmentsTarget: SEGMENTS_TARGET,
    run: { id: str(run.id, "run.id"), sdkCommit: str(run.sdkCommit, "run.sdkCommit"), startedAt: iso(run.startedAt, "run.startedAt") },
    providers,
  };
}

// ---------------------------------------------------------------------------
// Rules the chart and the agent files share.

/** Whether the file has any provider yet; the section shows nothing until it does. */
export const hasSustainedCpu = (d: Pick<SustainedCpuData, "providers">) => d.providers.length > 0;

/** A run with a steady-state figure: it reached minute 12 and has both windows. */
export type SteadyRun = SustainedProvider & { first3MinOps: number; last3MinOps: number; retention: number };

const isSteady = (p: SustainedProvider): p is SteadyRun => p.first3MinOps !== null && p.last3MinOps !== null && p.retention !== null;

/** "15 min", "11.5 min". */
export const minutesText = (s: number) => `${Number((s / 60).toFixed(1))} min`;

/** "16%": retention, minutes 12–15 over minutes 0–3. */
export const retentionText = (r: number) => `${Math.round(r * 100)}%`;

/** "45.2M ops/s". */
export const opsText = (v: number) => `${formatShort(v, "ops/s")} ops/s`;

/** Why a run has no steady-state figure, in plain words. */
export function noSteadyWhy(p: SustainedProvider): string {
  switch (p.status) {
    case "failed":
      return `failed: ${p.stopReason}`;
    case "stopped-early":
      return `stopped at ${minutesText(p.durationS)}, before minute 12: ${p.stopReason}`;
    case "completed":
      return "no steady-state figure";
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

/**
 * Runs with a figure for minutes 12–15, highest first (ties by id), and
 * the rest with why they have none: a failed run, or one that stopped before minute 12.
 */
export function sustainedRanked(d: Pick<SustainedCpuData, "providers">) {
  const ranked = d.providers.filter(isSteady).sort((a, b) => b.last3MinOps - a.last3MinOps || a.provider.localeCompare(b.provider));
  const missing = d.providers.filter((p) => !isSteady(p)).map((p) => ({ provider: p.provider, why: noSteadyWhy(p) }));
  return { ranked, missing };
}

/** "Styne: 45.2M ops/s in minutes 0–3, 7.2M ops/s in minutes 12–15, 16% retained", one line for agent files. */
export const steadyText = (p: SteadyRun) => `${opsText(p.first3MinOps)} in minutes 0–3, ${opsText(p.last3MinOps)} in minutes 12–15, ${retentionText(p.retention)} retained`;
