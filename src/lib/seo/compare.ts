import { agentData, groups } from "@/lib/agent-data";
import { trackIds } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import { formatValue } from "@/lib/format";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { blankWhy, isRanked, providerTrack, tied } from "@/lib/seo/provider";
import type { MetricData, ProviderTrack, Ranked } from "@/lib/seo/provider";

/**
 * Two providers' results side by side, from the same agentData() model the
 * provider pages and /results.json use. Which one is ahead follows the site's
 * ranking, and a gap inside both 95% intervals is a tie, never a win.
 */

export type Side =
  | { kind: "ranked"; rank: number; of: number; median: string; p95: string; ci: string }
  | { kind: "blank"; why: string };

export type Verdict = { kind: "ahead"; leader: ProviderId } | { kind: "tied" } | { kind: "not-compared" };

export interface CompareRow {
  id: string;
  label: string;
  better: "lower" | "higher";
  a: Side;
  b: Side;
  verdict: Verdict;
}

function compareMetric(m: MetricData, a: ProviderId, b: ProviderId): CompareRow {
  const ranked = m.results.filter(isRanked);
  const fmt = (v: number) => formatValue(v, m.unit);
  const side = (id: ProviderId): Side => {
    const r = ranked.find((x) => x.provider === id);
    if (!r) return { kind: "blank", why: blankWhy(m.results.find((x) => x.provider === id)?.status ?? "not run") };
    return { kind: "ranked", rank: ranked.indexOf(r) + 1, of: ranked.length, median: fmt(r.median), p95: r.p95 === null ? "n/a" : fmt(r.p95), ci: `${fmt(r.ci95[0])} to ${fmt(r.ci95[1])}` };
  };
  return { id: m.id, label: m.label, better: m.better, a: side(a), b: side(b), verdict: verdictOf(ranked, a, b) };
}

type RankedLike = Pick<Ranked, "provider" | "median" | "ci95">;

/** Who is ahead among ranked results sorted best first: the lower index, unless the medians are tied or one side is missing. */
export function verdictOf(ranked: readonly RankedLike[], a: ProviderId, b: ProviderId): Verdict {
  const ia = ranked.findIndex((x) => x.provider === a);
  const ib = ranked.findIndex((x) => x.provider === b);
  const ra = ranked[ia];
  const rb = ranked[ib];
  if (!ra || !rb) return { kind: "not-compared" };
  if (tied(ra, rb)) return { kind: "tied" };
  return { kind: "ahead", leader: ia < ib ? a : b };
}

export function compareTrack(trackId: TrackId, a: ProviderId, b: ProviderId) {
  const t = agentData().tracks[trackId];
  const pa = providerTrack(trackId, a);
  const pb = providerTrack(trackId, b);
  if (!t.published || !pa || !pb) return null;
  const rowGroups = groups.map((g) => ({
    title: g.title,
    rows: g.ids.flatMap((mid): CompareRow[] => {
      const m = t.metrics.find((x) => x.id === mid);
      return m ? [compareMetric(m, a, b)] : [];
    }),
  }));
  const rows = rowGroups.flatMap((g) => g.rows);
  const count = (v: (r: CompareRow) => boolean) => rows.filter(v).length;
  return {
    id: trackId,
    label: t.label,
    description: t.description,
    run: { start: t.run.start.slice(0, 10), end: t.run.end.slice(0, 10) },
    providerCount: t.providers.length,
    sides: { a: pa, b: pb },
    groups: rowGroups,
    tally: {
      compared: count((r) => r.verdict.kind !== "not-compared"),
      a: count((r) => r.verdict.kind === "ahead" && r.verdict.leader === a),
      b: count((r) => r.verdict.kind === "ahead" && r.verdict.leader === b),
      tied: count((r) => r.verdict.kind === "tied"),
    },
  };
}

export type CompareTrack = NonNullable<ReturnType<typeof compareTrack>>;

/** Both tracks for a pair, landing track first, skipping a track where either has no results. */
export function compareResults(a: ProviderId, b: ProviderId) {
  return {
    names: { a: providerName(a), b: providerName(b) },
    tracks: trackIds.flatMap((tid) => {
      const r = compareTrack(tid, a, b);
      return r ? [r] : [];
    }),
  };
}

/** One metric's row on a track, for the summary and description. */
export const rowOf = (t: CompareTrack, metricId: string) => t.groups.flatMap((g) => g.rows).find((r) => r.id === metricId) ?? null;

/** True when two sides' costs are of different kinds and so can't be compared directly. */
export const costKindsDiffer = (x: ProviderTrack, y: ProviderTrack) => x.cost.kind === "priced" && y.cost.kind === "priced" && x.cost.label !== y.cost.label;
