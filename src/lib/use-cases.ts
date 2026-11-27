import { fairnessSection } from "@/components/fairness";
import { realTasksSection, taskTimes } from "@/components/real-tasks";
import { taskCostSection } from "@/components/realistic";
import { sustainedCpuSection } from "@/components/sustained-cpu";
import { statusOf } from "@/lib/agent-data";
import { trackIds, trackInfo, tracks } from "@/lib/data";
import { completed } from "@/lib/fairness";
import { fairness } from "@/lib/fairness-data";
import type { Track, TrackId } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";
import { allocationNotes, autoStandby } from "@/lib/notes";
import { pauses } from "@/lib/pause";
import { cpuCaveat, isExtraTier, providerName } from "@/lib/providers";
import type { CpuCaveat, ProviderId } from "@/lib/providers";
import { billingTag, completedText, headlineRows, notCountedWhy, perThousand, runTrackOf, taskPick } from "@/lib/realistic";
import type { ProfileId } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import type { Better } from "@/lib/score";
import { opsText, retentionText, sustainedRanked } from "@/lib/sustained-cpu";
import { sustainedCpu } from "@/lib/sustained-cpu-data";
import { linkedTrack } from "@/lib/tracks";

/**
 * "Best for": one pick per kind of job, computed from the same data and the
 * same rules as the chart each card links to, so a data update moves the
 * picks with it. A pick is the best reading on one measure among providers on
 * the CPU tier a new account gets. Nothing here is chosen by hand: a card's
 * title, measure and chart are fixed, its provider never is.
 */

/** What a value counts, for agents: seconds, milliseconds, operations per second, or US dollars per 1,000 completed tasks. */
export type UseCaseUnit = "s" | "ms" | "ops/s" | "usd-per-1000-tasks";

/** One provider's reading on a use case's measure. */
export interface Entry {
  provider: ProviderId;
  /** In the use case's unit. */
  value: number;
  /** The reading as its chart prints it: "0.20 s", "$0.76", "84.7M ops/s". */
  display: string;
  /** The 95% interval of a median, where the chart has one; ties use it. */
  ci95: readonly [number, number] | null;
  /** What else the chart says about this reading, as a clause: "the pause before it took 0.05 s". */
  note: string | null;
}

/** A provider the chart shows but the pick leaves out, by the chart's own rule. `ahead`: its reading is better than the pick's. */
export interface Skipped {
  provider: ProviderId;
  why: string;
  ahead: boolean;
}

/** How a tie is called: medians inside each other's 95% intervals, or the same printed value where there is no interval. */
export type TieRule = "ci95" | "shown";

interface Reading {
  /** Best first. */
  entries: Entry[];
  skipped: Skipped[];
}

/** A second measure a card shows beside its pick, with its own leader. It never changes the pick or anyone's weakest spot. */
export interface SecondMeasure {
  /** A few words: "Restart speed". */
  label: string;
  measure: string;
  unit: UseCaseUnit;
  better: Better;
  source: string;
  chart: { section: string; tab: string };
  onlyOn: TrackId | null;
  read: (track: Track) => Reading;
}

export interface UseCase {
  id: string;
  title: string;
  /** Who the card is for, in a few words. */
  forWhat: string;
  /** The number behind the pick. */
  measure: string;
  unit: UseCaseUnit;
  better: Better;
  tie: TieRule;
  /** The data file in src/data the reading comes from; <track> stands for the track's id. */
  source: string;
  /** The chart behind the pick: a section and the tab that opens it. */
  chart: { section: string; tab: string };
  /** The one track the data exists on, when it ran on only one. Every other track shows that track's pick, marked. */
  onlyOn: TrackId | null;
  /** What the measure leaves out that the title might suggest. */
  gap: string | null;
  read: (track: Track) => Reading;
  /** Only the cards that show a second measure set it. */
  second?: SecondMeasure;
}

/** Best first by value, then by id so equal readings keep a fixed order. */
const bestFirst = (entries: Entry[], better: Better) =>
  entries.sort((a, b) => (better === "lower" ? a.value - b.value : b.value - a.value) || a.provider.localeCompare(b.provider));

/** Ranks only a provider's first CPU tier, as every other pick on the site does. */
const firstTier = <T extends { provider: ProviderId }>(rows: readonly T[]) => rows.filter((r) => !isExtraTier(r.provider));

