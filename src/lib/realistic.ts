import { billingBases, billingLabel, costLabel, costStatuses, estimateNotCounted, formatPerThousand, isUsageCost, kindStatusText } from "@/lib/cost";
import type { CostStatusKind } from "@/lib/cost";
import { tracks } from "@/lib/data";
import { isExtraTier, isPreemptible, isProviderId, providerName } from "@/lib/providers";
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

export const wholeMachineBounds = ["exact", "lower"] as const;
export type WholeMachineBound = (typeof wholeMachineBounds)[number];
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

/** A part of a cost we added at list price: per completed task on rows, the median per run on held-open entries. */
export interface EstimatedPart {
  usd: number;
  /** The harness's labels, such as "disk at list price". */
  labels: readonly string[];
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
  cost: {
    kind: CostKind;
    usdPerCompleted: number;
    wholeMachineUsdPerCompleted: number | null;
    /**
     * How the whole-machine figure relates to the bill: "lower" when it is a lower bound
     * (Modal's default track prices its 0.125 CPU request, and bills burst use above it).
     * A summary without the field is read as exact.
     */
    wholeMachineBound: WholeMachineBound;
  } | null;
  /** The harness's note on how the cost was made, where it gives one. */
  costNote: string | null;
  /**
   * The part of a billed or metered cost we added at list price, per completed
   * task, such as disk a billing source leaves out; null when none was added.
   * Computed with the harness's own cost code (scripts/realistic-estimated-parts.ts).
   */
  estimatedPart: EstimatedPart | null;
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
  /** The harness's status text, and the eligibility-table statuses read from it (empty when billed and settled). */
  status: string;
  statuses: readonly CostStatusKind[];
  /** Median over the runs of each run's estimated part; null when none was added. */
  estimatedPart: EstimatedPart | null;
  medianWakeMs: number | null;
  transitions: readonly string[];
}

/**
 * What a complete data set must contain, checked by the build and by the data
 * script before any provider's data is replaced: every provider, workload,
 * track and variant, with its run count. Written by hand in
 * scripts/realistic-coverage.json and copied into the data file.
 */
export interface Coverage {
  headline: { attempts: number; providers: readonly ProviderId[]; profiles: readonly ProfileId[]; tracks: readonly RunTrack[] };
  idle: {
    attempts: number;
    profile: ProfileId;
    track: RunTrack;
    providers: readonly ProviderId[];
    /** Headline providers left out of the idle test, each with why. */
    notTested: readonly { provider: ProviderId; reason: string; short: string }[];
  };
}

export interface RealisticData {
  schema: typeof SCHEMA;
  generatedAt: string;
  coverage: Coverage;
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

function parseEstimatedPart(v: unknown, path: string): EstimatedPart | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, path);
  const usd = num(o.usd, `${path}.usd`);
  if (usd <= 0) fail(path, "must be null when nothing was added");
  return { usd, labels: arr(o.labels, `${path}.labels`).map((l, i) => str(l, `${path}.labels[${i}]`)) };
}

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
          wholeMachineBound: cost.wholeMachineBound === undefined ? "exact" : oneOf(wholeMachineBounds)(cost.wholeMachineBound, `${path}.cost.wholeMachineBound`),
        }
      : null,
    costNote: nullable(str)(o.costNote, `${path}.costNote`),
    estimatedPart: parseEstimatedPart(o.estimatedPart, `${path}.estimatedPart`),
    eligible: o.eligible === true ? true : o.eligible === false ? false : fail(`${path}.eligible`, "must be true or false"),
    flags: arr(o.flags, `${path}.flags`).map((f, i) => str(f, `${path}.flags[${i}]`)),
  };
  if (row.cost !== null && row.completed === 0) fail(path, "has a cost per completed task but no completed task");
  if (row.eligible && (row.cost === null || row.flags.length > 0)) fail(path, "is eligible, so it needs a cost and no flags");
  if (row.estimatedPart && (row.cost === null || row.cost.kind === "estimate" || row.estimatedPart.usd > row.cost.usdPerCompleted))
    fail(`${path}.estimatedPart`, "belongs only on a billed or metered cost, and can't exceed it");
  return row;
}

/**
 * The eligibility-table statuses in a held-open status text: "settled" has
 * none, "unsettled; metered, unreconciled (provisional)" is unsettled and
 * unreconciled. Null for wording this reader doesn't know, so the build stops
 * instead of guessing.
 */
export function holdStatuses(status: string): CostStatusKind[] | null {
  const out: CostStatusKind[] = [];
  for (const part of status.split(/;\s*/).map((x) => x.trim())) {
    if (part === "settled") continue;
    if (part.startsWith("unsettled")) out.push("unsettled");
    else if (part.includes("unreconciled")) out.push("unreconciled");
    else if (part.includes("provisional")) out.push("provisional");
    else return null;
  }
  return out;
}

function parseHeld(v: unknown, path: string): HeldOpen {
  const o = obj(v, path);
  const status = str(o.status, `${path}.status`);
  const statuses = holdStatuses(status) ?? fail(`${path}.status`, `"${status}" isn't a status this site can read; extend holdStatuses first`);
  return {
    provider: providerOf(o.provider, `${path}.provider`),
    idle: oneOf(idleIds)(o.idle, `${path}.idle`),
    runs: count(o.runs, `${path}.runs`),
    completed: count(o.completed, `${path}.completed`),
    costKind: nullable(oneOf(costKindIds))(o.costKind, `${path}.costKind`),
    medianCostUsd: nullable(num)(o.medianCostUsd, `${path}.medianCostUsd`),
    changeVsZeroWait: nullable(num)(o.changeVsZeroWait, `${path}.changeVsZeroWait`),
    status,
    statuses,
    estimatedPart: parseEstimatedPart(o.estimatedPart, `${path}.estimatedPart`),
    medianWakeMs: nullable(num)(o.medianWakeMs, `${path}.medianWakeMs`),
    transitions: arr(o.transitions, `${path}.transitions`).map((t, i) => str(t, `${path}.transitions[${i}]`)),
  };
}

