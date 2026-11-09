import { formatPerThousand } from "@/lib/cost";
import { isProviderId, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import type { TrackId } from "@/lib/tracks";

/**
 * The realistic workloads (SBX-94): real work in a fresh sandbox, from the
 * create request to confirmed deletion, priced per completed task. This is
 * the site's model of `src/data/realistic.json`, its parser (the boundary,
 * run by the build and by the data script) and the pure rules the page and
 * the agent files share: statuses, the pick and the idle diagnostic.
 *
 * Regenerate the data with `bun scripts/realistic-site-data.ts` (see its header).
 */

export const SCHEMA = "realistic-site/1";

export const profileIds = ["fix-and-test", "build"] as const;
export type ProfileId = (typeof profileIds)[number];

/** The harness names tracks differently from the site. */
export const runTracks = ["same-machine", "default"] as const;
export type RunTrack = (typeof runTracks)[number];
export const siteTrackOf = { "same-machine": "same-spec", default: "default" } as const satisfies Record<RunTrack, TrackId>;
export const runTrackOf = { "same-spec": "same-machine", default: "default" } as const satisfies Record<TrackId, RunTrack>;

export const variantIds = ["headline", "zero-wait", "held-10", "held-60"] as const;
export type VariantId = (typeof variantIds)[number];

export const idleIds = ["zero-wait", "held-10", "held-60"] as const;
export type IdleId = (typeof idleIds)[number];
export const idleMinutes = { "zero-wait": 0, "held-10": 10, "held-60": 60 } as const satisfies Record<IdleId, number>;

export const costKindIds = ["billed", "metered", "estimate"] as const;
export type CostKind = (typeof costKindIds)[number];

/** One frozen workload's reference footprint on the 4 vCPU / 8 GiB machine, from the workload manifest. */
export interface Workload {
  repo: string;
  commit: string;
  /** CPU-seconds of the work itself (install excluded), lowest and highest of the reference runs. */
  workCpuS: { min: number; max: number };
  /** Peak memory of the work: whole peak for fix and test, anonymous (non-cache) peak for the build. */
  memoryGiB: { min: number; max: number };
  /** Tests passing after the fix, for fix and test. */
  tests: number | null;
}

/** Why setup stopped before the workload, where the attempt says. */
export type PrepareFailure = { kind: "insufficient-disk"; freeGiB: number; requiredGiB: number; runs: number };

export interface RealisticRow {
  provider: ProviderId;
  profile: ProfileId;
  track: RunTrack;
  variant: VariantId;
  attempts: number;
  completed: number;
  incomplete: number;
  /** Attempts never started, such as a default machine too small for the workload. */
  notRun: number;
  reasons: readonly { reason: string; runs: number }[];
  prepare: PrepareFailure | null;
  medianWallS: number | null;
  medianCpuS: number | null;
  /** All attempts' cost over completed tasks; null with no completed task. */
  cost: { kind: CostKind; usdPerCompleted: number; wholeMachineUsdPerCompleted: number | null } | null;
  /** The harness's note on how the cost was made, where it gives one. */
  costNote: string | null;
  billingModel: string | null;
  /** From the harness's eligibility table: billed and settled (or reconciled), attributable, at most one incomplete run, right machine size. */
  eligible: boolean;
  /** Each reason the row isn't eligible, as the harness words it. */
  flags: readonly string[];
}

export interface HeldOpen {
  provider: ProviderId;
  idle: IdleId;
  runs: number;
  completed: number;
  costKind: CostKind | null;
  /** Median total cost of one run: fix and test, the wait, then the resume step. */
  medianCostUsd: number | null;
  changeVsZeroWait: number | null;
  status: string;
  medianWakeMs: number | null;
  transitions: readonly string[];
}

export interface RealisticData {
  schema: typeof SCHEMA;
  generatedAt: string;
  sources: readonly { name: string; generatedAt: string; providers: readonly ProviderId[] }[];
  fx: { eurToUsd: number; date: string } | null;
  workloads: Record<ProfileId, Workload> | null;
  rows: readonly RealisticRow[];
  heldOpen: readonly HeldOpen[];
}

// ---------------------------------------------------------------------------
// Parsing: the boundary. Throws with the path of the first bad field.

type Json = Record<string, unknown>;

const fail = (path: string, what: string): never => {
  throw new Error(`realistic data: ${path} ${what}`);
};
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Json => (isObj(v) ? v : fail(path, "must be an object"));
const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, "must be an array"));
const str = (v: unknown, path: string): string => (typeof v === "string" ? v : fail(path, "must be a string"));
const num = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(path, "must be a finite number"));
const count = (v: unknown, path: string): number => {
  const n = num(v, path);
  return Number.isInteger(n) && n >= 0 ? n : fail(path, "must be a whole number, 0 or more");
};
const nullable = <T>(read: (v: unknown, path: string) => T) => (v: unknown, path: string): T | null => (v === null || v === undefined ? null : read(v, path));
const oneOf = <T extends string>(ids: readonly T[]) => (v: unknown, path: string): T => {
  const s = str(v, path);
  const hit = ids.find((id) => id === s);
  return hit ?? fail(path, `must be one of ${ids.join(", ")}, not "${s}"`);
};
const providerOf = (v: unknown, path: string): ProviderId => {
  const s = str(v, path);
  return isProviderId(s) ? s : fail(path, `names an unknown provider "${s}"; add it to src/lib/providers.ts first`);
};