const excludedPrefix = "excluded: ";

/**
 * Medians of one main-suite metric from the track given, with each
 * provider's status from the results file's own rule (statusOf), so a result
 * it leaves out of rankings (excluded, unsupported, failed) never becomes a
 * pick. A track without the metric has no entries. Raw medians, as the chart prints them.
 */
const metricReading =
  (id: string) =>
  (track: Track): Reading => {
    const m = track.findMetric(id);
    if (!m) return { entries: [], skipped: [] };
    const rows = firstTier(track.providers.map((p) => ({ provider: p.id, v: m.values.find((x) => x.provider === p.id) })));
    const withStatus = rows.map((r) => ({ ...r, status: statusOf(track, id, r.provider, r.v) }));
    const entries = withStatus.flatMap(({ provider, v, status }) => {
      if (status !== "measured" || !v || v.p50 === null) return [];
      const ci95 = v.ciLow === null || v.ciHigh === null ? null : ([v.ciLow, v.ciHigh] as const);
      return [{ provider, value: v.p50, display: formatValue(v.p50, m.unit), ci95, note: v.failures > 0 ? `${v.failures} of ${v.n + v.failures} attempts failed` : null }];
    });
    const skipped = withStatus.flatMap(({ provider, status }) => (status.startsWith(excludedPrefix) ? [{ provider, why: status.slice(excludedPrefix.length), ahead: false }] : []));
    return { entries: bestFirst(entries, m.better), skipped };
  };

/** At most one incomplete run: the real task cost pick's own rule (notCountedWhy), applied to its times too. */
const MAX_INCOMPLETE = 1;

/** Median time to finish one real task on the track, among rows with at most one incomplete run. */
const taskReading =
  (profile: ProfileId) =>
  (track: Track): Reading => {
    const rows = firstTier(taskTimes(track, profile).timed);
    return {
      entries: bestFirst(
        rows
          .filter((r) => r.incomplete <= MAX_INCOMPLETE)
          .map((r) => ({ provider: r.provider, value: r.medianWallS, display: formatValue(r.medianWallS, "s"), ci95: null, note: r.completed < r.attempts ? `${completedText(r)} runs completed` : null })),
        "lower",
      ),
      skipped: rows
        .filter((r) => r.incomplete > MAX_INCOMPLETE)
        .map((r) => ({ provider: r.provider, why: `only ${completedText(r)} runs completed, and a pick allows at most ${MAX_INCOMPLETE} incomplete`, ahead: false })),
    };
  };

/** CPU work per second in minutes 12–15 of the 15-minute run, from the sustained CPU file (same machine only). */
function sustainedReading(): Reading {
  const { ranked, missing } = sustainedRanked(sustainedCpu);
  return {
    entries: bestFirst(
      firstTier(ranked).map((p) => ({ provider: p.provider, value: p.last3MinOps, display: opsText(p.last3MinOps), ci95: null, note: `${retentionText(p.retention)} of its rate in minutes 0–3` })),
      "higher",
    ),
    skipped: firstTier(missing).flatMap((m) => (m.notRun ? [] : [{ provider: m.provider, why: m.why, ahead: false }])),
  };
}

/**
 * Time to come back from a pause: the resume call, or the first command after
 * a sandbox that pauses by itself went on standby. A stop and start that
 * restarts the sandbox is not a pause, as on the pause charts.
 */
function resumeReading(track: Track): Reading {
  const rows = firstTier(pauses(track).map(({ p, r }) => ({ provider: p.id, r })));
  const entries = rows.flatMap(({ provider, r }): Entry[] => {
    switch (r.kind) {
      case "split":
        return [{ provider, value: r.resume, display: formatValue(r.resume, "s"), ci95: null, note: `the pause before it took ${formatValue(r.pause, "s")}` }];
      case "standby":
        return [{ provider, value: r.resume, display: formatValue(r.resume, "s"), ci95: null, note: "it has no pause call and goes on standby by itself when idle" }];
      case "total":
      case "restart":
      case "none":
        return [];
      default: {
        const _exhaustive: never = r;
        return _exhaustive;
      }
    }
  });
  const skipped = rows.flatMap(({ provider, r }) =>
    r.kind === "restart" ? [{ provider, why: "stop and start restarts the sandbox, which isn't a pause", ahead: false }] : r.kind === "none" && !autoStandby[provider] ? [{ provider, why: "no pause support", ahead: false }] : [],
  );
  return { entries: bestFirst(entries, "lower"), skipped };
}

