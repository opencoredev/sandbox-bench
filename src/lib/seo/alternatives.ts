import { agentData } from "@/lib/agent-data";
import { trackIds } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";
import { compareTrack, rowOf } from "@/lib/seo/compare";
import type { CompareRow, CompareTrack } from "@/lib/seo/compare";

/**
 * Every other provider on a track, each measured head to head against one
 * provider, for an "<provider> alternatives" page. Built from compareTrack(),
 * so every verdict and tally is the one the comparison pages would show,
 * under the same tie rule.
 */

export interface Alternative {
  id: ProviderId;
  /** The pair from the alternative's side: `a` is the alternative, `b` the provider it replaces. */
  pair: CompareTrack;
  cold: CompareRow | null;
  tool: CompareRow | null;
}

export function alternativesTrack(trackId: TrackId, target: ProviderId) {
  const t = agentData().tracks[trackId];
  if (!t.published || !t.providers.some((p) => p.id === target)) return null;
  const alternatives = t.providers.flatMap((p): Alternative[] => {
    if (p.id === target) return [];
    const pair = compareTrack(trackId, p.id, target);
    return pair ? [{ id: p.id, pair, cold: rowOf(pair, "cold"), tool: rowOf(pair, "tool-replay") }] : [];
  });
  const first = alternatives[0];
  if (!first) return null;
  return {
    id: trackId,
    label: t.label,
    description: t.description,
    run: { start: t.run.start.slice(0, 10), end: t.run.end.slice(0, 10) },
    providerCount: t.providers.length,
    /** The replaced provider's own side, the same on every pair. */
    target: first.pair.sides.b,
    alternatives,
    picks: first.pair.sides.b.picks,
  };
}

export type AlternativesTrack = NonNullable<ReturnType<typeof alternativesTrack>>;

/** Both tracks, landing track first, skipping a track the provider has no results on. */
export const alternativesResults = (target: ProviderId) =>
  trackIds.flatMap((tid) => {
    const r = alternativesTrack(tid, target);
    return r ? [r] : [];
  });

/** How many alternatives are ahead of, behind or tied with the target on one test, by the site's verdicts. */
export function verdictCount(t: AlternativesTrack, pick: (a: Alternative) => CompareRow | null) {
  const rows = t.alternatives.flatMap((a) => {
    const r = pick(a);
    return r ? [{ id: a.id, verdict: r.verdict }] : [];
  });
  return {
    ahead: rows.filter((r) => r.verdict.kind === "ahead" && r.verdict.leader === r.id).length,
    behind: rows.filter((r) => r.verdict.kind === "ahead" && r.verdict.leader !== r.id).length,
    tied: rows.filter((r) => r.verdict.kind === "tied").length,
  };
}