const parseRange = (v: unknown, path: string) => {
  const o = obj(v, path);
  const min = num(o.min, `${path}.min`);
  const max = num(o.max, `${path}.max`);
  return min <= max ? { min, max } : fail(path, "min must not exceed max");
};

function parseWorkload(v: unknown, path: string): Workload {
  const o = obj(v, path);
  return {
    repo: str(o.repo, `${path}.repo`),
    commit: str(o.commit, `${path}.commit`),
    workCpuS: parseRange(o.workCpuS, `${path}.workCpuS`),
    memoryGiB: parseRange(o.memoryGiB, `${path}.memoryGiB`),
    tests: nullable(count)(o.tests, `${path}.tests`),
  };
}

function parseRow(v: unknown, path: string): RealisticRow {
  const o = obj(v, path);
  const attempts = count(o.attempts, `${path}.attempts`);
  const completed = count(o.completed, `${path}.completed`);
  const incomplete = count(o.incomplete, `${path}.incomplete`);
  const notRun = count(o.notRun, `${path}.notRun`);
  if (completed + incomplete + notRun !== attempts) fail(path, "completed, incomplete and notRun must add up to attempts");
  const cost = o.cost === null ? null : obj(o.cost, `${path}.cost`);
  const prepare = o.prepare === null || o.prepare === undefined ? null : obj(o.prepare, `${path}.prepare`);
  const row: RealisticRow = {
    provider: providerOf(o.provider, `${path}.provider`),
    profile: oneOf(profileIds)(o.profile, `${path}.profile`),
    track: oneOf(runTracks)(o.track, `${path}.track`),
    variant: oneOf(variantIds)(o.variant, `${path}.variant`),
    attempts,
    completed,
    incomplete,
    notRun,
    reasons: arr(o.reasons, `${path}.reasons`).map((r, i) => {
      const ro = obj(r, `${path}.reasons[${i}]`);
      return { reason: str(ro.reason, `${path}.reasons[${i}].reason`), runs: count(ro.runs, `${path}.reasons[${i}].runs`) };
    }),
    prepare: prepare
      ? {
          kind: oneOf(["insufficient-disk"] as const)(prepare.kind, `${path}.prepare.kind`),
          freeGiB: num(prepare.freeGiB, `${path}.prepare.freeGiB`),
          requiredGiB: num(prepare.requiredGiB, `${path}.prepare.requiredGiB`),
          runs: count(prepare.runs, `${path}.prepare.runs`),
        }
      : null,
    medianWallS: nullable(num)(o.medianWallS, `${path}.medianWallS`),
    medianCpuS: nullable(num)(o.medianCpuS, `${path}.medianCpuS`),
    cost: cost
      ? {
          kind: oneOf(costKindIds)(cost.kind, `${path}.cost.kind`),
          usdPerCompleted: num(cost.usdPerCompleted, `${path}.cost.usdPerCompleted`),
          wholeMachineUsdPerCompleted: nullable(num)(cost.wholeMachineUsdPerCompleted, `${path}.cost.wholeMachineUsdPerCompleted`),
        }
      : null,
    costNote: nullable(str)(o.costNote, `${path}.costNote`),
    billingModel: nullable(str)(o.billingModel, `${path}.billingModel`),
    eligible: o.eligible === true ? true : o.eligible === false ? false : fail(`${path}.eligible`, "must be true or false"),
    flags: arr(o.flags, `${path}.flags`).map((f, i) => str(f, `${path}.flags[${i}]`)),
  };
  if (row.cost !== null && row.completed === 0) fail(path, "has a cost per completed task but no completed task");
  if (row.eligible && (row.cost === null || row.flags.length > 0)) fail(path, "is eligible, so it needs a cost and no flags");
  return row;
}