/**
 * Median time for a server killed with SIGKILL to answer again in the same sandbox, from the
 * like-for-like state-survival check (same machine only).
 */
function restartReading(): Reading {
  const rows = firstTier(completed(fairness.stateSurvival));
  return {
    entries: bestFirst(
      rows.flatMap((e) => {
        const { medianMs, samplesMs, failures } = e.result.restart;
        if (medianMs === null) return [];
        const parts = [`one sandbox's median of ${samplesMs.length} timed restarts, one run`, failures > 0 ? `${failures} failed` : null, e.machine.sameSize ? null : `on ${e.machine.cpu} vCPU, ${e.machine.memoryGiB} GiB`].filter((x) => x !== null);
        return [{ provider: e.provider, value: medianMs, display: formatValue(medianMs, "ms"), ci95: null, note: parts.join(", ") }];
      }),
      "lower",
    ),
    skipped: rows.flatMap((e) => (e.result.restart.medianMs === null ? [{ provider: e.provider, why: "no restart was timed", ahead: false }] : [])),
  };
}

/** Per completed task to per 1,000, the unit the cost chart prints. */
const PER = 1000;

/**
 * Fix and test cost per 1,000 completed tasks, by the cost chart's Cheapest
 * rule: only billed or metered costs count. Each carries its billing status
 * ("metered, unreconciled"), and every cheaper cost that can't count is listed with why.
 */
function costReading(track: Track): Reading {
  const costed = firstTier(headlineRows(realistic, runTrackOf[track.id], "fix-and-test").costed);
  const p = taskPick(costed);
  const picked = p.kind === "picked";
  const counted = new Set(picked ? p.counted : []);
  return {
    entries: bestFirst(
      costed.filter((r) => counted.has(r.provider)).map((r) => ({ provider: r.provider, value: r.cost.usdPerCompleted * PER, display: perThousand(r.cost.usdPerCompleted), ci95: null, note: billingTag(r) })),
      "lower",
    ),
    skipped: p.kind === "empty" ? [] : p.lower.map((r) => ({ provider: r.provider, why: `${perThousand(r.cost.usdPerCompleted)} per 1,000: ${notCountedWhy(r).join("; ")}`, ahead: picked })),
  };
}