const ids = <T>(read: (v: unknown, path: string) => T) => (v: unknown, path: string): T[] => arr(v, path).map((x, i) => read(x, `${path}[${i}]`));

/** Reads the expected coverage, from the data file or scripts/realistic-coverage.json. */
export function parseCoverage(v: unknown, path = "coverage"): Coverage {
  const o = obj(v, path);
  const h = obj(o.headline, `${path}.headline`);
  const i = obj(o.idle, `${path}.idle`);
  const headline = {
    attempts: count(h.attempts, `${path}.headline.attempts`),
    providers: ids(providerOf)(h.providers, `${path}.headline.providers`),
    profiles: ids(oneOf(profileIds))(h.profiles, `${path}.headline.profiles`),
    tracks: ids(oneOf(runTracks))(h.tracks, `${path}.headline.tracks`),
  };
  const idle = {
    attempts: count(i.attempts, `${path}.idle.attempts`),
    profile: oneOf(profileIds)(i.profile, `${path}.idle.profile`),
    track: oneOf(runTracks)(i.track, `${path}.idle.track`),
    providers: ids(providerOf)(i.providers, `${path}.idle.providers`),
    notTested: arr(i.notTested, `${path}.idle.notTested`).map((n, j) => {
      const no = obj(n, `${path}.idle.notTested[${j}]`);
      return {
        provider: providerOf(no.provider, `${path}.idle.notTested[${j}].provider`),
        reason: str(no.reason, `${path}.idle.notTested[${j}].reason`),
        /** The reason in a few words, for the one-sentence note under the idle chart. */
        short: str(no.short, `${path}.idle.notTested[${j}].short`),
      };
    }),
  };
  if (headline.attempts === 0 || idle.attempts === 0) fail(path, "run counts must be at least 1");
  const accounted = [...idle.providers, ...idle.notTested.map((n) => n.provider)];
  if (new Set(accounted).size !== accounted.length) fail(`${path}.idle`, "names a provider twice");
  for (const id of headline.providers) if (!accounted.includes(id)) fail(`${path}.idle`, `must test ${id} or say why not in notTested`);
  for (const id of accounted) if (!headline.providers.includes(id)) fail(`${path}.idle`, `names ${id}, which isn't a headline provider`);
  return { headline, idle };
}

const idleVariants = ["zero-wait", "held-10", "held-60"] as const satisfies readonly VariantId[];

/**
 * Everything one provider is missing against the expected coverage: each
 * headline workload and track, and on the idle providers each idle variant
 * and held-open entry, with the right run counts.
 */
export function providerGaps(c: Coverage, provider: ProviderId, rows: readonly RealisticRow[], held: readonly HeldOpen[]): string[] {
  const gaps: string[] = [];
  const row = (profile: ProfileId, track: RunTrack, variant: VariantId) => rows.find((r) => r.provider === provider && r.profile === profile && r.track === track && r.variant === variant);
  for (const profile of c.headline.profiles)
    for (const track of c.headline.tracks) {
      const r = row(profile, track, "headline");
      if (!r) gaps.push(`${provider} has no ${profile} / ${track} headline row`);
      else if (r.attempts !== c.headline.attempts) gaps.push(`${provider} ${profile} / ${track} headline has ${r.attempts} attempts, not ${c.headline.attempts}`);
    }
  if (c.idle.providers.includes(provider))
    for (const variant of idleVariants) {
      const r = row(c.idle.profile, c.idle.track, variant);
      if (!r) gaps.push(`${provider} has no ${variant} row`);
      else if (r.attempts !== c.idle.attempts) gaps.push(`${provider} ${variant} has ${r.attempts} attempts, not ${c.idle.attempts}`);
      const h = held.find((x) => x.provider === provider && x.idle === variant);
      if (!h) gaps.push(`${provider} has no ${variant} held-open entry`);
      else if (h.runs !== c.idle.attempts) gaps.push(`${provider} ${variant} held-open has ${h.runs} runs, not ${c.idle.attempts}`);
    }
  return gaps;
}

/** Every gap and every unexpected row against the coverage; empty for a complete data set. */
export function coverageGaps(c: Coverage, rows: readonly RealisticRow[], held: readonly HeldOpen[]): string[] {
  const expected = (r: RealisticRow) =>
    c.headline.providers.includes(r.provider) &&
    (r.variant === "headline"
      ? c.headline.profiles.includes(r.profile) && c.headline.tracks.includes(r.track)
      : c.idle.providers.includes(r.provider) && r.profile === c.idle.profile && r.track === c.idle.track);
  return [
    ...c.headline.providers.flatMap((id) => providerGaps(c, id, rows, held)),
    ...rows.filter((r) => !expected(r)).map((r) => `unexpected row ${r.provider} ${r.profile} / ${r.track} / ${r.variant}; add it to the coverage first`),
    ...held.filter((h) => !c.idle.providers.includes(h.provider)).map((h) => `unexpected held-open entry for ${h.provider}; add it to the coverage first`),
  ];
}

/** Rows and held-open entries checked one by one, before any coverage check: for one summary of a merge. */
/** Stops on the first key seen twice: a second copy of a row or held-open entry would silently win in a lookup. */
function once<T>(items: readonly T[], keyOf: (x: T) => string, path: string) {
  const seen = new Set<string>();
  for (const x of items) {
    const key = keyOf(x);
    if (seen.has(key)) fail(path, `has ${key} twice`);
    seen.add(key);
  }
}

/**
 * Rows and held-open entries, each checked, with no row (provider, workload,
 * track, variant) or held-open entry (provider, wait) twice. The build and the
 * data script (per summary, before merging) both read through here.
 */
