import { realTasksSection, taskTimes } from "@/components/real-tasks";
import { taskCostSection } from "@/components/realistic";
import type { Track } from "@/lib/data";
import { formatValue } from "@/lib/format";
import { isExtraTier } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { headlineRows, notCountedWhy, perThousand, runTrackOf } from "@/lib/realistic";
import type { Costed } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import type { RealisticData } from "@/lib/realistic";
import type { RealtaskBurst } from "@/lib/realtask-burst";
import { realtaskBurst } from "@/lib/realtask-burst-data";
import { scoreReadings } from "@/lib/score";
import type { Better, Excluded, Reading, Score } from "@/lib/score";

/**
 * How a category shows each provider: a 0 to 100 score against the best, or
 * the reading itself. Cost shows dollars because the cheapest providers cost a
 * tenth to a fiftieth of the rest, so a score would squash everyone else into
 * single digits.
 */
export type ScoreShows = "score" | "value";

/**
 * The score categories, in column order. Each one reads a single number the
 * page already charts, says which way is better, and links to that chart.
 *
 * To add a category (CPU, CPU burst, burst survival), add one entry here. For
 * a metric in the site-data export, `read: metricReadings("<metric id>")` is
 * enough: until the export carries that id, every provider shows "Not measured".
 */
export interface ScoreCategory {
  id: string;
  /** The column title: "Speed". */
  label: string;
  /** The number behind the score, in a few words: "Cold start, median". */
  measure: string;
  better: Better;
  shows: ScoreShows;
  /** The section with the underlying numbers, and the tab to open there when it has tabs. */
  link: { section: string; tab: string | null };
  read: (track: Track) => readonly Reading[];
  /** Readings the linked chart shows but doesn't count, by the chart's own rule. They score nothing and never set the best. */
  exclude?: (track: Track) => readonly Excluded[];
  /** The reading as the linked chart prints it. */
  format: (value: number) => string;
}

/** Medians of one exported metric, skipping providers with no successful run. */
export const metricReadings =
  (id: string) =>
  (track: Track): Reading[] =>
    (track.findMetric(id)?.values ?? []).flatMap((v) => (v.n > 0 && v.p50 !== null ? [{ provider: v.provider, value: v.p50 }] : []));

/** The fix and test rows the cost chart draws for a track, cheapest first. */
const costRows = (track: Track) => headlineRows(realistic, runTrackOf[track.id], "fix-and-test").costed;

/** More than one run didn't complete: the one reason the Cost column leaves a drawn cost out. */
const hasFailedRuns = (r: Pick<Costed, "incomplete">) => r.incomplete > 1;

/** Seconds, as the metric charts print them. */
const seconds = (v: number) => formatValue(v, "s");

/**
 * Real task runs that completed out of those that started, per provider: fix
 * and test and build on the track, plus fix and test 5 at once on Same
 * machine, the only track it ran on. A run that never started, such as one on
 * a default machine too small for the task or a burst our quota can't fit, is
 * left out rather than counted as a failure. A provider with no started run
 * has no reading, so it shows "Not measured".
 */
export function completionReadings({ track, data = realistic, burst = realtaskBurst }: { track: Track; data?: Pick<RealisticData, "rows">; burst?: Pick<RealtaskBurst, "providers"> }): Reading[] {
  const tally = new Map<ProviderId, { completed: number; started: number }>();
  const add = (provider: ProviderId, completed: number, started: number) => {
    const t = tally.get(provider) ?? { completed: 0, started: 0 };
    tally.set(provider, { completed: t.completed + completed, started: t.started + started });
  };
  for (const r of data.rows) if (r.variant === "headline" && r.track === runTrackOf[track.id]) add(r.provider, r.completed, r.attempts - r.notRun);
  if (track.id === "same-spec") for (const p of burst.providers) if (p.status === "ran") add(p.provider, p.completed, p.attempts);
  return [...tally].flatMap(([provider, { completed, started }]) => (started > 0 ? [{ provider, value: completed / started, display: `${completed}/${started}` }] : []));
}

/** A share as a whole percentage, for a reading with no fraction of its own. */
const percent = (v: number) => `${Math.round(v * 100)}%`;