function parseHeld(v: unknown, path: string): HeldOpen {
  const o = obj(v, path);
  return {
    provider: providerOf(o.provider, `${path}.provider`),
    idle: oneOf(idleIds)(o.idle, `${path}.idle`),
    runs: count(o.runs, `${path}.runs`),
    completed: count(o.completed, `${path}.completed`),
    costKind: nullable(oneOf(costKindIds))(o.costKind, `${path}.costKind`),
    medianCostUsd: nullable(num)(o.medianCostUsd, `${path}.medianCostUsd`),
    changeVsZeroWait: nullable(num)(o.changeVsZeroWait, `${path}.changeVsZeroWait`),
    status: str(o.status, `${path}.status`),
    medianWakeMs: nullable(num)(o.medianWakeMs, `${path}.medianWakeMs`),
    transitions: arr(o.transitions, `${path}.transitions`).map((t, i) => str(t, `${path}.transitions[${i}]`)),
  };
}

/** Reads `src/data/realistic.json`, or the script's output before it is written. */
export function parseRealistic(raw: unknown): RealisticData {
  const o = obj(raw, "file");
  if (o.schema !== SCHEMA) fail("schema", `must be "${SCHEMA}"`);
  const fx = o.fx === null ? null : obj(o.fx, "fx");
  const workloads = o.workloads === null ? null : obj(o.workloads, "workloads");
  const rows = arr(o.rows, "rows").map((r, i) => parseRow(r, `rows[${i}]`));
  const keys = new Set<string>();
  for (const r of rows) {
    const key = `${r.provider}/${r.profile}/${r.track}/${r.variant}`;
    if (keys.has(key)) fail("rows", `has ${key} twice`);
    keys.add(key);
  }
  return {
    schema: SCHEMA,
    generatedAt: str(o.generatedAt, "generatedAt"),
    sources: arr(o.sources, "sources").map((s, i) => {
      const so = obj(s, `sources[${i}]`);
      return {
        name: str(so.name, `sources[${i}].name`),
        generatedAt: str(so.generatedAt, `sources[${i}].generatedAt`),
        providers: arr(so.providers, `sources[${i}].providers`).map((p, j) => providerOf(p, `sources[${i}].providers[${j}]`)),
      };
    }),
    fx: fx ? { eurToUsd: num(fx.eurToUsd, "fx.eurToUsd"), date: str(fx.date, "fx.date") } : null,
    workloads: workloads
      ? { "fix-and-test": parseWorkload(workloads["fix-and-test"], "workloads.fix-and-test"), build: parseWorkload(workloads.build, "workloads.build") }
      : null,
    rows,
    heldOpen: arr(o.heldOpen, "heldOpen").map((h, i) => parseHeld(h, `heldOpen[${i}]`)),
  };
}

// ---------------------------------------------------------------------------
// Words. Every sentence about these results is made here, so the page and the agent files agree.

/** The one pilot line, said wherever these numbers appear. */
export const pilotDetail = "5 runs per provider; most costs are provider meters or estimates not yet checked against settled bills.";
export const pilotLine = `Pilot: ${pilotDetail}`;
export const laterLine = "The full 10-batch run and recorded agent sessions come later.";

export const profileInfo = {
  "fix-and-test": { label: "Fix and test", task: "fix-and-test run" },
  build: { label: "Build", task: "build" },
} as const satisfies Record<ProfileId, { label: string; task: string }>;

const range = ({ min, max }: { min: number; max: number }, digits = 0) => {
  const a = min.toFixed(digits);
  const b = max.toFixed(digits);
  return a === b ? a : `${a}–${b}`;
};

