import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * "Real tasks at once": the published Fix and test workload started several
 * times together on one provider, on the same 4 vCPU, 8 GB machine. Timing
 * only; no cost. Written by the harness's `realistic burst` command into
 * src/data/realtask-burst.json.
 */
export interface BurstTask {
  round: number;
  wallS: number | null;
  completed: boolean;
  failure: { stage: string; reason: string } | null;
}

export type BurstProvider =
  | {
      provider: ProviderId;
      status: "ran";
      tasks: BurstTask[];
      medianWallS: number | null;
      completed: number;
      attempts: number;
      roundAllDoneS: number[];
      /** The same day's control: the same task alone, in rounds between the bursts. */
      solo: { tasks: BurstTask[]; completed: number; attempts: number } | null;
      soloMedianWallS: number | null;
      slowdown: number | null;
      slowdownWithoutUpload: number | null;
      /** Why no change from alone is shown, when the data holds one back. */
      changeNote: string | null;
      /** Uploading the toolchain from our machine, part of every task's time. */
      medianUploadS: number | null;
      soloMedianUploadS: number | null;
      /** Set when this provider came from a separate rerun with a different date or SDK commit. */
      run?: { id: string; sdkCommit: string; startedAt: string } | null;
    }
  | { provider: ProviderId; status: "not-run"; reason: string };

export interface RealtaskBurst {
  generatedAt: string;
  run: { id: string; sdkCommit: string; startedAt: string; endedAt: string; location: string; mode: string | null };
  size: number;
  rounds: number;
  providers: BurstProvider[];
}

type Json = Record<string, unknown>;
const fail = (path: string, what: string): never => {
  throw new Error(`realtask-burst.json: ${path} ${what}`);
};
const obj = (v: unknown, path: string): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : fail(path, "must be an object"));
const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, "must be an array"));
const str = (v: unknown, path: string): string => (typeof v === "string" ? v : fail(path, "must be a string"));
const num = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(path, "must be a finite number"));
const positive = (v: unknown, path: string): number => {
  const n = num(v, path);
  return n > 0 ? n : fail(path, "must be above 0");
};
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
/** A stored figure must match the one its tasks give, to within rounding. */
const agrees = (stored: number | null, derived: number | null, path: string) => {
  if (stored === null || derived === null) return;
  if (Math.abs(stored - derived) > Math.max(0.01, Math.abs(derived) * 0.005)) fail(path, `is ${stored} but its tasks give ${derived}`);
};
const count = (v: unknown, path: string): number => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fail(path, "must be a whole number"));
const orNull = <T>(read: (v: unknown, path: string) => T) => (v: unknown, path: string): T | null => (v === null || v === undefined ? null : read(v, path));

function parseTask(v: unknown, path: string): BurstTask {
  const o = obj(v, path);
  const completed = o.completed === true;
  const failure = o.failure === undefined || o.failure === null ? null : obj(o.failure, `${path}.failure`);
  return {
    round: count(o.round, `${path}.round`),
    wallS: orNull(num)(o.wallS, `${path}.wallS`),
    completed,
    failure: failure ? { stage: str(failure.stage, `${path}.failure.stage`), reason: str(failure.reason, `${path}.failure.reason`) } : null,
  };
}

function parseSolo(v: unknown, path: string) {
  if (v === undefined || v === null) return null;
  const o = obj(v, path);
  const tasks = arr(o.tasks, `${path}.tasks`).map((t, i) => parseTask(t, `${path}.tasks[${i}]`));
  const completed = count(o.completed, `${path}.completed`);
  const attempts = count(o.attempts, `${path}.attempts`);
  if (attempts !== tasks.length || completed !== tasks.filter((t) => t.completed).length) fail(path, "counts do not match its tasks");
  return { tasks, completed, attempts };
}

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** True only for a real calendar ISO-8601 timestamp (rejects bare numbers like "0" and rollover dates like Feb 30). */
export function isIsoTimestamp(value: string): boolean {
  const m = ISO_TIMESTAMP.exec(value);
  if (!m) return false;
  const [, yStr, moStr, dStr, hStr, miStr, sStr, , tzHStr, tzMStr] = m;
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const mi = Number(miStr);
  const s = Number(sStr);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return false;
  if (tzHStr !== undefined && (Number(tzHStr) > 23 || Number(tzMStr) > 59)) return false;
  const cal = new Date(0);
  cal.setUTCFullYear(y, mo - 1, d);
  return cal.getUTCFullYear() === y && cal.getUTCMonth() === mo - 1 && cal.getUTCDate() === d && !Number.isNaN(Date.parse(value));
}

function isoTimestamp(v: unknown, path: string): string {
  const value = str(v, path);
  if (!isIsoTimestamp(value)) fail(path, "must be a valid ISO-8601 timestamp");
  return value;
}