export const scoreCategories = [
  {
    id: "speed",
    label: "Speed",
    measure: "Cold start, median",
    better: "lower",
    shows: "score",
    link: { section: "startup", tab: "cold" },
    read: metricReadings("cold"),
    format: seconds,
  },
  {
    id: "real-tasks",
    label: "Real tasks",
    measure: "Fix and test, median time",
    better: "lower",
    shows: "score",
    link: { section: realTasksSection, tab: "fix-and-test" },
    read: (track) => taskTimes(track, "fix-and-test").timed.map((r) => ({ provider: r.provider, value: r.medianWallS })),
    format: seconds,
  },
  {
    id: "bursts",
    label: "Bursts",
    measure: "10 at once, median",
    better: "lower",
    shows: "score",
    link: { section: "scale", tab: "burst-10" },
    read: metricReadings("burst-10"),
    format: seconds,
  },
  {
    id: "reliability",
    label: "Reliability",
    measure: "Real task runs completed",
    // Against the best provider like the other scores; in this data at least one completed every run, so 18 of 20 scores 90.
    better: "higher",
    shows: "score",
    link: { section: realTasksSection, tab: "fix-and-test" },
    read: (track) => completionReadings({ track }),
    format: percent,
  },
  {
    id: "cost",
    label: "Cost",
    measure: "Fix and test, per 1,000",
    better: "lower",
    shows: "value",
    link: { section: taskCostSection, tab: "fix-and-test" },
    // Every cost the chart draws, except a row with more than one failed run, which the chart itself flags as not
    // comparable. A row on the wrong machine size keeps its dollars here, marked by the row's machine footnote as
    // in the other columns; it still can't be the chart's "Cheapest" pick (isCounted, taskPick).
    read: (track) => costRows(track).flatMap((r) => (hasFailedRuns(r) ? [] : [{ provider: r.provider, value: r.cost.usdPerCompleted }])),
    exclude: (track) => costRows(track).flatMap((r) => (hasFailedRuns(r) ? [{ provider: r.provider, why: notCountedWhy(r).join("; ") }] : [])),
    format: perThousand,
  },
] as const satisfies readonly ScoreCategory[];

export type ScoreCategoryId = (typeof scoreCategories)[number]["id"];

/**
 * One provider in one category: a score with its reading as the linked chart
 * prints it, the reading alone where the category shows values, or no result.
 */
export type ScoreCell =
  | (Extract<Score, { kind: "scored" }> & { display: string })
  | { kind: "valued"; provider: ProviderId; value: number; display: string }
  | Exclude<Score, { kind: "scored" }>;

function toCell(score: Score, category: ScoreCategory, shown: ReadonlyMap<ProviderId, string>): ScoreCell {
  if (score.kind !== "scored") return score;
  const display = shown.get(score.provider) ?? category.format(score.value);
  switch (category.shows) {
    case "score":
      return { ...score, display };
    case "value":
      return { kind: "valued", provider: score.provider, value: score.value, display };
    default: {
      const _exhaustive: never = category.shows;
      return _exhaustive;
    }
  }
}

/** One category's scores on a track, one per provider in the track's order. */
export type CategoryScores = { category: ScoreCategory; scores: ScoreCell[] };

export function trackScores(track: Track, categories: readonly ScoreCategory[] = scoreCategories): CategoryScores[] {
  // A provider is scored on its first CPU tier, the one a new account gets; its other tiers are compared under CPU tiers (lib/providers.ts).
  const providers: ProviderId[] = track.providers.flatMap((p) => (isExtraTier(p.id) ? [] : [p.id]));
  const counted = <T extends { provider: ProviderId }>(rows: readonly T[]) => rows.filter((r) => !isExtraTier(r.provider));
  return categories.map((category) => {
    const readings = counted(category.read(track));
    // A reading's own display wins over the category's format; with a reading listed twice, the first counts, as in scoreReadings.
    const shown = new Map<ProviderId, string>();
    for (const r of readings) if (r.display !== undefined && !shown.has(r.provider)) shown.set(r.provider, r.display);
    return {
      category,
      scores: scoreReadings({ providers, readings, excluded: counted(category.exclude?.(track) ?? []), better: category.better }).map((s) => toCell(s, category, shown)),
    };
  });
}
