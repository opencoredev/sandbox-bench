import { agentData, groups, llmsTxt, notRunText } from "@/lib/agent-data";
import { costKinds, formatPerThousand, formatTaskCost } from "@/lib/cost";
import { trackIds } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import { formatValue } from "@/lib/format";
import type { Unit } from "@/lib/format";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * One provider's results as a page reads them. Everything comes from
 * agentData(), the same model /results.json publishes, so a page can never
 * show a number, rank or exclusion the results page doesn't.
 */

type Data = ReturnType<typeof agentData>;
type TrackData = Data["tracks"][TrackId];
type MetricData = TrackData["metrics"][number];
type Result = MetricData["results"][number];
type Ranked = Result & { median: number; ci95: [number, number] };

const isRanked = (r: Result): r is Ranked =>
  r.status === "measured" && r.median !== null && r.ci95 !== null && r.ci95.length === 2 && typeof r.ci95[0] === "number" && typeof r.ci95[1] === "number";

// The site's tie rule: medians inside each other's 95% intervals count as tied.
const tied = (a: Ranked, b: Ranked) => a.median >= b.ci95[0] && a.median <= b.ci95[1] && b.median >= a.ci95[0] && b.median <= a.ci95[1];

export type Standing =
  | { kind: "ranked"; rank: number; of: number; median: string; p95: string; ci: string; leader: { id: ProviderId; median: string } | null; tiedWith: ProviderId[] }
  | { kind: "blank"; why: string };

export interface MetricRow {
  id: string;
  label: string;
  better: "lower" | "higher";
  standing: Standing;
}

const blankWhy = (status: string) => {
  const text = notRunText(status)
    .replace(/^unsupported: /, "")
    .replace(/^unsupported$/, "not supported")
    .replace(/^excluded: /, "left out of the ranking: ")
    .replace(/^coming-next-update: /, "")
    .replace(/^not-measured: /, "")
    .replace(/^all-failed$/, "every attempt failed");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function standingOf(m: MetricData, id: ProviderId): Standing {
  const unit: Unit = m.unit;
  const ranked = m.results.filter(isRanked);
  const mine = ranked.find((r) => r.provider === id);
  if (!mine) return { kind: "blank", why: blankWhy(m.results.find((r) => r.provider === id)?.status ?? "not run") };
  const leader = ranked[0];
  const fmt = (v: number) => formatValue(v, unit);
  return {
    kind: "ranked",
    rank: ranked.indexOf(mine) + 1,
    of: ranked.length,
    median: fmt(mine.median),
    p95: mine.p95 === null ? "n/a" : fmt(mine.p95),
    ci: `${fmt(mine.ci95[0])} to ${fmt(mine.ci95[1])}`,
    leader: leader && leader.provider !== id ? { id: leader.provider, median: fmt(leader.median) } : null,
    tiedWith: ranked.filter((r) => r.provider !== id && tied(r, mine)).map((r) => r.provider),
  };
}

export function providerTrack(trackId: TrackId, id: ProviderId) {
  const t = agentData().tracks[trackId];
  const p = t.providers.find((x) => x.id === id);
  if (!t.published || !p) return null;
  const cost = p.costPerTask;
  return {
    id: trackId,
    label: t.label,
    description: t.description,
    run: { start: t.run.start.slice(0, 10), end: t.run.end.slice(0, 10) },
    providerCount: t.providers.length,
    machine: { asked: p.allocation.requested.text, measured: p.allocation.measuredText, equalSpec: p.allocation.equalSpec, note: p.allocationNote },
    ranIn: p.ranIn,
    cost:
      "basis" in cost && cost.perTaskUsd !== null
        ? { kind: "priced" as const, perTask: formatTaskCost(cost.perTaskUsd), perThousand: formatPerThousand(cost.perTaskUsd), label: costKinds[cost.kind].label, source: costKinds[cost.kind].source, basis: cost.basis }
        : { kind: "none" as const, note: "note" in cost ? cost.note : "no cost data" },
    pricePerHourUsd: p.price.perHourUsd,
    reliability: p.reliability,
    failures: p.failures,
    pause: p.pause,
    picks: t.quickPicks,
    groups: groups.map((g) => ({
      title: g.title,
      rows: g.ids.flatMap((mid): MetricRow[] => {
        const m = t.metrics.find((x) => x.id === mid);
        return m ? [{ id: m.id, label: m.label, better: m.better, standing: standingOf(m, id) }] : [];
      }),
    })),
  };
}

export type ProviderTrack = NonNullable<ReturnType<typeof providerTrack>>;

/** Both tracks for one provider, landing track first, skipping a track it has no results on. */
export function providerResults(id: ProviderId) {
  const all = agentData();
  const shown = trackIds.flatMap((tid) => {
    const r = providerTrack(tid, id);
    return r ? [r] : [];
  });
  return { name: providerName(id), hardware: all.tracks[trackIds[0]].providers.find((p) => p.id === id)?.hardware ?? null, tracks: shown };
}

/** "cold start 0.79 s (4th of 9)": a metric's standing in a few words, for descriptions and the summary. */
export function headline(t: ProviderTrack, metricId: string) {
  const row = t.groups.flatMap((g) => g.rows).find((r) => r.id === metricId);
  if (!row || row.standing.kind !== "ranked") return null;
  return { label: row.label, median: row.standing.median, rank: row.standing.rank, of: row.standing.of, tied: row.standing.tiedWith.length > 0 };
}

/** What one task is, as the published model words it. */
export const taskText = () => agentData().task;

/**
 * The site's own notes about one provider: the sentences of llms.txt's
 * "Coming in the next update" section that start with its name. Read from the
 * published text so a note disappears from the page when it leaves the site.
 */
export function providerNotes(id: ProviderId) {
  const name = providerName(id);
  const section = llmsTxt().split("## Coming in the next update")[1]?.split("\n## ")[0] ?? "";
  return section
    .trim()
    .split(/(?<=\.) (?=[A-Z])/)
    .filter((s) => s.startsWith(`${name} `) || s.startsWith(`${name}'s `));
}
