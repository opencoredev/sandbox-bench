import { realTasksSection, taskTimes } from "@/components/real-tasks";
import { taskCostSection } from "@/components/realistic";
import { sustainedCpuSection } from "@/components/sustained-cpu";
import { agentData } from "@/lib/agent-data";
import { trackIds, trackInfo, tracks } from "@/lib/data";
import type { Track, TrackId } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";
import { autoStandby } from "@/lib/notes";
import { pauses } from "@/lib/pause";
import { cpuCaveat, isExtraTier, providerName } from "@/lib/providers";
import type { CpuCaveat, ProviderId } from "@/lib/providers";
import { completedText, headlineRows, notCountedWhy, perThousand, runTrackOf, taskPick } from "@/lib/realistic";
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

/** One provider's reading on a use case's measure. */
export interface Entry {
  provider: ProviderId;
  value: number;
  /** The reading as its chart prints it: "0.20 s", "$0.76", "85M/s". */
  display: string;
  /** The 95% interval of a median, where the chart has one; ties use it. */
  ci95: readonly [number, number] | null;
  /** What else the chart says about this reading, as a clause: "the pause before it took 0.05 s". */
  note: string | null;
}

/** A provider the chart shows but the pick leaves out, by the chart's own rule. */
export interface Skipped {
  provider: ProviderId;
  why: string;
}

/** How a tie is called: medians inside each other's 95% intervals, or the same printed value where there is no interval. */
export type TieRule = "ci95" | "shown";

interface Reading {
  /** Best first. */
  entries: Entry[];
  skipped: Skipped[];
}

export interface UseCase {
  id: string;
  title: string;
  /** Who the card is for, in a few words. */
  forWhat: string;
  /** The number behind the pick. */
  measure: string;
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
}

const published = agentData().tracks;

/** Best first by value, then by id so equal readings keep a fixed order. */
const bestFirst = (entries: Entry[], better: Better) =>
  entries.sort((a, b) => (better === "lower" ? a.value - b.value : b.value - a.value) || a.provider.localeCompare(b.provider));

/** Ranks only a provider's first CPU tier, as every other pick on the site does. */
const firstTier = <T extends { provider: ProviderId }>(rows: readonly T[]) => rows.filter((r) => !isExtraTier(r.provider));

const excludedPrefix = "excluded: ";

/**
 * Medians of one main-suite metric, with each provider's status taken from
 * the published results, so a result the results file leaves out of rankings
 * (excluded, unsupported, failed) never becomes a pick. Raw medians, as the chart prints them.
 */
const metricReading =
  (id: string) =>
  (track: Track): Reading => {
    const m = track.findMetric(id);
    const results = firstTier(published[track.id].metrics.find((x) => x.id === id)?.results ?? []);
    if (!m) return { entries: [], skipped: [] };
    const entries = results.flatMap((r) => {
      const v = m.values.find((x) => x.provider === r.provider);
      if (r.status !== "measured" || !v || v.p50 === null) return [];
      const ci95 = v.ciLow === null || v.ciHigh === null ? null : ([v.ciLow, v.ciHigh] as const);
      return [{ provider: r.provider, value: v.p50, display: formatValue(v.p50, m.unit), ci95, note: v.failures > 0 ? `${v.failures} of ${v.n + v.failures} attempts failed` : null }];
    });
    const skipped = results.flatMap((r) => (r.status.startsWith(excludedPrefix) ? [{ provider: r.provider, why: r.status.slice(excludedPrefix.length) }] : []));
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
        .map((r) => ({ provider: r.provider, why: `only ${completedText(r)} runs completed, and a pick allows at most ${MAX_INCOMPLETE} incomplete` })),
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
    skipped: firstTier(missing).flatMap((m) => (m.notRun ? [] : [{ provider: m.provider, why: m.why }])),
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
    r.kind === "restart" ? [{ provider, why: "stop and start restarts the sandbox, which isn't a pause" }] : r.kind === "none" && !autoStandby[provider] ? [{ provider, why: "no pause support" }] : [],
  );
  return { entries: bestFirst(entries, "lower"), skipped };
}

/** Where a counted cost comes from. */
const costBasis = { billed: "from the provider's own bill", metered: "from the provider's usage meter", estimate: "a list-price estimate" } as const;