export function parseParts(rows: unknown, held: unknown): { rows: RealisticRow[]; heldOpen: HeldOpen[] } {
  const parsed = {
    rows: arr(rows, "rows").map((r, i) => parseRow(r, `rows[${i}]`)),
    heldOpen: arr(held, "heldOpen").map((h, i) => parseHeld(h, `heldOpen[${i}]`)),
  };
  once(parsed.rows, (r) => `${r.provider}/${r.profile}/${r.track}/${r.variant}`, "rows");
  once(parsed.heldOpen, (h) => `${h.provider}/${h.idle}`, "heldOpen");
  return parsed;
}

/** Reads `src/data/realistic.json`, or the script's output before it is written. Incomplete data stops here. */
export function parseRealistic(raw: unknown): RealisticData {
  const o = obj(raw, "file");
  if (o.schema !== SCHEMA) fail("schema", `must be "${SCHEMA}"`);
  const fx = o.fx === null ? null : obj(o.fx, "fx");
  const workloads = o.workloads === null ? null : obj(o.workloads, "workloads");
  const { rows, heldOpen } = parseParts(o.rows, o.heldOpen);
  const coverage = parseCoverage(o.coverage);
  const gaps = coverageGaps(coverage, rows, heldOpen);
  if (gaps.length > 0) fail("file", `is incomplete or has unexpected data: ${gaps.join("; ")}`);
  return {
    schema: SCHEMA,
    generatedAt: str(o.generatedAt, "generatedAt"),
    coverage,
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
    heldOpen,
  };
}

// ---------------------------------------------------------------------------
// Words. Every sentence about these results is made here, so the page and the agent files agree.

/** The one pilot line, said wherever these numbers appear. The run count comes from the coverage every row was checked against. */
export const pilotDetail = (d: Pick<RealisticData, "coverage">) =>
  `${d.coverage.headline.attempts} runs per provider; most costs are provider meters or estimates not yet checked against settled bills.`;
export const pilotLine = (d: Pick<RealisticData, "coverage">) => `Pilot: ${pilotDetail(d)}`;
/** "Pilot · 5 runs per provider · most prices not checked against settled bills": the short line above each chart; the full reason is in its notes. */
export const pilotBrief = (d: Pick<RealisticData, "coverage">) => `Pilot · ${d.coverage.headline.attempts} runs per provider · most prices not checked against settled bills`;

export const laterLine = "The full 10-batch run and recorded agent sessions come later.";
/** When the runs behind these numbers ran. Update it whenever a provider's runs are replaced. */
export const runsLine =
  "Most providers ran on 2026-11-05 and 2026-11-06 UTC, Modal on 2026-11-09. boxd's, E2B's and Vercel's headline runs were repeated on 2026-11-16 (boxd 16:45 to 18:00 UTC, E2B 17:00 to 17:25 UTC, Vercel 14:02 to 15:03 UTC) with nothing else on each account, so their meters could be checked against the providers' settled charges; their held-open runs are from 2026-11-05 and 2026-11-06 UTC (Vercel's from 2026-11-09). Baseten ran on 2026-11-17 (05:44 to 06:54 UTC), with the build's workspace on an 8 GiB volume because Baseten keeps a sandbox's files in its memory; it has no held-open run, as its costs are list-price estimates. Instabox ran on 2026-11-18, its headline runs 14:40 to 15:18 UTC and its held-open runs 14:40 to 18:27 UTC, on the same harness commit as its main suite (6074f7b). Beam's same-machine rows are from its 2026-11-20 Performance rerun (its first run was on 2026-11-18, 16:58 to 17:25 UTC), on the same machine only: its default sandbox, 1 CPU and 128 MiB, is too small for either task, and like Baseten it has no held-open run. Luxor's and Superserve's same-machine runs were repeated on 2026-11-18 (Luxor 21:53 to 22:14 UTC, Superserve 22:20 to 22:39 UTC) with 20 GB disks, after their first runs had too little free disk for the build (Superserve for both tasks); their default-machine rows are from the first runs. Maritime ran on 2026-11-24 (02:34 to 04:20 UTC), on the same harness commit as its main suite (619307b), metered from its per-sandbox usage records; it has no held-open run, as that usage leaves out the charge for a paused sandbox's disk. Buddy ran on 2026-11-25 (04:27 to 07:19 UTC), on harness commit 5afd423 and SDK commit a5c99d2, priced at its list price per started minute because it has no usage or billing API; like Baseten it has no held-open run. Archil ran on 2026-11-26, its headline runs 19:38 to 20:21 UTC and its held-open runs 19:38 to 23:22 UTC, on the same harness commit as its main suite (28ac0a4); its first runs on 2026-11-23 were replaced. Two of its three 60-minute held-open runs didn't finish: in each Archil refused the next command, which our adapter reads as the sandbox not running; Archil's own idle pause (its default idle timeout is 30 minutes) is the likely cause, and our Archil adapter never wakes a sandbox it didn't pause. Its build on the default machine, 1 vCPU and 2 GiB, didn't finish in any run: the install step was killed (exit 137) every time, which on 2 GiB points to running out of memory; on the same machine, 4 vCPU and 8 GiB, every build finished.";

/** Why Vercel's headline costs are not verified, and what its held-open costs leave out. */
export const vercelTransferLine =
  "Vercel bills sandbox data transfer, which its published Nov 9 costs left out; the headline costs now come from the 2026-11-16 rerun and count ingress plus egress at $0.15 per GB. That day's settled Sandbox charges were $1.47 against our meter's $1.70 (15.7% apart): CPU matched, memory was 2.4% higher on the bill, and the bill counted 7.16 GB of data transfer against our 8.71 GB.";

export const vercelHeldOpenLine =
  "Vercel's held-open costs are from 2026-11-09 and leave out data transfer, which Vercel bills, so they are understated.";

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