/** What each workload does, in plain words, with its reference footprint when the data carries one. */
export function profileWhat(profile: ProfileId, w: Workload | null): string {
  switch (profile) {
    case "fix-and-test":
      return `Apply a real Vue bug, run the type checker and Vue's ${w?.tests ? `${w.tests.toLocaleString("en-US")} ` : ""}tests, apply the fix, run them again`;
    case "build":
      return "A production build of the Jitsi Meet web app";
    default: {
      const _exhaustive: never = profile;
      return _exhaustive;
    }
  }
}

/** "About 175–204 CPU-seconds and 2.5 GiB on the 4 vCPU, 8 GB reference machine", or null without a footprint. */
export function profileFootprint(profile: ProfileId, w: Workload | null): string | null {
  if (!w) return null;
  const memory = profile === "build" ? `${range(w.memoryGiB, 1)} GiB of memory` : `${range(w.memoryGiB, 1)} GiB`;
  return `about ${range(w.workCpuS)} CPU-seconds and ${memory} on a 4 vCPU, 8 GB reference machine, install excluded`;
}

/** Why a row can't be the pick, grouped by kind so a bar can say it in a word or two. */
export type FlagKind = "unsettled" | "provisional" | "estimate" | "wrong-size" | "incomplete" | "did-not-complete" | "unattributable" | "other";

export interface Flag {
  kind: FlagKind;
  /** A word or two for bars and tables. */
  short: string;
  /** A plain sentence fragment for notes and agent files. */
  text: string;
}

const flagShort = {
  unsettled: "unsettled",
  provisional: "provisional",
  estimate: "unconfirmed",
  "wrong-size": "wrong size",
  incomplete: "too many failures",
  "did-not-complete": "did not complete",
  unattributable: "not attributable",
  other: "not eligible",
} as const satisfies Record<FlagKind, string>;

/** One of the harness's eligibility reasons, read into a kind and plain words. Unknown wording is kept as it is. */
export function readFlag(flag: string): Flag {
  const make = (kind: FlagKind, text: string): Flag => ({ kind, short: flagShort[kind], text });
  if (flag.startsWith("unsettled")) return make("unsettled", "the provider hasn't settled the charge yet, so it can still change");
  if (flag.startsWith("provisional")) {
    if (flag.includes("meter not reconciled")) return make("provisional", "its usage meter hasn't been checked against settled charges yet");
    if (flag.includes("storage coverage")) return make("provisional", "it isn't known yet whether its billing source includes disk");
    return make("provisional", flag.replace(/^provisional:\s*/, ""));
  }
  if (flag.startsWith("unverified estimate"))
    return make("estimate", "our measured time at list price; the provider hasn't confirmed its billing rules in writing, and no isolated billing window was checked");
  const size = /^wrong machine size: ([\d.]+) GiB memory/.exec(flag);
  if (size?.[1]) return make("wrong-size", `it ran with ${Number(size[1]).toFixed(1)} GiB of memory, not the 8 GiB this track asks for`);
  if (flag.startsWith("wrong machine size")) return make("wrong-size", flag.replace(/^wrong machine size:\s*/, "its machine isn't the size this track asks for: "));
  const failed = /^(\d+) incomplete runs?/.exec(flag);
  if (failed?.[1]) return make("incomplete", `${failed[1]} of its runs didn't complete, and a pick allows at most 1`);
  if (flag.startsWith("did not complete")) return make("did-not-complete", "no run completed");
  if (flag.startsWith("not attributable")) return make("unattributable", "its charges can't be tied to our sandbox IDs");
  return make("other", flag);
}

export const flagsOf = (row: Pick<RealisticRow, "flags">): readonly Flag[] => row.flags.map(readFlag);

const kindWord = { billed: "billed", metered: "metered", estimate: "estimate" } as const satisfies Record<CostKind, string>;

/** "billed · verified", "metered · unsettled, provisional", "estimate · unconfirmed": the kind and status every bar carries. */
export function statusTag(row: Pick<RealisticRow, "cost" | "eligible" | "flags">): string {
  const kind = row.cost ? kindWord[row.cost.kind] : "no cost";
  if (row.eligible) return `${kind} · verified`;
  const shorts = [...new Set(flagsOf(row).map((f) => f.short))];
  return `${kind} · ${shorts.length ? shorts.join(", ") : "not eligible"}`;
}