/** Fix and test cost per 1,000 completed tasks, by the cost chart's Cheapest rule: only billed or metered costs count. */
function costReading(track: Track): Reading {
  const costed = firstTier(headlineRows(realistic, runTrackOf[track.id], "fix-and-test").costed);
  const p = taskPick(costed);
  const counted = new Set(p.kind === "picked" ? p.counted : []);
  return {
    entries: bestFirst(
      costed.filter((r) => counted.has(r.provider)).map((r) => ({ provider: r.provider, value: r.cost.usdPerCompleted, display: perThousand(r.cost.usdPerCompleted), ci95: null, note: costBasis[r.cost.kind] })),
      "lower",
    ),
    skipped: p.kind === "empty" ? [] : p.lower.map((r) => ({ provider: r.provider, why: `${perThousand(r.cost.usdPerCompleted)} per 1,000, but ${notCountedWhy(r).join("; ")}` })),
  };
}

/** The use cases, in card order. Add one by adding an entry; its pick, reason and weakest spot follow from `read`. */
export const useCaseList: readonly UseCase[] = [
  {
    id: "long-running",
    title: "Long-running tasks",
    forWhat: "Agents that keep the CPU busy for many minutes",
    measure: "CPU work per second in minutes 12–15 of a 15-minute run",
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
    better: "lower",
    tie: "shown",
    source: "benchmark.<track>.json",
    chart: { section: "state", tab: "resume" },
    onlyOn: null,
    gap: "Restart speed after a crash or a stop isn't measured yet, so this ranks resume after a pause only.",
    read: resumeReading,
  },
  {
    id: "cheapest-task",
    title: "Cheapest real task",
    forWhat: "Many coding tasks on a budget",
    measure: "Fix and test, cost per 1,000 completed tasks",
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
    title: "Heavy builds",
    forWhat: "Production builds and other CPU, disk and network-heavy jobs",
    measure: "Jitsi Meet production build, create to confirmed delete",
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
    better: "lower",
    tie: "ci95",
    source: "benchmark.<track>.json",
    chart: { section: "state", tab: "create-from-snapshot" },
    onlyOn: null,
    gap: null,
    read: metricReading("create-from-snapshot"),
  },
];

/** Whether two readings tie under a rule: inside each other's 95% intervals, or the same printed value. */
export function isTie(a: Pick<Entry, "value" | "display" | "ci95">, b: Pick<Entry, "value" | "display" | "ci95">, rule: TieRule): boolean {
  switch (rule) {
    case "ci95":
      return a.ci95 !== null && b.ci95 !== null ? a.value >= b.ci95[0] && a.value <= b.ci95[1] && b.value >= a.ci95[0] && b.value <= a.ci95[1] : a.display === b.display;
    case "shown":
      return a.display === b.display;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** A provider's place among entries sorted best first, sharing the place with any that print the same value: 1-based, or null when it has none. */
export function placeOf(entries: readonly Pick<Entry, "provider" | "display">[], provider: ProviderId): number | null {
  const mine = entries.find((e) => e.provider === provider);
  return mine ? entries.findIndex((e) => e.display === mine.display) + 1 : null;
}

/** "1.9×", or a percentage when the lead is under 10%. */
export function margin(pick: Pick<Entry, "value">, next: Pick<Entry, "value">, better: Better) {
  const ratio = better === "lower" ? next.value / pick.value : pick.value / next.value;
  return ratio < 1.1 ? `${Math.max(1, Math.round((ratio - 1) * 100))}%` : `${ratio.toFixed(1)}×`;
}

/** Where a pick ranks worst among the other use cases on the same track. */
export interface Weakest {
  useCase: string;
  title: string;
  rank: number;
  of: number;
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
  /** What the pick measured and by how much it leads, in a sentence or two. */
  reason: string | null;
  caveat: CpuCaveat | null;
  weakest: Weakest | null;
}

function reasonFor(u: UseCase, pick: Entry, tiedWith: readonly Entry[], next: Entry | null) {
  const head = `${providerName(pick.provider)}: ${pick.display}${pick.note ? `; ${pick.note}` : ""}.`;
  if (tiedWith.length > 0) return `${head} Tied with ${tiedWith.map((e) => `${providerName(e.provider)} (${e.display})`).join(", ")}${u.tie === "ci95" ? " inside the 95% intervals" : " at the value shown"}.`;
  return next ? `${head} Ahead of the next, ${providerName(next.provider)} (${next.display}), by ${margin(pick, next, u.better)}.` : `${head} The only provider with a result.`;
}

/** Ranks a pick's weakest spot by rank over the number ranked, so 14th of 15 is weaker than 3rd of 4. */
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
    return { useCase, from, ranked: entries, pick, tiedWith, next, skipped, reason: pick ? reasonFor(useCase, pick, tiedWith, next) : null, caveat: pick ? cpuCaveat(pick.provider) : null };
  });
  return base.map((b) => {
    const { pick } = b;
    if (!pick) return { ...b, weakest: null };
    const places = base.flatMap((o) => {
      const rank = o === b ? null : placeOf(o.ranked, pick.provider);
      return rank === null || rank === 1 ? [] : [{ useCase: o.useCase.id, title: o.useCase.title, rank, of: o.ranked.length }];
    });
    return { ...b, weakest: weakestOf(places) };
  });
}