/**
 * "Workload CPU and memory, excluding installation: about 175–204
 * CPU-seconds and 2.5 GiB on a 4 vCPU, 8 GB reference machine", or null
 * without a footprint. The label says what the figure leaves out, so it isn't
 * read as leaving setup out of the price.
 */
export function profileFootprint(profile: ProfileId, w: Workload | null): string | null {
  if (!w) return null;
  const memory = profile === "build" ? `${range(w.memoryGiB, 1)} GiB of memory` : `${range(w.memoryGiB, 1)} GiB`;
  return `Workload CPU and memory, excluding installation: about ${range(w.workCpuS)} CPU-seconds and ${memory} on a 4 vCPU, 8 GiB reference machine`;
}

/** "About 175–204 CPU-seconds and 2.5 GiB on a 4 vCPU, 8 GiB machine, not counting installation.", for the notes, or null without a footprint. */
export const profileFootprintNote = (w: Workload | null) =>
  w ? `About ${range(w.workCpuS)} CPU-seconds and ${range(w.memoryGiB, 1)} GiB of memory on a 4 vCPU, 8 GiB machine, not counting installation.` : null;

/** What a task's cost covers, in one line above each chart; the scope line says the same at length. */
export const costCovers = "Includes setup and failed attempts, through confirmed deletion.";

/**
 * Why a row can't be the pick. A reason the eligibility table names
 * (unsettled, unreconciled, provisional, estimate) carries that status, so it
 * reads exactly as on the other cost charts; the rest (wrong size, too many
 * failures) are qualifiers of these runs.
 */
export interface Flag {
  status: CostStatusKind | null;
  /** A word or two for bars and tables. */
  short: string;
  /** A plain sentence fragment for details and agent files. */
  text: string;
}

const withStatus = (k: CostStatusKind, text: string): Flag => ({ status: k, short: costStatuses[k].label.toLowerCase(), text });
const qualifier = (short: string, text: string): Flag => ({ status: null, short, text });

/** One of the harness's eligibility reasons, read into a status or qualifier and plain words. Unknown wording is kept as it is. */
export function readFlag(flag: string): Flag {
  if (flag.startsWith("unsettled")) return withStatus("unsettled", "the provider hasn't settled the charge yet, so it can still change");
  if (flag.startsWith("provisional")) {
    if (flag.includes("meter not reconciled")) {
      // The harness says why after the colon (the audit's checked reason); keep it for the reader.
      const why = /meter not reconciled with settled charges:\s*(.+)$/s.exec(flag)?.[1];
      return withStatus("unreconciled", why ? `its usage meter hasn't been checked against settled charges: ${why}` : "its usage meter hasn't been checked against settled charges yet");
    }
    if (flag.includes("storage coverage")) return withStatus("provisional", "it isn't known yet whether its billing source includes disk");
    return withStatus("provisional", flag.replace(/^provisional:\s*/, ""));
  }
  if (flag.startsWith("unverified estimate"))
    return withStatus("estimate", "our measured time at list price; the provider hasn't confirmed its billing rules in writing, and no isolated billing window was checked");
  const size = /^wrong machine size: ([\d.]+) GiB memory/.exec(flag);
  if (size?.[1]) return qualifier("wrong size", `it ran with ${Number(size[1]).toFixed(1)} GiB of memory, not the 8 GiB this track asks for`);
  if (flag.startsWith("wrong machine size")) return qualifier("wrong size", flag.replace(/^wrong machine size:\s*/, "its machine isn't the size this track asks for: "));
  const failed = /^(\d+) incomplete runs?/.exec(flag);
  if (failed?.[1]) return qualifier("too many failures", `${failed[1]} of its runs didn't complete, and a pick allows at most 1`);
  if (flag.startsWith("did not complete")) return qualifier("did not complete", "no run completed");
  if (flag.startsWith("not attributable")) return qualifier("not attributable", "its charges can't be tied to our sandbox IDs");
  return qualifier("not eligible", flag);
}

export const flagsOf = (row: Pick<RealisticRow, "flags">): readonly Flag[] => row.flags.map(readFlag);

/**
 * "billed, verified", "metered, unsettled, unreconciled", "estimate, wrong
 * size": the kind and status every realistic cost carries, in the same words
 * as the quick-task cost chart (kindStatusText), then any qualifier.
 */
/** "disk" from "disk at list price": what an estimated part is, in a word. */
const partWords = (p: EstimatedPart) => [...new Set(p.labels.map((l) => l.replace(/\s+at list price$/, "")))].join(" and ");

/**
 * Kind and status, scoped when part of a billed or metered cost is our
 * estimate: verification covers only the provider's charge, so a verified one
 * reads "compute verified (billed, settled); disk estimated" and an unverified
 * one "compute billed, unsettled; disk estimated". The estimated part is only
 * added where the billing source leaves storage out, so that charge is compute.
 * A provider-reported usage cost (Archil's) says "usage cost" where others say
 * "billed", as on the quick-task cost chart (lib/cost.ts, isUsageCost).
 */
export function kindStatusWithPart({ id, kind, statuses, part }: { id: ProviderId; kind: CostKind; statuses: readonly CostStatusKind[]; part: EstimatedPart | null }) {
  if (!part || kind === "estimate") return kindStatusText({ id, kind, statuses });
  const verified = statuses.length === 1 && statuses[0] === "verified";
  const settled = kind === "billed" ? `${costLabel(id, { kind }).toLowerCase()}, settled` : "metered, reconciled";
  const compute = verified ? `compute verified (${settled})` : `compute ${kindStatusText({ id, kind, statuses })}`;
  return `${compute}; ${partWords(part)} estimated`;
}

