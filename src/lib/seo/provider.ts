import { agentData, groups, llmsTxt, notRunText } from "@/lib/agent-data";
import { costKinds, formatPerThousand, formatTaskCost, qualify } from "@/lib/cost";
import { trackIds, trackInfo, tracks } from "@/lib/data";
import type { Track, TrackId } from "@/lib/data";
import { formatCount, formatPercent, formatValue, ordinal } from "@/lib/format";
import type { Unit } from "@/lib/format";
import { isExtraTier, isProviderId, providerBrand, providerInfo, providerLabel, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { headlineRows, noCostReason, notCountedWhy, perThousand, runTrackOf } from "@/lib/realistic";
import type { ProfileId } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { trackScores } from "@/lib/score-categories";
import type { ScoreCategory, ScoreCell } from "@/lib/score-categories";
import type { Better } from "@/lib/score";

/**
 * One provider's results as a page reads them. Everything comes from
 * agentData(), the same model /results.json publishes, so a page can never
 * show a number, rank or exclusion the results page doesn't.
 */

type Data = ReturnType<typeof agentData>;
type TrackData = Data["tracks"][TrackId];
export type MetricData = TrackData["metrics"][number];
type Result = MetricData["results"][number];
export type Ranked = Result & { median: number; ci95: [number, number] };

export const isRanked = (r: Result): r is Ranked =>
  r.status === "measured" && r.median !== null && r.ci95 !== null && r.ci95.length === 2 && typeof r.ci95[0] === "number" && typeof r.ci95[1] === "number";

// The site's tie rule: medians inside each other's 95% intervals count as tied.
export const tied = (a: Pick<Ranked, "median" | "ci95">, b: Pick<Ranked, "median" | "ci95">) => a.median >= b.ci95[0] && a.median <= b.ci95[1] && b.median >= a.ci95[0] && b.median <= a.ci95[1];

export type Standing =
  | { kind: "ranked"; rank: number; of: number; median: string; p95: string; ci: string; leader: { id: ProviderId; median: string } | null; tiedWith: ProviderId[] }
  | { kind: "blank"; why: string };

export interface MetricRow {
  id: string;
  label: string;
  better: "lower" | "higher";
  standing: Standing;
}

export const blankWhy = (status: string) => {
  const text = notRunText(status)
    .replace(/^unsupported: /, "")
    .replace(/^unsupported$/, "not supported")
    .replace(/^excluded: /, "left out of the ranking: ")
    .replace(/^coming-next-update: /, "")
    .replace(/^standby: /, "")
    .replace(/^not-measured: /, "")
    .replace(/^all-failed$/, "every attempt failed");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * A provider's standing on one test. The words come from the track's own
 * unrounded values, as the home page's charts print them: the published
 * model rounds to 3 decimals first, which would print 1.24996 s as 1.3 s where
 * the chart says 1.2 s. Rank, ties and status come from the published model.
 */
function standingOf(m: MetricData, id: ProviderId, track: Track): Standing {
  const unit: Unit = m.unit;
  // A provider is ranked against other providers, not against its own cheaper CPU tiers.
  const ranked = m.results.filter(isRanked).filter((r) => r.provider === id || !isExtraTier(r.provider));
  const mine = ranked.find((r) => r.provider === id);
  if (!mine) return { kind: "blank", why: blankWhy(m.results.find((r) => r.provider === id)?.status ?? "not run") };
  const leader = ranked[0];
  const raw = (provider: ProviderId) => track.findMetric(m.id)?.values.find((v) => v.provider === provider);
  const own = raw(id);
  const fmt = (v: number) => formatValue(v, unit);
  const exact = (value: number | null | undefined, rounded: number) => fmt(value ?? rounded);
  return {
    kind: "ranked",
    rank: ranked.indexOf(mine) + 1,
    of: ranked.length,
    median: exact(own?.p50, mine.median),
    p95: mine.p95 === null ? "n/a" : exact(own?.p95, mine.p95),
    ci: `${exact(own?.ciLow, mine.ci95[0])} to ${exact(own?.ciHigh, mine.ci95[1])}`,
    leader: leader && leader.provider !== id ? { id: leader.provider, median: exact(raw(leader.provider)?.p50, leader.median) } : null,
    tiedWith: ranked.filter((r) => r.provider !== id && tied(r, mine)).map((r) => r.provider),
  };
}

export function providerTrack(trackId: TrackId, id: ProviderId) {
  const t = agentData().tracks[trackId];
  const p = t.providers.find((x) => x.id === id);
  if (!t.published || !p) return null;
  const cost = p.costPerTask;
  const costBound = "bound" in cost ? (cost.bound ?? null) : null;
  const priceBound = "bound" in p.price ? (p.price.bound ?? null) : null;
  return {
    id: trackId,
    label: t.label,
    description: t.description,
    run: { start: t.run.start.slice(0, 10), end: t.run.end.slice(0, 10) },
    providerCount: t.providers.filter((x) => !isExtraTier(x.id)).length,
    machine: { asked: p.allocation.requested.text, measured: p.allocation.measuredText, equalSpec: p.allocation.equalSpec, note: p.allocationNote },
    ranIn: p.ranIn,
    cost:
      "basis" in cost && cost.perTaskUsd !== null
        ? {
            kind: "priced" as const,
            perTask: qualify({ amount: formatTaskCost(cost.perTaskUsd), bound: costBound }),
            perThousand: qualify({ amount: formatPerThousand(cost.perTaskUsd), bound: costBound }),
            lowerBound: costBound === "lower",
            label: costKinds[cost.kind].label,
            tag: cost.tag,
            statusNote: cost.statusNote,
            source: costKinds[cost.kind].source,
            basis: cost.basis,
          }
        : { kind: "none" as const, note: "note" in cost ? cost.note : "no cost data" },
    pricePerHourUsd: p.price.perHourUsd,
    /** "$0.391", or "at least $0.021" for a lower bound. */
    pricePerHour: p.price.perHourUsd === null ? null : qualify({ amount: `$${p.price.perHourUsd}`, bound: priceBound }),
    /** "priced at Modal's us-east rate, 1.75× its base price", where a region multiplier applies. */
    priceNote: "regionNote" in p.price ? p.price.regionNote : null,
    billing: p.billing.label,
    wholeMachine: p.wholeMachineAtListPrice,
    reliability: p.reliability,
    failures: p.failures,
    pause: p.pause,
    picks: t.quickPicks,
    groups: groups.map((g) => ({
      title: g.title,
      rows: g.ids.flatMap((mid): MetricRow[] => {
        const m = t.metrics.find((x) => x.id === mid);
        return m ? [{ id: m.id, label: m.label, better: m.better, standing: standingOf(m, id, tracks[trackId]) }] : [];
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

/** One provider's place on a real-task chart: its value and rank, or why it has none. */
export type Placing = { kind: "ranked"; value: string; rank: number; of: number } | { kind: "blank"; why: string };

const notInPilot = "not in the realistic pilot";

/**
 * A provider's median time on a real-task workload, ranked fastest first among
 * the providers with a completed run, the order the home page's chart draws.
 */
export function realTaskTime(trackId: TrackId, id: ProviderId, profile: ProfileId): Placing {
  const { costed, uncosted } = headlineRows(realistic, runTrackOf[trackId], profile);
  const rows = [...costed, ...uncosted].filter((r) => r.provider === id || !isExtraTier(r.provider));
  const mine = rows.find((r) => r.provider === id);
  if (!mine) return { kind: "blank", why: notInPilot };
  if (mine.medianWallS === null) return { kind: "blank", why: mine.completed === 0 ? noCostReason(mine) : "no completed run" };
  const own = mine.medianWallS;
  const timed = rows.flatMap((r) => (r.medianWallS === null ? [] : [r.medianWallS]));
  return { kind: "ranked", value: formatValue(own, "s"), rank: timed.filter((v) => v < own).length + 1, of: timed.length };
}

/**
 * A provider's cost per 1,000 completed tasks on a real-task workload, ranked
 * cheapest first among the costed providers, with why it can't be the pick
 * (too many failed runs, or the wrong machine size), if it can't.
 */
export function realTaskCost(trackId: TrackId, id: ProviderId, profile: ProfileId): Placing & { notCounted: string[] } {
  const rows = headlineRows(realistic, runTrackOf[trackId], profile);
  const costed = rows.costed.filter((r) => r.provider === id || !isExtraTier(r.provider));
  const uncosted = rows.uncosted;
  const index = costed.findIndex((r) => r.provider === id);
  const mine = costed[index];
  if (mine) return { kind: "ranked", value: perThousand(mine.cost.usdPerCompleted), rank: index + 1, of: costed.length, notCounted: notCountedWhy(mine) };
  const row = uncosted.find((r) => r.provider === id);
  return { kind: "blank", why: row ? noCostReason(row) : notInPilot, notCounted: [] };
}

/** A track's pause and resume result in a few words: the measured split, the site's note, or whether it is supported. */
export function pauseText(t: ProviderTrack) {
  if (t.pause.supported && "split" in t.pause && t.pause.split) return `pause ${t.pause.split.pause.toFixed(2)} s, resume ${t.pause.split.resume.toFixed(2)} s (median of ${t.pause.split.n})`;
  if ("note" in t.pause && t.pause.note) return t.pause.note;
  return t.pause.supported ? "supported" : "not supported";
}

/** What one task is, as the published model words it. */
export const taskText = () => agentData().task;

/**
 * The words a note can use for a provider: its name, plus, for a provider that
 * sells a second product (Upstash Box and Ephemeral Box), that product's short
 * name ("Upstash") and its name without the brand ("Ephemeral Box").
 */
function noteNames(id: ProviderId) {
  const family = Object.keys(providerInfo).filter(isProviderId).filter((x) => x === id || providerBrand(x) === id);
  return family.flatMap((x) => {
    const label = providerLabel(x);
    return label.kind === "tagged" ? [providerName(x), label.short, `${label.tag} ${label.rest}`] : [providerName(x)];
  });
}

/**
 * The site's own notes about one provider: the sentences of llms.txt's
 * "Coming in the next update" section that mention it. Read from the
 * published text so a note disappears from the page when it leaves the site.
 */
export function providerNotes(id: ProviderId) {
  const names = noteNames(id);
  const section = llmsTxt().split("## Coming in the next update")[1]?.split("\n## ")[0] ?? "";
  return section
    .trim()
    .split(/(?<=\.) (?=[A-Z])/)
    .filter((s) => names.some((n) => new RegExp(`(^|[\\s(])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}('s)?[\\s,.;)]`).test(s)));
}

/* ---------------------------------------------------------------------------
 * The provider page's summaries: the scorecard, the verdict, where it stands
 * out and trails, the meta description and the FAQ. Every sentence is built
 * from the numbers above, so a page can say nothing the charts don't show.
 * ------------------------------------------------------------------------- */

/** The machine a track ran on, in words, from the track's own definition. */
export const machineOf = (trackId: TrackId) => (trackId === "same-spec" ? `the same ${trackInfo["same-spec"].short} machine` : "its default machine");

/** A rank among providers with a result, ties counted as the better place: "2nd of 12". */
export type Rank = { rank: number; of: number };
export const rankText = (r: Rank) => `${ordinal(r.rank)} of ${r.of}`;

/**
 * One score category for one provider on one track: the home page's own cell
 * (lib/score-categories.ts), so the numbers match the home page's Scores by
 * category exactly, and where it ranks among the providers with a result.
 */
export interface ScorecardEntry {
  category: Pick<ScoreCategory, "id" | "label" | "measure" | "better" | "shows" | "link">;
  cell: ScoreCell;
  rank: Rank | null;
}

/** A value's place among every provider's value, best first; equal values share the better place. */
const rankAmong = ({ own, values, better }: { own: number; values: readonly number[]; better: Better }): Rank => ({
  rank: values.filter((v) => (better === "lower" ? v < own : v > own)).length + 1,
  of: values.length,
});

const measuredValue = (cell: ScoreCell) => (cell.kind === "scored" || cell.kind === "valued" ? cell.value : null);

export function scorecard(trackId: TrackId, id: ProviderId): ScorecardEntry[] {
  return trackScores(tracks[trackId]).map(({ category, scores }) => {
    const cell: ScoreCell = scores.find((s) => s.provider === id) ?? { kind: "not-measured", provider: id };
    const own = measuredValue(cell);
    const values = scores.flatMap((s) => {
      const v = measuredValue(s);
      return v === null ? [] : [v];
    });
    const rank = own === null ? null : rankAmong({ own, values, better: category.better });
    const { id: cid, label, measure, better, shows, link } = category;
    return { category: { id: cid, label, measure, better, shows, link }, cell, rank };
  });
}

/** One ranked result in a few words, for the strengths and trade-offs: "Cold start, 0.31 s, 1st of 12". */
export interface Placed {
  id: string;
  label: string;
  value: string;
  rank: Rank;
  tied: boolean;
}

/**
 * Every ranked result of a provider on one track: each test in the results
 * table, plus the real tasks' time and cost as the scorecard ranks them.
 * Only results ranked among at least three providers, so "stands out" means something.
 */
export function placings(t: ProviderTrack, id: ProviderId): Placed[] {
  const rows = t.groups.flatMap((g) => g.rows);
  const fromRows = rows.flatMap((r): Placed[] =>
    r.standing.kind === "ranked" ? [{ id: r.id, label: r.label, value: r.standing.median, rank: { rank: r.standing.rank, of: r.standing.of }, tied: r.standing.tiedWith.length > 0 }] : [],
  );
  const card = scorecard(t.id, id);
  const fromCard = card.flatMap((e): Placed[] => {
    if (e.rank === null || (e.cell.kind !== "scored" && e.cell.kind !== "valued")) return [];
    switch (e.category.id) {
      case "real-tasks":
        return [{ id: "fix-and-test", label: "Real task: fix and test", value: e.cell.display, rank: e.rank, tied: false }];
      case "cost":
        return [{ id: "fix-and-test-cost", label: "Fix and test cost, per 1,000", value: e.cell.display, rank: e.rank, tied: false }];
      default:
        // Speed and Bursts are the cold start and burst rows of the results table, already listed.
        return [];
    }
  });
  const build = realTaskTime(t.id, id, "build");
  const fromBuild: Placed[] = build.kind === "ranked" ? [{ id: "build", label: "Real task: build", value: build.value, rank: { rank: build.rank, of: build.of }, tied: false }] : [];
  return [...fromRows, ...fromCard, ...fromBuild].filter((p) => p.rank.of >= 3);
}

/** How far down the field a result sits, 0 for first and 1 for last. */
const depth = (p: Placed) => (p.rank.rank - 1) / (p.rank.of - 1);

/**
 * Where a provider stands out and where it trails on one track: up to three
 * results from the top third of the field, best first, and up to three from
 * the bottom third, worst first. The thirds never overlap, so no result is both.
 */
export function highlights(t: ProviderTrack, id: ProviderId, count = 3): { leads: Placed[]; trails: Placed[] } {
  const all = placings(t, id);
  const third = (p: Placed) => Math.ceil(p.rank.of / 3);
  const leads = all
    .filter((p) => p.rank.rank <= third(p))
    .sort((a, b) => depth(a) - depth(b) || a.rank.rank - b.rank.rank)
    .slice(0, count);
  const trails = all
    .filter((p) => p.rank.rank > p.rank.of - third(p))
    .sort((a, b) => depth(b) - depth(a) || b.rank.rank - a.rank.rank)
    .slice(0, count);
  return { leads, trails };
}

const entryOf = (card: readonly ScorecardEntry[], id: string) => card.find((e) => e.category.id === id);

/** A scorecard entry's reading and rank, when it has both. */
function reading(e: ScorecardEntry | undefined): { display: string; rank: Rank } | null {
  if (!e || e.rank === null || (e.cell.kind !== "scored" && e.cell.kind !== "valued")) return null;
  return { display: e.cell.display, rank: e.rank };
}

/**
 * The provider's results on one track in one sentence, for the top of its
 * page: cold start, the fix and test task's time and its cost, each with its
 * rank, from the scorecard below it.
 */
export function verdict(t: ProviderTrack, id: ProviderId): string {
  const name = providerName(id);
  const card = scorecard(t.id, id);
  const cold = reading(entryOf(card, "speed"));
  const task = reading(entryOf(card, "real-tasks"));
  const cost = reading(entryOf(card, "cost"));
  const parts = [
    cold ? `starts a sandbox in ${cold.display} (${rankText(cold.rank)})` : null,
    task ? `finishes the fix and test task in ${task.display} (${rankText(task.rank)})${cost ? ` at ${cost.display} per 1,000 (${rankText(cost.rank)} on cost)` : ""}` : null,
    !task && cost ? `costs ${cost.display} per 1,000 fix and test tasks (${rankText(cost.rank)})` : null,
  ].filter((x) => x !== null);
  if (parts.length === 0) return `${name} has no ranked cold start, real task or cost result on ${machineOf(t.id)} yet.`;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `On ${machineOf(t.id)}, ${name} ${list}.`;
}

/** One sentence of measured facts for the meta description, from the landing track, machine first. */
export function providerSummary(id: ProviderId): string {
  const r = providerResults(id);
  const t = r.tracks[0];
  if (!t) return `${r.name} sandbox results from Sandbox bench.`;
  const cold = headline(t, "cold");
  const tool = headline(t, "tool-replay");
  const card = scorecard(t.id, id);
  const task = reading(entryOf(card, "real-tasks"));
  const cost = reading(entryOf(card, "cost"));
  const parts = [
    cold ? `${cold.median} cold start (${ordinal(cold.rank)} of ${cold.of}${cold.tied ? ", tied" : ""})` : null,
    tool ? `${tool.median} ${tool.label.toLowerCase()}` : null,
    task ? `fix and test task in ${task.display}${cost ? ` for ${cost.display} per 1,000` : ""}` : null,
    !task && t.cost.kind === "priced" ? `${t.cost.perThousand} per 1,000 quick tasks (${t.cost.tag})` : null,
  ].filter((x) => x !== null);
  return `${r.name} sandbox on ${machineOf(t.id)}: ${parts.join(", ")}. Medians, p95s and 95% intervals.`;
}

export interface Faq {
  question: string;
  answer: string;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** "On the same 4 vCPU, 8 GB machine, …" for each track the provider has results on. */
function perTrack(r: ReturnType<typeof providerResults>, say: (t: ProviderTrack) => string): string {
  const said = r.tracks.map((t) => ({ t, text: say(t) }));
  const [first] = said;
  // The same words on both tracks read once.
  if (first && said.length > 1 && said.every((x) => x.text === first.text)) return sentence(`On both the same ${trackInfo["same-spec"].short} machine and its default machine, ${first.text}`);
  return said.map(({ t, text }) => sentence(`On ${machineOf(t.id)}, ${text}`)).join(" ");
}

function coldAnswer(r: ReturnType<typeof providerResults>): string {
  const lead = perTrack(r, (t) => {
    const row = t.groups.flatMap((g) => g.rows).find((x) => x.id === "cold");
    if (!row) return "cold start wasn't measured";
    const s = row.standing;
    return s.kind === "ranked"
      ? `${r.name}'s median cold start is ${s.median} (p95 ${s.p95}), ${ordinal(s.rank)} of ${s.of} providers${s.tiedWith.length ? `, tied with ${s.tiedWith.map(providerName).join(", ")}` : ""}`
      : `there is no cold start result: ${s.why.charAt(0).toLowerCase()}${s.why.slice(1)}`;
  });
  return `${lead} Cold start is the provider's own time, from create() until the first command runs in the new sandbox.`;
}

/** The fix and test cost in words, ranked as the scorecard ranks it, or why it has no rank. */
function taskCostText(t: ProviderTrack, id: ProviderId): string {
  const e = entryOf(scorecard(t.id, id), "cost");
  const row = realTaskCost(t.id, id, "fix-and-test");
  const what = "a fix and test task (an agent fixes a real Vue bug and runs its tests)";
  if (e?.cell.kind === "valued" && e.rank) {
    // Ranked with everyone, but a row on the wrong machine size still can't be the chart's "Cheapest" pick.
    const caveat = row.kind === "ranked" && row.notCounted.length > 0 ? `, though it can't be the cheapest pick (${row.notCounted.join("; ")})` : "";
    return `${what} costs ${e.cell.display} per 1,000 completed, ${ordinal(e.rank.rank)} cheapest of ${e.rank.of}${caveat}`;
  }
  if (row.kind === "ranked") return `${what} costs ${row.value} per 1,000 completed, not counted for the cheapest pick (${e?.cell.kind === "excluded" ? e.cell.why : row.notCounted.join("; ")})`;
  return `there is no fix and test cost (${row.why})`;
}

function costAnswer(id: ProviderId, r: ReturnType<typeof providerResults>): string {
  const lead = perTrack(r, (t) => `${taskCostText(t, id)}${t.cost.kind === "priced" ? `; the quick task (create, 100 tool calls, delete) costs ${t.cost.perThousand} per 1,000 (${t.cost.tag})` : ""}`);
  const billing = r.tracks[0]?.billing;
  return billing ? `${lead} Billing: ${billing}.` : lead;
}

function pauseAnswer(r: ReturnType<typeof providerResults>): string {
  // A note is a sentence that starts with the provider's name, so it keeps its capital.
  return perTrack(r, (t) => (t.pause.supported && "split" in t.pause && t.pause.split ? `yes: ${pauseText(t)}` : pauseText(t)));
}

function hardwareAnswer(r: ReturnType<typeof providerResults>): string {
  const h = r.hardware;
  const machines = perTrack(r, (t) => `it asked for ${t.machine.asked} and measured ${t.machine.measured ?? "nothing it could read"} inside${t.ranIn ? `, in ${t.ranIn}` : ""}`);
  if (!h) return machines;
  const memory = h.memory.type ? `, ${h.memory.type} memory` : "";
  return `${r.name} runs each sandbox as a ${h.runsAs}. CPU: ${h.chip}; ${h.family}${memory}. Hosted on ${h.cloud}, ${h.region}. ${machines}`;
}

function reliabilityAnswer(r: ReturnType<typeof providerResults>): string {
  return perTrack(r, (t) => {
    const rel = t.reliability;
    if (rel.successRate === null || rel.attempts === 0) return "no attempts were recorded";
    const list = t.failures
      .map((f) => `${f.reason.replace(/\.$/, "")} (${f.count} ${f.count === 1 ? "failure" : "failures"})`)
      .join("; ");
    const detail =
      t.failures.length === 0
        ? "with no failures recorded"
        : rel.succeeded === rel.attempts
          ? `with separate errors recorded outside those attempts: ${list}`
          : `with failures recorded: ${list}`;
    return `${formatCount(rel.succeeded)} of ${formatCount(rel.attempts)} attempts succeeded (${formatPercent(rel.successRate, 2)}), ${detail}`;
  });
}

/**
 * Five questions people search about a sandbox provider, each answered from
 * its measured results on every track it has them on. For the page's FAQ and
 * its FAQPage structured data, which must say the same thing.
 */
export function providerFaqs(id: ProviderId): Faq[] {
  const r = providerResults(id);
  if (r.tracks.length === 0) return [];
  const name = r.name;
  return [
    { question: `How fast is ${name}'s cold start?`, answer: coldAnswer(r) },
    { question: `How much does ${name} cost for AI coding tasks?`, answer: costAnswer(id, r) },
    { question: `Does ${name} support pause and resume?`, answer: pauseAnswer(r) },
    { question: `What hardware and isolation does ${name} run on?`, answer: hardwareAnswer(r) },
    { question: `How reliable is ${name}?`, answer: reliabilityAnswer(r) },
  ].map((f) => ({ question: f.question, answer: capitalise(f.answer) }));
}

/** The FAQ as schema.org FAQPage, for a page's JSON-LD graph. */
export const faqJsonLd = (faqs: readonly Faq[]) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
});