/** The page link a card's chart opens on: the landing track needs no query. */
export const chartHref = (r: Pick<UseCaseResult, "useCase" | "from">) => `/${r.from === linkedTrack ? `?track=${r.from}` : ""}#${r.useCase.chart.section}/${r.useCase.chart.tab}`;

/** "Long-running tasks: 14th of 15". */
export const weakestText = (w: Weakest) => `${w.title}: ${ordinal(w.rank)} of ${w.of}`;

export const useCasesAbout =
  "Which provider leads for each kind of job, computed from this site's benchmark data by fixed rules each time the data changes. A pick is the best reading on one measure among providers on the CPU tier a new account gets; no provider paid for or chose a pick.";

const rules = [
  "Each use case reads one measure, named in `measure`, from the chart at `chart`.",
  "Providers are ranked on the CPU tier a new account gets; cheaper or spot tiers are compared under CPU tiers instead.",
  "`tie: ci95`: medians inside each other's 95% intervals are tied. `tie: shown`: there is no interval, so only the same printed value ties.",
  "Real task picks allow at most one incomplete run. The cheapest needs a cost from the provider's own bill or usage meter; cheaper costs that can't count are in `notCounted` with why.",
  "`weakest` is where the pick ranks lowest among the other use cases on the same track, by rank over the number ranked.",
  "`onlyOn` names the one track a measure ran on; every track then shows that track's pick.",
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
            better: r.useCase.better,
            tie: r.useCase.tie,
            onlyOn: r.useCase.onlyOn,
            source: `src/data/${r.useCase.source.replace("<track>", r.from)}`,
            chart: chartHref(r),
            pick: r.pick ? { provider: r.pick.provider, name: providerName(r.pick.provider), value: r.pick.value, display: r.pick.display } : null,
            tiedWith: r.tiedWith.map((e) => e.provider),
            reason: r.reason,
            cpuCaveat: r.caveat?.detail ?? null,
            weakest: r.weakest,
            gap: r.useCase.gap,
            ranked: r.ranked.map((e) => ({ rank: placeOf(r.ranked, e.provider), provider: e.provider, name: providerName(e.provider), value: e.value, display: e.display, ci95: e.ci95, note: e.note })),
            notCounted: r.skipped.map((s) => ({ provider: s.provider, name: providerName(s.provider), why: s.why })),
          })),
        },
      ]),
    ),
  };
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
        if (!r.pick) return `- ${r.useCase.title}: no provider has a result yet.`;
        const only = r.useCase.onlyOn && r.useCase.onlyOn !== id ? `, ${trackInfo[r.useCase.onlyOn].label} only` : "";
        const parts = [r.reason, r.caveat ? `${r.caveat.detail}.` : null, r.weakest ? `Weakest elsewhere: ${weakestText(r.weakest)}.` : null, r.useCase.gap, `Chart: ${chartHref(r)}`];
        return `- ${r.useCase.title} (${r.useCase.measure}${only}): ${parts.filter((x) => x !== null).join(" ")}`;
      }),
      "",
    ]),
  ];
}