/** The use cases, in card order. Add one by adding an entry; its pick, reason and weakest spot follow from `read`. */
export const useCaseList: readonly UseCase[] = [
  {
    id: "long-running",
    title: "Long-running tasks",
    forWhat: "Agents that keep the CPU busy for many minutes",
    measure: "CPU work per second in minutes 12–15 of a 15-minute run",
    unit: "ops/s",
    better: "higher",
    tie: "shown",
    source: "sustained-cpu.json",
    chart: { section: sustainedCpuSection, tab: "steady" },
    onlyOn: "same-spec",
    gap: null,
    read: sustainedReading,
  },
  {
    id: "bursty",
    title: "Short, bursty tasks",
    forWhat: "Fanning out many short-lived sandboxes at once",
    measure: "25 sandboxes started at once, until the last runs a command",
    unit: "s",
    better: "lower",
    tie: "ci95",
    source: "benchmark.<track>.json",
    chart: { section: "scale", tab: "burst-25" },
    onlyOn: null,
    gap: null,
    read: metricReading("burst-25"),
  },
  {
    id: "revival",
    title: "Revival: pause and resume",
    forWhat: "Agents that sleep while they wait, then pick up where they left off",
    measure: "Resume after a pause, until a command runs",
    unit: "s",
    better: "lower",
    tie: "shown",
    source: "benchmark.<track>.json",
    chart: { section: "state", tab: "resume" },
    onlyOn: null,
    gap: "The pick ranks resume after a pause only. Restart speed is a process killed and started again in a running sandbox; a whole sandbox stopped and started has no portable SDK call and isn't measured.",
    read: resumeReading,
    second: {
      label: "Restart speed",
      measure: "A killed server started again, until it answers",
      unit: "ms",
      better: "lower",
      source: "fairness.json",
      chart: { section: fairnessSection, tab: "restart" },
      onlyOn: "same-spec",
      read: restartReading,
    },
  },
  {
    id: "cheapest-task",
    title: "Cheapest real task",
    forWhat: "Many coding tasks on a budget",
    measure: "Fix and test, cost per 1,000 completed tasks",
    unit: "usd-per-1000-tasks",
    better: "lower",
    tie: "shown",
    source: "realistic.json",
    chart: { section: taskCostSection, tab: "fix-and-test" },
    onlyOn: null,
    gap: null,
    read: costReading,
  },
  {
    id: "cold-start",
    title: "Fastest cold start",
    forWhat: "A person or an agent waiting on a fresh sandbox",
    measure: "create() until a first command runs",
    unit: "s",
    better: "lower",
    tie: "ci95",
    source: "benchmark.<track>.json",
    chart: { section: "startup", tab: "cold" },
    onlyOn: null,
    gap: null,
    read: metricReading("cold"),
  },
  {
    id: "tool-loops",
    title: "Agent tool loops",
    forWhat: "Chatty agents that make hundreds of small calls",
    measure: "100 tool calls in a row: write, read, edit, list, grep, test",
    unit: "s",
    better: "lower",
    tie: "ci95",
    source: "benchmark.<track>.json",
    chart: { section: "agent", tab: "tool-replay" },
    onlyOn: null,
    gap: null,
    read: metricReading("tool-replay"),
  },
  {
    id: "builds",
    title: "Production builds",
    forWhat: "Builds of a few minutes that load CPU, disk and network",
    measure: "Jitsi Meet production build, create to confirmed delete",
    unit: "s",
    better: "lower",
    tie: "shown",
    source: "realistic.json",
    chart: { section: realTasksSection, tab: "build" },
    onlyOn: null,
    gap: null,
    read: taskReading("build"),
  },
  {
    id: "snapshots",
    title: "Starting from a snapshot",
    forWhat: "Many sandboxes from one prepared state",
    measure: "New sandbox from a snapshot, until a command runs",
    unit: "s",
    better: "lower",
    tie: "ci95",
    source: "benchmark.<track>.json",
    chart: { section: "state", tab: "create-from-snapshot" },
    onlyOn: null,
    gap: null,
    read: metricReading("create-from-snapshot"),
  },
];

type Comparable = Pick<Entry, "value" | "display" | "ci95">;

/** Whether two readings tie by intervals: both have one and each median sits inside the other's. */
const intervalTie = (a: Comparable, b: Comparable) => a.ci95 !== null && b.ci95 !== null && a.value >= b.ci95[0] && a.value <= b.ci95[1] && b.value >= a.ci95[0] && b.value <= a.ci95[1];

/**
 * Whether two readings tie under a rule. `ci95` uses the intervals when both
 * readings have one, else falls back to the same printed value; `shown` uses the printed value.
 */