/** Why a row has no cost: never run, or run without a completed task. */
export function noCostReason(row: RealisticRow): string {
  const reasons = new Map(row.reasons.map((r) => [r.reason, r.runs]));
  if (row.notRun > 0 && reasons.has("default-size-too-small")) return "its default machine is too small for this workload, so it wasn't run";
  if (row.prepare?.kind === "insufficient-disk")
    return `not enough free disk to start: ${row.prepare.freeGiB.toFixed(2)} GiB free, ${Number(row.prepare.requiredGiB.toFixed(1))} GiB needed`;
  if (reasons.has("prepare-failed")) return "setup failed before the workload in every run";
  if (reasons.has("create-failed")) return "the sandbox couldn't be created";
  if (reasons.has("check-failed")) return "every run failed the completion check";
  const [first] = row.reasons;
  return first ? first.reason.replaceAll("-", " ") : "no run completed";
}

/** "5 of 5", the plan's way of reporting completion, never a reliability percentage. */
export const completedText = (row: Pick<RealisticRow, "completed" | "attempts">) => `${row.completed} of ${row.attempts}`;

/** Wilson 95% interval of a completion count, as shares. */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.959964;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export const wilsonText = (row: Pick<RealisticRow, "completed" | "attempts">) => {
  const { low, high } = wilson(row.completed, row.attempts);
  return `${Math.round(low * 100)}–${Math.round(high * 100)}%`;
};

/** "96 s" or "3 min 38 s". */
export function wallText(s: number) {
  const r = Math.round(s);
  return r < 120 ? `${r} s` : `${Math.floor(r / 60)} min ${r % 60} s`;
}

export const perThousand = (usd: number) => formatPerThousand(usd);

/** A billing model the harness didn't name falls back to the site's own label for the provider. */
export const billingText = (row: Pick<RealisticRow, "billingModel">, fallback: string) => row.billingModel ?? fallback;

/** A provider billed for less than the whole machine: its whole-machine figure is a counterfactual. */
export const isCounterfactual = (billing: string) => billing !== "bills the whole machine while it exists";

// ---------------------------------------------------------------------------
// Rows and the pick.

export type Costed = RealisticRow & { cost: NonNullable<RealisticRow["cost"]> };
const isCosted = (r: RealisticRow): r is Costed => r.cost !== null;

/** One profile's headline rows on one track: costed rows lowest first, then rows with no cost, by name. */
export function headlineRows(data: RealisticData, track: RunTrack, profile: ProfileId) {
  const rows = data.rows.filter((r) => r.variant === "headline" && r.track === track && r.profile === profile);
  const costed = rows.filter(isCosted).sort((a, b) => a.cost.usdPerCompleted - b.cost.usdPerCompleted);
  const uncosted = rows.filter((r) => !isCosted(r)).sort((a, b) => providerName(a.provider).localeCompare(providerName(b.provider)));
  return { costed, uncosted };
}

export const pickLabels = {
  lowest: "Lowest verified cost among eligible providers",
  only: "The only verified cost among eligible providers",
  none: "No clear winner",
  uncertified: "No certified winner",
} as const;

/** Why this release names no certified winner: the plan's statistics need the full run. */
export const uncertifiedWhy = "with 5 pilot runs there is no statistical test, so the result is descriptive";

/**
 * The pick, by the plan's rules. Only an eligible row can be picked: billed
 * and settled (or a reconciled meter), attributable to our sandboxes, at most
 * one incomplete run and, on the same-machine track, the right size. The pilot
 * runs no statistical test, so even the lowest verified cost is shown beside
 * "no certified winner". With one eligible provider the label says so. Every
 * lower cost that isn't eligible is listed with its reasons. With none
 * eligible there is no clear winner, and every cost is listed.
 */
export type TaskPick =
  | { kind: "verified"; label: string; pick: Costed; eligible: readonly ProviderId[]; lower: readonly Costed[] }
  | { kind: "none"; label: string; lower: readonly Costed[] }
  | { kind: "empty" };