export function statusTag(row: Pick<RealisticRow, "provider" | "cost" | "eligible" | "flags" | "estimatedPart">): string {
  if (!row.cost) return "n/a";
  const flags = flagsOf(row);
  const statuses = row.eligible ? (["verified"] as const) : flags.flatMap((f) => (f.status ? [f.status] : []));
  const qualifiers = [...new Set(flags.flatMap((f) => (f.status ? [] : [f.short])))];
  const base = kindStatusWithPart({ id: row.provider, kind: row.cost.kind, statuses, part: row.estimatedPart });
  const rest = qualifiers.length || statuses.length || row.eligible ? qualifiers : ["not eligible"];
  return [base, ...rest].join(", ");
}

/**
 * The billing evidence alone ("metered, unreconciled", "billed, verified"):
 * statusTag without the run qualifiers (wrong size, too many failures), which
 * notCountedWhy says apart. "n/a" without a cost.
 */
export function billingTag(row: Pick<RealisticRow, "provider" | "cost" | "eligible" | "flags" | "estimatedPart">): string {
  if (!row.cost) return "n/a";
  const statuses = row.eligible ? (["verified"] as const) : flagsOf(row).flatMap((f) => (f.status ? [f.status] : []));
  return kindStatusWithPart({ id: row.provider, kind: row.cost.kind, statuses, part: row.estimatedPart });
}

/**
 * "usage cost, unsettled" beside a realistic cost that is a provider-reported
 * usage cost (Archil's), in billingTag's words, for the headline and ranked
 * figures that quote it; null for every other provider, whose amounts show alone.
 */
export const rowUsageTag = (row: Pick<RealisticRow, "provider" | "cost" | "eligible" | "flags" | "estimatedPart">) =>
  row.cost && isUsageCost(row.provider, row.cost) ? billingTag(row) : null;

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

/** What the provider bills on, from the site's one evidence-backed table (lib/cost.ts), the same words as the other cost charts. */
export const billingText = (id: ProviderId) => billingLabel(billingBases[id]);

/** A provider that bills usage: its whole-machine figure is a counterfactual, as on the other cost charts. */
export const isCounterfactual = (id: ProviderId) => billingBases[id].kind === "usage";

// ---------------------------------------------------------------------------
// Rows and the pick.

export type Costed = RealisticRow & { cost: NonNullable<RealisticRow["cost"]> };
const isCosted = (r: RealisticRow): r is Costed => r.cost !== null;

/** One profile's headline rows on one track: costed rows lowest first, then rows with no cost, by name. */
export function headlineRows(data: Pick<RealisticData, "rows">, track: RunTrack, profile: ProfileId) {
  const rows = data.rows.filter((r) => r.variant === "headline" && r.track === track && r.profile === profile);
  const costed = rows.filter(isCosted).sort((a, b) => a.cost.usdPerCompleted - b.cost.usdPerCompleted);
  const uncosted = rows.filter((r) => !isCosted(r)).sort((a, b) => providerName(a.provider).localeCompare(providerName(b.provider)));
  return { costed, uncosted };
}

export const pickLabels = {
  cheapest: "Cheapest",
  none: "No clear winner",
  uncertified: "No certified winner",
} as const;

/** Why this release names no certified winner: the plan's statistics need the full run. */
export const uncertifiedWhy = (d: Pick<RealisticData, "coverage">) => `with ${d.coverage.headline.attempts} pilot runs there is no statistical test, so the result is descriptive`;

/**
 * Why a same-machine row isn't on the exact 4 vCPU, 8 GiB machine, or [] when
 * it is. The harness flags a size more than 10% off; the site's own rule is the
 * track's `equalSpec`, which the quick-task cost pick and the Machines table
 * use, so a provider the same-machine track marks as "machine differs" is
 * never counted here either, even when the harness's looser tolerance let it
 * through (Buddy's 8 decimal GB measure 7.45 GiB, within 10% of 8 GiB).
 */
export function wrongSizeWhy(r: Pick<RealisticRow, "flags" | "track" | "provider">): string[] {
  if (r.track !== "same-machine") return [];
  const flagged = flagsOf(r).flatMap((f) => (f.short === "wrong size" ? [f.text] : []));
  if (flagged.length > 0) return flagged;
  const p = tracks["same-spec"].providers.find((x) => x.id === r.provider);
  if (!p || p.equalSpec) return [];
  const memory = p.measuredAllocations.map((a) => a.memoryGiB);
  if (memory.length === 0) return ["its machine size wasn't measured, so it can't be confirmed as the 4 vCPU, 8 GiB this track asks for"];
  const lo = Math.min(...memory);
  const cpus = [...new Set(p.measuredAllocations.map((a) => a.cpu))];
  const cpu = cpus.length === 1 && cpus[0] === 4 ? "" : ` and ${cpus.join("–")} vCPU`;
  return [`it ran with ${lo.toFixed(2)} GiB of memory${cpu}, not the 8 GiB this track asks for`];
}

/**
 * Why a row can't be called cheapest, in plain words, or [] when it can: a
 * list-price estimate instead of the provider's own bill or usage meter, more
 * than one incomplete run, on the same-machine track the wrong machine size,
 * or capacity the provider can take back mid-task. Billing status (settled,
 * reconciled) doesn't matter. Selection, the chart and the exports all read
 * this one list.
 */
export function notCountedWhy(r: Pick<RealisticRow, "incomplete" | "flags" | "track" | "provider" | "cost">): string[] {
  const estimate = r.cost?.kind === "estimate" ? [estimateNotCounted] : [];
  const failed = r.incomplete > 1 ? [`${r.incomplete} of its runs didn't complete, and the pick allows at most 1`] : [];
  const size = wrongSizeWhy(r);
  // Spot capacity can be stopped mid-task. Any other tier past a provider's first is compared in CPU tiers, not ranked against other providers.
  const tier = isPreemptible(r.provider)
    ? ["the provider can stop it before the task ends (spot capacity)"]
    : isExtraTier(r.provider)
      ? ["a cheaper CPU tier of its provider; providers are ranked on the tier a new account gets, and CPU tiers compares the rest"]
      : [];
  return [...estimate, ...failed, ...size, ...tier];
}