export function isTie(a: Comparable, b: Comparable, rule: TieRule): boolean {
  switch (rule) {
    case "ci95":
      return a.ci95 !== null && b.ci95 !== null ? intervalTie(a, b) : a.display === b.display;
    case "shown":
      return a.display === b.display;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/**
 * A provider's place among entries sorted best first. Under `shown`, equal
 * printed values share the better place. Under `ci95` it is the position by
 * median, as on the provider pages: interval ties aren't transitive, so they
 * are reported against the pick (`tiedWith`), never folded into places.
 * Null when it has no entry.
 */
export function placeOf(entries: readonly (Comparable & Pick<Entry, "provider">)[], provider: ProviderId, rule: TieRule): number | null {
  const at = entries.findIndex((e) => e.provider === provider);
  const mine = entries[at];
  if (!mine) return null;
  switch (rule) {
    case "ci95":
      return at + 1;
    case "shown":
      return entries.findIndex((e) => e.display === mine.display) + 1;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/**
 * How the next reading compares with the pick's, in the unit's own words:
 * "1.9× as long", "8% more", "10% lower". Null when either is zero or
 * negative, where a ratio means nothing.
 */
export function leadText(pick: Pick<Entry, "value">, next: Pick<Entry, "value">, unit: UseCaseUnit): string | null {
  if (!(pick.value > 0 && next.value > 0)) return null;
  const pct = (r: number) => (r * 100 < 1 ? "under 1%" : `${Math.round(r * 100)}%`);
  switch (unit) {
    case "s":
    case "ms": {
      const r = next.value / pick.value;
      return r < 1.1 ? `${pct(r - 1)} longer` : `${r.toFixed(1)}× as long`;
    }
    case "usd-per-1000-tasks": {
      const r = next.value / pick.value;
      return r < 1.1 ? `${pct(r - 1)} more` : `${r.toFixed(1)}× the cost`;
    }
    case "ops/s":
      return `${pct(1 - next.value / pick.value)} lower`;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

/** Where a pick ranks worst among the other use cases on the same track, and the track that ranking comes from. */
export interface Weakest {
  useCase: string;
  title: string;
  rank: number;
  of: number;
  track: TrackId;
}

/** One use case computed for one track. */
export interface UseCaseResult {
  useCase: UseCase;
  /** The track the readings come from: `onlyOn` where set, else the track asked for. */
  from: TrackId;
  ranked: readonly Entry[];
  pick: Entry | null;
  /** Other providers tied with the pick under the use case's tie rule. */
  tiedWith: readonly Entry[];
  /** The best reading after the pick and its ties. */
  next: Entry | null;
  skipped: readonly Skipped[];
  /** What the pick measured and how the next compares, in a sentence or two. */
  reason: string | null;
  /** The CPU caveat of the pick and of each tied leader. */
  caveats: readonly { provider: ProviderId; caveat: CpuCaveat }[];
  /** Why a shown provider's machine differs from the track's, from the chart's own notes. */
  machine: readonly { provider: ProviderId; note: string }[];
  weakest: Weakest | null;
  /** The card's second measure, read on its own: its leader, any tied with it, and the next. */
  second: SecondResult | null;
}

export interface SecondResult {
  measure: SecondMeasure;
  from: TrackId;
  ranked: readonly Entry[];
  pick: Entry | null;
  tiedWith: readonly Entry[];
  next: Entry | null;
}

/** A second measure ranked on its own track, ties at the printed value. */
function secondFor(measure: SecondMeasure, trackId: TrackId): SecondResult {
  const from = measure.onlyOn ?? trackId;
  const { entries } = measure.read(tracks[from]);
  const [pick = null, ...rest] = entries;
  const tiedWith = pick ? rest.filter((e) => isTie(pick, e, "shown")) : [];
  return { measure, from, ranked: entries, pick, tiedWith, next: rest.find((e) => !tiedWith.includes(e)) ?? null };
}

/** How a tie was called: intervals only when every tied reading has one. */
const tieWords = (u: UseCase, pick: Entry, tied: readonly Entry[]) => (u.tie === "ci95" && [pick, ...tied].every((e) => e.ci95 !== null) ? "inside the 95% intervals" : "at the value shown");

function reasonFor(u: UseCase, pick: Entry, tiedWith: readonly Entry[], next: Entry | null) {
  const head = `${providerName(pick.provider)}: ${pick.display}${pick.note ? `; ${pick.note}` : ""}.`;
  if (tiedWith.length > 0) return `${head} Tied with ${tiedWith.map((e) => `${providerName(e.provider)} (${e.display})`).join(", ")} ${tieWords(u, pick, tiedWith)}.`;
  if (!next) return `${head} The only provider with a result.`;
  const lead = leadText(pick, next, u.unit);
  return `${head} Next is ${providerName(next.provider)} at ${next.display}${lead ? `, ${lead}` : ""}.`;
}

/** The lowest rank over the number ranked, so 14th of 15 is weaker than 3rd of 4. */
export function weakestOf(places: readonly Weakest[]): Weakest | null {
  return places.reduce<Weakest | null>((w, p) => (w === null || p.rank / p.of > w.rank / w.of ? p : w), null);
}

/** Every use case for one track, with each pick's weakest spot among the others. */
export function useCasesFor(trackId: TrackId): UseCaseResult[] {
  const base = useCaseList.map((useCase) => {
    const from = useCase.onlyOn ?? trackId;
    const { entries, skipped } = useCase.read(tracks[from]);
    const [pick = null, ...rest] = entries;
    const tiedWith = pick ? rest.filter((e) => isTie(pick, e, useCase.tie)) : [];
    const next = rest.find((e) => !tiedWith.includes(e)) ?? null;
    const leaders = pick ? [pick, ...tiedWith] : [];
    const notes = allocationNotes(tracks[from]);
    return {
      useCase,
      from,
      ranked: entries,
      pick,
      tiedWith,
      next,
      skipped,
      reason: pick ? reasonFor(useCase, pick, tiedWith, next) : null,
      caveats: leaders.flatMap((e) => { const caveat = cpuCaveat(e.provider); return caveat ? [{ provider: e.provider, caveat }] : []; }),
      machine: [...leaders, ...(next ? [next] : [])].flatMap((e) => { const note = notes[e.provider]; return note ? [{ provider: e.provider, note }] : []; }),
      second: useCase.second ? secondFor(useCase.second, trackId) : null,
    };
  });
  return base.map((b) => {
    const { pick } = b;
    if (!pick) return { ...b, weakest: null };
    const places = base.flatMap((o) => {
      const rank = o === b ? null : placeOf(o.ranked, pick.provider, o.useCase.tie);
      return rank === null || rank === 1 ? [] : [{ useCase: o.useCase.id, title: o.useCase.title, rank, of: o.ranked.length, track: o.from }];
    });
    return { ...b, weakest: weakestOf(places) };
  });
}

/** The page link a card's chart opens on: the landing track needs no query. */
export const chartHref = (r: Pick<UseCaseResult, "useCase" | "from">) => `/${r.from === linkedTrack ? `?track=${r.from}` : ""}#${r.useCase.chart.section}/${r.useCase.chart.tab}`;

/** "Long-running tasks, 15th of 15", with the track when it isn't the one being read. */
export const weakestText = (w: Weakest, track: TrackId) => `${w.title}, ${ordinal(w.rank)} of ${w.of}${w.track === track ? "" : ` (on ${trackInfo[w.track].short})`}`;

export const useCasesAbout =
  "Which provider leads for each kind of job, computed from this site's benchmark data by fixed rules each time the data changes. A pick is the best reading on one measure among providers on the CPU tier a new account gets; no provider paid for or chose a pick.";

const rules = [
  "Each use case reads one measure, named in `measure` in `unit`, from the chart at `chart`. Values are in that unit: seconds, milliseconds, operations per second, or US dollars per 1,000 completed tasks.",
  "`second`, where set, is another measure the card shows with its own leader (ties at the printed value); it never changes the pick, its rank or anyone's `weakest`.",
  "Providers are ranked on the CPU tier a new account gets; cheaper or spot tiers are compared under CPU tiers instead.",
  "`tie: ci95`: medians inside each other's 95% intervals are tied; a reading without an interval ties only on the same printed value. `tie: shown`: there is no interval, so only the same printed value ties.",
  "`rank` is the position by median under `tie: ci95` (interval ties aren't transitive, so only ties with the pick are reported, in `tiedWith`); under `tie: shown` equal printed values share the better place.",
  "Real task picks allow at most one incomplete run. The cheapest needs a cost from the provider's own bill or usage meter; cheaper costs that can't count are in `notCounted` with why, and `note` carries each cost's billing status.",
  "`weakest` is where the pick ranks lowest among the other use cases, by rank over the number ranked; its `track` is the track that ranking comes from.",
  "`onlyOn` names the one track a measure ran on; every track then shows that track's pick.",
  "`machineNotes` say when a shown provider ran a machine other than the track's.",
];

/** The use cases as plain data for agents: both tracks, every ranked provider, and why any was left out. */
export function useCasesData() {
  return {
    schema: "use-cases.v1",
    about: useCasesAbout,
    rules,
    tracks: Object.fromEntries(
      trackIds.map((id) => [
        id,
        {
          label: trackInfo[id].label,
          useCases: useCasesFor(id).map((r) => ({
            id: r.useCase.id,
            title: r.useCase.title,
            for: r.useCase.forWhat,
            measure: r.useCase.measure,
            unit: r.useCase.unit,
            better: r.useCase.better,
            tie: r.useCase.tie,
            onlyOn: r.useCase.onlyOn,
            source: `src/data/${r.useCase.source.replace("<track>", r.from)}`,
            chart: chartHref(r),
            pick: r.pick ? { provider: r.pick.provider, name: providerName(r.pick.provider), value: r.pick.value, display: r.pick.display } : null,
            tiedWith: r.tiedWith.map((e) => e.provider),
            reason: r.reason,
            cpuCaveats: r.caveats.map((c) => ({ provider: c.provider, caveat: c.caveat.detail })),
            machineNotes: r.machine,
            weakest: r.weakest,
            gap: r.useCase.gap,
            second: r.second
              ? {
                  label: r.second.measure.label,
                  measure: r.second.measure.measure,
                  unit: r.second.measure.unit,
                  better: r.second.measure.better,
                  onlyOn: r.second.measure.onlyOn,
                  source: `src/data/${r.second.measure.source}`,
                  chart: `/${r.second.from === linkedTrack ? `?track=${r.second.from}` : ""}#${r.second.measure.chart.section}/${r.second.measure.chart.tab}`,
                  pick: r.second.pick ? { provider: r.second.pick.provider, name: providerName(r.second.pick.provider), value: r.second.pick.value, display: r.second.pick.display } : null,
                  tiedWith: r.second.tiedWith.map((e) => e.provider),
                  ranked: r.second.ranked.map((e) => ({ rank: placeOf(r.second?.ranked ?? [], e.provider, "shown"), provider: e.provider, name: providerName(e.provider), value: e.value, display: e.display, note: e.note })),
                }
              : null,
            ranked: r.ranked.map((e) => ({ rank: placeOf(r.ranked, e.provider, r.useCase.tie), provider: e.provider, name: providerName(e.provider), value: e.value, display: e.display, ci95: e.ci95, note: e.note })),
            notCounted: r.skipped.map((s) => ({ provider: s.provider, name: providerName(s.provider), why: s.why, betterThanPick: s.ahead })),
          })),
        },
      ]),
    ),
  };
}

/** "Restart speed: Styne 59.1 ms (median of 5 restarts); next Upstash 86.8 ms, 47% longer." */
function secondText(s: SecondResult): string {
  if (!s.pick) return `${s.measure.label}: no provider has a result yet.`;
  const lead = s.next ? leadText(s.pick, s.next, s.measure.unit) : null;
  const tied = s.tiedWith.length ? `, tied with ${s.tiedWith.map((e) => providerName(e.provider)).join(", ")}` : "";
  const next = s.next ? `; next ${providerName(s.next.provider)} ${s.next.display}${lead ? `, ${lead}` : ""}` : "";
  return `${s.measure.label} (${s.measure.measure}): ${providerName(s.pick.provider)} ${s.pick.display}${s.pick.note ? ` (${s.pick.note})` : ""}${tied}${next}.`;
}

/** The use cases as Markdown, one list per track, for llms.txt and results.md. */
export function useCasesMarkdown(level: "#" | "##") {
  const sub = level === "#" ? "##" : "###";
  return [
    `${level} Best for`,
    "",
    `${useCasesAbout} JSON: /use-cases.json.`,
    "",
    ...trackIds.flatMap((id) => [
      `${sub} ${trackInfo[id].label}`,
      "",
      ...useCasesFor(id).map((r) => {
        if (!r.pick) return r.skipped.length ? `- ${r.useCase.title}: no eligible result. Not counted: ${r.skipped.map((s) => `${providerName(s.provider)} ${s.why}`).join("; ")}.` : `- ${r.useCase.title}: no provider has a result yet.`;
        const only = r.useCase.onlyOn && r.useCase.onlyOn !== id ? `, ${trackInfo[r.useCase.onlyOn].label} only` : "";
        const ahead = r.skipped.filter((s) => s.ahead);
        const parts = [
          r.reason,
          ...r.caveats.map((c) => `${providerName(c.provider)}: ${c.caveat.detail}.`),
          ...r.machine.map((m) => `${providerName(m.provider)} ${m.note}`),
          ahead.length ? `Not counted: ${ahead.map((s) => `${providerName(s.provider)} ${s.why}`).join("; ")}.` : null,
          r.weakest ? `Weakest elsewhere: ${weakestText(r.weakest, id)}.` : null,
          r.second ? secondText(r.second) : null,
          r.useCase.gap,
          `Chart: ${chartHref(r)}`,
        ];
        return `- ${r.useCase.title} (${r.useCase.measure}${only}): ${parts.filter((x) => x !== null).join(" ")}`;
      }),
      "",
    ]),
  ];
}
