import { realTasksSection, taskTimes } from "@/components/real-tasks";
import { taskCostSection } from "@/components/realistic";
import type { Track } from "@/lib/data";
import { formatPercent, formatValue } from "@/lib/format";
import type { ProviderId } from "@/lib/providers";
import { headlineRows, perThousand, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { scoreReadings } from "@/lib/score";
import type { Better, Reading, Score } from "@/lib/score";
import { successRate } from "@/lib/status";

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
  /** The section with the underlying numbers, and the tab to open there when it has tabs. */
  link: { section: string; tab: string | null };
  read: (track: Track) => readonly Reading[];
  /** The reading as the linked chart prints it. */
  format: (value: number) => string;
}

/** Medians of one exported metric, skipping providers with no successful run. */
export const metricReadings =
  (id: string) =>
  (track: Track): Reading[] =>
    (track.findMetric(id)?.values ?? []).flatMap((v) => (v.n > 0 && v.p50 !== null ? [{ provider: v.provider, value: v.p50 }] : []));

/** Seconds, as the metric charts print them. */
const seconds = (v: number) => formatValue(v, "s");

export const scoreCategories = [
  {
    id: "speed",
    label: "Speed",
    measure: "Cold start, median",
    better: "lower",
    link: { section: "startup", tab: "cold" },
    read: metricReadings("cold"),
    format: seconds,
  },
  {
    id: "reliability",
    label: "Reliability",
    measure: "Attempts that succeeded",
    better: "higher",
    link: { section: "reliability", tab: null },
    read: (track) => track.providers.flatMap((p) => {
      const { rate } = successRate(track, p);
      return rate === null ? [] : [{ provider: p.id, value: rate }];
    }),
    format: (v) => formatPercent(v, 1),
  },
  {
    id: "cost",
    label: "Cost",
    measure: "Fix and test, per 1,000",
    better: "lower",
    link: { section: taskCostSection, tab: "fix-and-test" },
    read: (track) => headlineRows(realistic, runTrackOf[track.id], "fix-and-test").costed.map((r) => ({ provider: r.provider, value: r.cost.usdPerCompleted })),
    format: perThousand,
  },
  {
    id: "real-tasks",
    label: "Real tasks",
    measure: "Fix and test, median time",
    better: "lower",
    link: { section: realTasksSection, tab: "fix-and-test" },
    read: (track) => taskTimes(track, "fix-and-test").timed.map((r) => ({ provider: r.provider, value: r.medianWallS })),
    format: seconds,
  },
  {
    id: "bursts",
    label: "Bursts",
    measure: "10 at once, median",
    better: "lower",
    link: { section: "scale", tab: "burst-10" },
    read: metricReadings("burst-10"),
    format: seconds,
  },
] as const satisfies readonly ScoreCategory[];

export type ScoreCategoryId = (typeof scoreCategories)[number]["id"];

/** A score with its reading as the linked chart prints it. */
export type ScoreCell = (Extract<Score, { kind: "scored" }> & { display: string }) | Extract<Score, { kind: "not-measured" }>;

/** One category's scores on a track, one per provider in the track's order. */
export type CategoryScores = { category: ScoreCategory; scores: ScoreCell[] };

export function trackScores(track: Track, categories: readonly ScoreCategory[] = scoreCategories): CategoryScores[] {
  const providers: ProviderId[] = track.providers.map((p) => p.id);
  return categories.map((category) => ({
    category,
    scores: scoreReadings({ providers, readings: category.read(track), better: category.better }).map((s): ScoreCell =>
      s.kind === "scored" ? { ...s, display: category.format(s.value) } : s,
    ),
  }));
}