export const isCounted = (r: Pick<RealisticRow, "incomplete" | "flags" | "track" | "provider" | "cost">) => notCountedWhy(r).length === 0;

/**
 * The pick: the cheapest counted row. `counted` is every provider that could
 * be picked; `lower` is every cheaper row that couldn't (a list-price
 * estimate, too many failures or the wrong machine size), so the chart can say why its bar lost. With none
 * counted there is no clear winner, and every cost is listed.
 */
export type TaskPick =
  | { kind: "picked"; label: string; pick: Costed; counted: readonly ProviderId[]; lower: readonly Costed[] }
  | { kind: "none"; label: string; lower: readonly Costed[] }
  | { kind: "empty" };

export function taskPick(costed: readonly Costed[]): TaskPick {
  if (costed.length === 0) return { kind: "empty" };
  const sorted = [...costed].sort((a, b) => a.cost.usdPerCompleted - b.cost.usdPerCompleted);
  const counted = sorted.filter(isCounted);
  const [pick] = counted;
  if (!pick) return { kind: "none", label: pickLabels.none, lower: sorted };
  return {
    kind: "picked",
    label: pickLabels.cheapest,
    pick,
    counted: counted.map((r) => r.provider),
    lower: sorted.filter((r) => !counted.includes(r) && r.cost.usdPerCompleted < pick.cost.usdPerCompleted),
  };
}

export const pickFor = (data: Pick<RealisticData, "rows">, track: RunTrack, profile: ProfileId) => taskPick(headlineRows(data, track, profile).costed);

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

/**
 * Per provider, its points in wait order, sorted by the cost after the
 * longest wait. The harness's held-open status covers settlement only, so a
 * provider whose rows say its billing source may leave disk out stays
 * provisional here too, as on the cost charts.
 */
export function idleGroups(data: Pick<RealisticData, "heldOpen" | "rows">): IdleGroup[] {
  const ids = [...new Set(data.heldOpen.map((h) => h.provider))];
  const groups = ids.map((provider): IdleGroup => {
    const storageUnknown = data.rows.some((r) => r.provider === provider && r.flags.some((f) => f.includes("storage coverage")));
    const points = idleIds.flatMap((idle) => {
      const h = data.heldOpen.find((x) => x.provider === provider && x.idle === idle);
      if (!h) return [];
      const statuses: readonly CostStatusKind[] = storageUnknown && !h.statuses.includes("provisional") ? [...h.statuses, "provisional"] : h.statuses;
      // A stop or pause counts only when the work didn't resume from it: Instabox pauses an idle machine and wakes it on the next command.
      return [{ ...h, statuses, minutes: idleMinutes[idle], stopped: h.transitions.some(isStop) && h.completed < h.runs }];
    });
    const stoppedAt = points.filter((p) => p.stopped).at(-1) ?? null;
    const resumeFailedAt = points.filter((p) => !p.stopped && p.runs > 0 && p.completed === 0 && p.idle !== "zero-wait").at(-1) ?? null;
    return { provider, points, stoppedAt, resumeFailedAt };
  });
  // A provider whose sandbox was stopped or couldn't resume isn't a cheap place to leave work open, whatever
  // its figure: it goes after every provider whose resume completed, so the order never reads as a ranking of it.
  const last = (g: IdleGroup) => g.points.at(-1)?.medianCostUsd ?? Number.POSITIVE_INFINITY;
  return groups.sort((a, b) => Number(idleFailed(a)) - Number(idleFailed(b)) || last(a) - last(b));
}

/** The provider stopped the sandbox, or every resume failed, at some wait. */
export const idleFailed = (g: Pick<IdleGroup, "stoppedAt" | "resumeFailedAt">) => g.stoppedAt !== null || g.resumeFailedAt !== null;

/** No run at this wait resumed, so its figure is what the failed runs cost, not a price for leaving work open. */
export const resumeFailed = (p: Pick<IdlePoint, "completed" | "runs">) => p.runs > 0 && p.completed === 0;

/** A held-open figure is verified only when billed (or metered) with no open status; anything else is striped, as on the cost charts. */
export const isVerifiedHold = (p: Pick<HeldOpen, "statuses" | "costKind">) => p.costKind !== null && p.costKind !== "estimate" && p.statuses.length === 0;

/** "billed, verified" or "metered, unsettled, unreconciled", in the cost charts' words. */
export const holdTag = (p: Pick<HeldOpen, "provider" | "statuses" | "costKind" | "estimatedPart">) =>
  p.costKind === null
    ? "n/a"
    : kindStatusWithPart({ id: p.provider, kind: p.costKind, statuses: isVerifiedHold(p) ? ["verified"] : p.statuses.length ? p.statuses : ["estimate"], part: p.estimatedPart });

/**
 * "usage cost, unsettled" beside a held-open amount that is a provider-reported
 * usage cost (Archil's), in the words of the quick-task cost chart's tag
 * (lib/cost.ts, usageCostTag); null for every other provider, whose amounts show alone.
 */
export const holdUsageTag = (p: Pick<HeldOpen, "provider" | "statuses" | "costKind" | "estimatedPart">) =>
  p.costKind !== null && isUsageCost(p.provider, { kind: p.costKind }) ? holdTag(p) : null;

/** Why a held-open run didn't complete, where the data's reason ("check-failed") doesn't say. */
export interface IdleRefusal {
  /** A few words, beside the "2 of 3" result. */
  short: string;
  /** A sentence for the notes and the agent files. */
  text: string;
}

/**
 * Refusals read from a wait's attempt log, keyed by provider and wait. Shown
 * only while that wait still has an incomplete run, so a clean rerun drops it.
 */