export function taskPick(costed: readonly Costed[]): TaskPick {
  if (costed.length === 0) return { kind: "empty" };
  const sorted = [...costed].sort((a, b) => a.cost.usdPerCompleted - b.cost.usdPerCompleted);
  const eligible = sorted.filter((r) => r.eligible && r.incomplete <= 1);
  const [pick] = eligible;
  if (!pick) return { kind: "none", label: pickLabels.none, lower: sorted };
  return {
    kind: "verified",
    label: eligible.length === 1 ? pickLabels.only : pickLabels.lowest,
    pick,
    eligible: eligible.map((r) => r.provider),
    lower: sorted.filter((r) => !eligible.includes(r) && r.cost.usdPerCompleted < pick.cost.usdPerCompleted),
  };
}

export const pickFor = (data: RealisticData, track: RunTrack, profile: ProfileId) => taskPick(headlineRows(data, track, profile).costed);

// ---------------------------------------------------------------------------
// The idle diagnostic: fix and test, then the sandbox left open, then a resume step.

export interface IdlePoint extends HeldOpen {
  minutes: number;
  /** The provider stopped the sandbox while it sat idle. */
  stopped: boolean;
}

export interface IdleGroup {
  provider: ProviderId;
  points: readonly IdlePoint[];
  /** The longest wait in which the provider stopped the sandbox, so the work couldn't resume. */
  stoppedAt: IdlePoint | null;
  /** The longest wait in which every resume failed without a reported stop. */
  resumeFailedAt: IdlePoint | null;
}

const isStop = (t: string) => /->\s*(stopped|paused|terminated|deleted)$/.test(t);

/** Per provider, its points in wait order, sorted by the cost after the longest wait. */
export function idleGroups(data: RealisticData): IdleGroup[] {
  const ids = [...new Set(data.heldOpen.map((h) => h.provider))];
  const groups = ids.map((provider): IdleGroup => {
    const points = idleIds.flatMap((idle) => {
      const h = data.heldOpen.find((x) => x.provider === provider && x.idle === idle);
      return h ? [{ ...h, minutes: idleMinutes[idle], stopped: h.transitions.some(isStop) }] : [];
    });
    const stoppedAt = points.filter((p) => p.stopped).at(-1) ?? null;
    const resumeFailedAt = points.filter((p) => !p.stopped && p.runs > 0 && p.completed === 0 && p.idle !== "zero-wait").at(-1) ?? null;
    return { provider, points, stoppedAt, resumeFailedAt };
  });
  const last = (g: IdleGroup) => g.points.at(-1)?.medianCostUsd ?? Number.POSITIVE_INFINITY;
  return groups.sort((a, b) => last(a) - last(b));
}

/** A held-open figure is settled only when the harness says so; anything else is shown striped, as on the cost charts. */
export const isSettledHold = (p: Pick<HeldOpen, "status">) => p.status === "settled";

export const idleLabel = (p: Pick<IdlePoint, "minutes">) => (p.minutes === 0 ? "No wait" : p.minutes === 60 ? "1 hour" : `${p.minutes} min`);

/** "stopped the sandbox during the hour, so the work couldn't resume (0 of 3 resumed)". */
export function idleOutcome(g: IdleGroup): string | null {
  const wait = (p: IdlePoint) => (p.minutes === 60 ? "the hour" : `the ${p.minutes} minutes`);
  if (g.stoppedAt) return `stopped the sandbox during ${wait(g.stoppedAt)}, so the work couldn't resume (${g.stoppedAt.completed} of ${g.stoppedAt.runs} resumed)`;
  if (g.resumeFailedAt) return `the resume step failed after ${wait(g.resumeFailedAt)} in all ${g.resumeFailedAt.runs} runs, with no stop reported`;
  return null;
}

/** "+804% vs no wait", from the harness's ratio. */
export const changeText = (p: Pick<HeldOpen, "changeVsZeroWait">) => {
  if (p.changeVsZeroWait === null) return null;
  const pct = Math.round(p.changeVsZeroWait * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs no wait`;
};

export const providerList = (ids: readonly ProviderId[]) =>
  ids.map(providerName).reduce((acc, name, i) => (i === 0 ? name : i === ids.length - 1 ? `${acc} and ${name}` : `${acc}, ${name}`), "");