function parseProvider(v: unknown, path: string): BurstProvider {
  const o = obj(v, path);
  const id = str(o.provider, `${path}.provider`);
  const provider = isProviderId(id) ? id : fail(`${path}.provider`, `is not a known provider: ${id}`);
  if (o.status === "not-run") return { provider, status: "not-run", reason: str(o.reason, `${path}.reason`) };
  if (o.status !== "ran") return fail(`${path}.status`, "must be ran or not-run");
  const tasks = arr(o.tasks, `${path}.tasks`).map((t, i) => parseTask(t, `${path}.tasks[${i}]`));
  const completed = count(o.completed, `${path}.completed`);
  const attempts = count(o.attempts, `${path}.attempts`);
  if (attempts !== tasks.length) fail(`${path}.attempts`, `is ${attempts} but there are ${tasks.length} tasks`);
  if (completed !== tasks.filter((t) => t.completed).length) fail(`${path}.completed`, "does not match the completed tasks");
  const solo = parseSolo(o.solo, `${path}.solo`);
  const medianWallS = orNull(positive)(o.medianWallS, `${path}.medianWallS`);
  const soloMedianWallS = orNull(positive)(o.soloMedianWallS, `${path}.soloMedianWallS`);
  const slowdown = orNull(positive)(o.slowdown, `${path}.slowdown`);
  const doneTimes = (ts: readonly BurstTask[]) => ts.flatMap((t) => (t.completed && t.wallS !== null ? [t.wallS] : []));
  const burstDone = doneTimes(tasks);
  agrees(medianWallS, burstDone.length ? median(burstDone) : null, `${path}.medianWallS`);
  if (solo) {
    const soloDone = doneTimes(solo.tasks);
    agrees(soloMedianWallS, soloDone.length ? median(soloDone) : null, `${path}.soloMedianWallS`);
  }
  if (slowdown !== null && (medianWallS === null || soloMedianWallS === null)) fail(`${path}.slowdown`, "needs both medians");
  agrees(slowdown, medianWallS !== null && soloMedianWallS !== null ? medianWallS / soloMedianWallS : null, `${path}.slowdown`);
  const providerRun =
    o.run === undefined || o.run === null
      ? null
      : (() => {
          const r = obj(o.run, `${path}.run`);
          return { id: str(r.id, `${path}.run.id`), sdkCommit: str(r.sdkCommit, `${path}.run.sdkCommit`), startedAt: isoTimestamp(r.startedAt, `${path}.run.startedAt`) };
        })();
  return {
    provider,
    status: "ran",
    tasks,
    medianWallS,
    completed,
    attempts,
    roundAllDoneS: arr(o.roundAllDoneS ?? [], `${path}.roundAllDoneS`).map((x, i) => num(x, `${path}.roundAllDoneS[${i}]`)),
    solo,
    soloMedianWallS,
    slowdown,
    slowdownWithoutUpload: orNull(positive)(o.slowdownWithoutUpload, `${path}.slowdownWithoutUpload`),
    changeNote: orNull(str)(o.changeNote, `${path}.changeNote`),
    medianUploadS: orNull(num)(o.medianUploadS, `${path}.medianUploadS`),
    soloMedianUploadS: orNull(num)(o.soloMedianUploadS, `${path}.soloMedianUploadS`),
    ...(providerRun ? { run: providerRun } : {}),
  };
}

/** Parses the file, so a malformed one stops the build instead of reaching the page. */
export function parseRealtaskBurst(raw: unknown): RealtaskBurst {
  const o = obj(raw, "root");
  if (o.schema !== 1) fail("schema", "must be 1");
  if (o.track !== "same-machine" || o.profile !== "fix-and-test") fail("track/profile", "must be same-machine fix-and-test");
  const run = obj(o.run, "run");
  const providers = arr(o.providers, "providers").map((p, i) => parseProvider(p, `providers[${i}]`));
  const seen = new Set<ProviderId>();
  for (const p of providers) {
    if (seen.has(p.provider)) fail("providers", `lists ${p.provider} twice`);
    seen.add(p.provider);
  }
  return {
    generatedAt: str(o.generatedAt, "generatedAt"),
    run: { id: str(run.id, "run.id"), sdkCommit: str(run.sdkCommit, "run.sdkCommit"), startedAt: isoTimestamp(run.startedAt, "run.startedAt"), endedAt: str(run.endedAt, "run.endedAt"), location: str(run.location, "run.location"), mode: orNull(str)(run.mode, "run.mode") },
    size: count(o.size, "size"),
    rounds: count(o.rounds, "rounds"),
    providers,
  };
}

export type BurstRan = Extract<BurstProvider, { status: "ran" }> & { medianWallS: number };

/** Providers with a median time under load, fastest first, and the rest with why they have none. */
export function burstTimes(data: RealtaskBurst) {
  const timed = data.providers.filter((p): p is BurstRan => p.status === "ran" && p.medianWallS !== null).sort((a, b) => a.medianWallS - b.medianWallS);
  const missing = data.providers.flatMap((p) =>
    p.status === "not-run" ? [{ id: p.provider, why: `not run: ${p.reason}` }] : p.medianWallS === null ? [{ id: p.provider, why: `no task completed (0 of ${p.attempts})` }] : [],
  );
  return { timed, missing };
}