const idleRefusals: Partial<Record<ProviderId, Partial<Record<IdleId, IdleRefusal>>>> = {
  // provider-runs/sbx-archil-1126/held-open/attempts.jsonl: both incomplete held-60 attempts' resume-status step failed with
  // "Sandbox is paused or stopped ... Call box.resume() first", which our adapter says for any HTTP 409 from Archil;
  // the attempts have no state after, so the pause is likely, not confirmed.
  archil: {
    "held-60": {
      short: "2 commands refused",
      text: "In two of its three 1-hour runs Archil refused the command at the resume step; our adapter reads that refusal (HTTP 409) as the sandbox not running, and Archil's own idle pause is the likely cause. A paused Archil sandbox stays asleep until it is resumed, and the test doesn't resume it",
    },
  },
};

export const idleRefusal = (p: Pick<IdlePoint, "provider" | "idle" | "completed" | "runs">): IdleRefusal | null =>
  p.completed < p.runs ? (idleRefusals[p.provider]?.[p.idle] ?? null) : null;

/** "0.30%": the estimated part's share of the figure it sits in, said beside that figure, never as one range for every cost. */
export const shareText = (part: number, total: number) => `${((part / total) * 100).toFixed(2)}%`;

/**
 * "$0.036 per 1,000 of it (0.30%) is disk added at list price, an estimate; the
 * rest is billed compute.", or null. For a usage cost (Archil's) the rest is
 * "compute at the usage cost its usage API reports".
 */
export function estimatedPartText({ id, kind, part, total, unit }: { id: ProviderId; kind: CostKind; part: EstimatedPart | null; total: number | null; unit: string }) {
  if (!part || kind === "estimate") return null;
  const share = total ? ` (${shareText(part.usd, total)})` : "";
  const rest = isUsageCost(id, { kind }) ? "compute at the usage cost its usage API reports" : `${kind} compute`;
  return `${perThousand(part.usd)} ${unit} of it${share} is ${partWords(part)} added at list price, an estimate; the rest is ${rest}.`;
}

export const idleLabel = (p: Pick<IdlePoint, "minutes">) => (p.minutes === 0 ? "No wait" : p.minutes === 60 ? "1 hour" : `${p.minutes} min`);

/** "stopped the sandbox during the hour, so the work couldn't resume (0 of 3 resumed)". */
export function idleOutcome(g: IdleGroup): string | null {
  const wait = (p: IdlePoint) => (p.minutes === 60 ? "the hour" : `the ${p.minutes} minutes`);
  if (g.stoppedAt) return `stopped the sandbox during ${wait(g.stoppedAt)}, so the work couldn't resume (${g.stoppedAt.completed} of ${g.stoppedAt.runs} resumed)`;
  if (g.resumeFailedAt) return `the resume step failed after ${wait(g.resumeFailedAt)} in all ${g.resumeFailedAt.runs} runs, with no stop reported`;
  return null;
}

/**
 * "×9.04": the wait's median cost over the no-wait median, from the harness's
 * changeVsZeroWait, three significant figures; null for the no-wait point.
 */
export const multipleText = (p: Pick<HeldOpen, "changeVsZeroWait">) => (p.changeVsZeroWait === null ? null : `×${(1 + p.changeVsZeroWait).toPrecision(3)}`);

/** Said once wherever the multiples are printed. */
export const multipleNote = "×N is the wait's median cost divided by the no-wait median.";

/** "+804% vs no wait", from the harness's ratio. */
export const changeText = (p: Pick<HeldOpen, "changeVsZeroWait">) => {
  if (p.changeVsZeroWait === null) return null;
  const pct = Math.round(p.changeVsZeroWait * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs no wait`;
};

/**
 * A list-price estimate that prices only part of what the provider bills, with
 * what it covers and the separately billed charge it leaves out. The other
 * estimates price the whole machine, disk included. Buddy bills storage on its
 * own (cost.ts, billingBases.buddy), and the harness's Buddy pricing sets that
 * rate to zero, so its estimates are CPU and RAM only.
 */
export const partialEstimates: Partial<Record<ProviderId, { covers: string; leavesOut: string }>> = {
  buddy: {
    covers: "CPU and RAM per started minute, for the whole size while the sandbox exists",
    leavesOut: "separately billed storage, $0.00011 per GB-hour of disk used",
  },
};

/** "Buddy's list-price estimate covers CPU and RAM …, and leaves out …", one sentence per provider, in the order given. */
const partialEstimateLines = (ids: readonly ProviderId[]) =>
  ids.flatMap((id) => {
    const e = partialEstimates[id];
    return e ? [`${providerName(id)}'s list-price estimate covers ${e.covers}, and leaves out ${e.leavesOut}, so it is under the bill by that amount.`] : [];
  });

/** A note under a chart: a short bold lead, then one or two plain sentences. */
export type Note = { lead: string; text: string };

/**
 * Providers whose realistic costs cover compute and memory only, with where
 * those charges come from: the billing source reports nothing else, and the
 * data adds no storage estimate for them. Said only for a provider with a cost
 * and no estimated part, so a later disk estimate drops the sentence.
 */
const computeAndMemoryOnly: Partial<Record<ProviderId, string>> = {
  archil: "the charges its usage API reports",
};

/** The compute-and-memory-only providers in the data, each with its source. */
function computeAndMemoryOnlyIn(costed: readonly RealisticRow[]) {
  const ids = [...new Set(costed.map((r) => r.provider))].filter((id) => !costed.some((r) => r.provider === id && r.estimatedPart !== null));
  return ids.flatMap((id) => {
    const source = computeAndMemoryOnly[id];
    return source === undefined ? [] : [{ id, source }];
  });
}

/**
 * The cost scope as short notes for the page, from the same data as
 * `scopeLine`: what a cost includes, where disk is added or unknown, which
 * costs are list-price estimates, and what isn't counted.
 */
export function scopeNotes(d: Pick<RealisticData, "rows">): Note[] {
  const costed = d.rows.filter((r) => r.cost !== null);
  // Named by provider: a CPU tier past the first is priced the same way as its provider's row.
  const has = (pred: (r: RealisticRow) => boolean) => [...new Set(costed.filter(pred).map((r) => r.provider))].filter((id) => !isExtraTier(id));
  const added = has((r) => r.estimatedPart !== null);
  const unknown = has((r) => r.flags.some((f) => f.includes("storage coverage")));
  const allEstimates = has((r) => r.cost?.kind === "estimate");
  const partial = allEstimates.filter((id) => id in partialEstimates);
  const estimates = allEstimates.filter((id) => !partial.includes(id));
  const transfer = has((r) => r.provider === "vercel" && r.variant === "headline");
  return [
    {
      lead: "What a cost includes",
      text: `Every charge from create to confirmed deletion: compute, memory, disk and standby storage, with setup and failed attempts${partial.length ? `, except the storage ${providerList(partial)}'s estimate leaves out (below)` : ""}.`,
    },
    ...(added.length ? [{ lead: "Disk", text: `The billing data we read for ${providerList(added)} leaves disk out, so disk is added at list price.` }] : []),
    ...(unknown.length ? [{ lead: "Disk unknown", text: `For ${providerList(unknown)} it isn't known whether disk is billed, so none is added.` }] : []),
    ...(estimates.length ? [{ lead: "List-price estimates", text: `${providerList(estimates)}: the machine's list price over the billed time. Shown on the chart, not picked as Cheapest.` }] : []),
    ...partial.flatMap((id) => partialEstimateLines([id]).map((text) => ({ lead: `${providerName(id)} estimate`, text: `${text} Shown on the chart, not picked as Cheapest.` }))),
    ...computeAndMemoryOnlyIn(costed).map(({ id, source }) => ({
      lead: providerName(id),
      text: `An exception to what a cost includes: its headline and held-open figures cover compute and memory only, ${source}. Disk storage and egress are not included, and no storage estimate is added.`,
    })),
    {
      lead: "Not counted",
      text: transfer.length
        ? `Data transfer and snapshots kept after deletion. ${providerList(transfer)} bills transfer, so its headline costs count it; its held-open costs leave it out and are understated.`
        : "Data transfer and snapshots kept after deletion.",
    },
  ];
}

/** When the runs ran, as short notes for the page; `runsLine` has the exact times. */
export const runNotes: Note[] = [
  { lead: "Run dates", text: "Most providers Nov 5–6, Modal Nov 9, Baseten Nov 17, Instabox Nov 18, Beam Nov 20, Maritime Nov 24, Buddy Nov 25, Archil Nov 26. Luxor and Superserve reran on the same machine on Nov 18 with 20 GB disks; their first runs had too little free disk." },
  { lead: "Reruns", text: "boxd, E2B and Vercel reran their headline runs on Nov 16 with nothing else on their accounts, to check their meters against their bills. Their held-open runs are from Nov 5–6 (Vercel's Nov 9)." },
];

/**
 * The cost scope, said once on the page and in every export, naming only what
 * the data includes: which providers have disk added, which leave it unknown
 * (from their flags), which are estimates, and what isn't measured at all.
 */
export function scopeLine(d: Pick<RealisticData, "rows">): string {
  const costed = d.rows.filter((r) => r.cost !== null);
  const has = (pred: (r: RealisticRow) => boolean) => [...new Set(costed.filter(pred).map((r) => r.provider))];
  const added = has((r) => r.estimatedPart !== null);
  const unknown = has((r) => r.flags.some((f) => f.includes("storage coverage")));
  const allEstimates = has((r) => r.cost?.kind === "estimate");
  const partial = allEstimates.filter((id) => id in partialEstimates);
  const estimates = allEstimates.filter((id) => !partial.includes(id));
  // Vercel bills sandbox data transfer, and its headline runs (2026-11-16) metered it; its
  // held-open runs (2026-11-09) kept no byte counters.
  const transfer = has((r) => r.provider === "vercel" && r.variant === "headline");
  const plural = (ids: readonly ProviderId[], one: string, many: string) => (ids.length === 1 ? one : many);
  return [
    `Cost scope: every charge from the create request through confirmed deletion, setup and failed attempts included: compute, memory, disk and standby storage${partial.length ? `, except where an estimate below leaves a charge out` : ""}.`,
    added.length ? `${providerList(added)}'s billing leaves disk out, so disk is added at list price.` : "",
    unknown.length ? `For ${providerList(unknown)} it isn't known whether the billing source includes disk, so nothing is added.` : "",
    estimates.length ? `${providerList(estimates)} ${plural(estimates, "is", "are")} priced at the machine's list price, disk included, over the billed time; list-price estimates are shown but not picked as cheapest.` : "",
    ...partialEstimateLines(partial),
    ...computeAndMemoryOnlyIn(costed).map(
      ({ id, source }) => `An exception to that scope: ${providerName(id)}'s headline and held-open figures cover compute and memory only, ${source}; disk storage and egress are not included, and no storage estimate is added.`,
    ),
    transfer.length
      ? `Data transfer is counted only in ${providerList(transfer)}'s headline costs, because ${plural(transfer, "it bills", "they bill")} it; ${plural(transfer, "its", "their")} held-open costs leave it out and are understated. Retained snapshots after deletion, and data transfer for every other provider, are outside the task cost; this pilot doesn't measure them, so they aren't reported yet.`
      : "Retained snapshots after deletion and data transfer are outside the task cost; this pilot doesn't measure them, so they aren't reported yet.",
  ]
    .filter(Boolean)
    .join(" ");
}

export const providerList = (ids: readonly ProviderId[]) =>
  ids.map(providerName).reduce((acc, name, i) => (i === 0 ? name : i === ids.length - 1 ? `${acc} and ${name}` : `${acc}, ${name}`), "");
