import {
  TASKS_PER_PRICE,
  billingBases,
  billingLabel,
  costBasis,
  costPick,
  costStatus,
  costTag,
  hasLowerBounds,
  isEligible,
  isLowerBound,
  isPriced,
  noPickLabel,
  noPickWhy,
  perTaskLifetimeNote,
  perTaskText,
  perThousandText,
  pickLabel,
  qualify,
  regionNote,
  statusNote,
  taskCostOf,
  wholeMachine,
  wholeMachineLabel,
  wholeMachineText,
} from "@/lib/cost";
import type { NotCounted, PricedTask } from "@/lib/cost";
import { allProviders, hasResults, trackIds, trackInfo, tracks } from "@/lib/data";
import { setAsideLines, setAsideSentence } from "@/lib/exclusions";
import type { Metric, Provider, Track, TrackId } from "@/lib/data";
import { formatPercent, formatValue } from "@/lib/format";
import { chipBasisLabel, fingerprintDate, hardware, probeDate } from "@/lib/hardware";
import { commonPrice, commonSize, eurUsd, usdPrice } from "@/lib/fx";
import { absentNote, allocationNotes, autoStandby, destroyNotes, measuredText, noRealPause, requestedText, snapshotNotes } from "@/lib/notes";
import { pauseOf } from "@/lib/pause";
import { cpuCaveat, isExtraTier, isProviderId, providerBrand, providerName, tierOf } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import {
  billingTag,
  billingText,
  changeText,
  completedText,
  estimatedPartText,
  headlineRows,
  holdTag,
  idleGroups,
  idleLabel,
  idleOutcome,
  multipleNote,
  multipleText,
  resumeFailed,
  isCounterfactual,
  laterLine,
  runsLine,
  noCostReason,
  perThousand,
  pickLabels,
  pilotLine,
  profileFootprint,
  profileIds,
  profileInfo,
  profileWhat,
  runTrackOf,
  scopeLine,
  isCounted,
  notCountedWhy,
  taskPick,
  uncertifiedWhy,
  wallText,
  wilson,
} from "@/lib/realistic";
import type { CostKind, Costed, ProfileId, RealisticRow } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { regionFor } from "@/lib/plan-minimum";
import { advertised, sharedDisk, sizeOf } from "@/lib/sizes";
import { successRate } from "@/lib/status";
import { bestFirst, hasExpanded } from "@/lib/expanded";
import type { Expanded } from "@/lib/expanded";
import { expanded } from "@/lib/expanded-data";
import { burstValue, highestFirst, survivalRanked, sustainedValue } from "@/lib/stress";
import type { StressData } from "@/lib/stress";
import { hasSustainedCpu, retentionText, steadyText, sustainedRanked } from "@/lib/sustained-cpu";
import type { SustainedCpuData } from "@/lib/sustained-cpu";
import { sustainedCpu } from "@/lib/sustained-cpu-data";

/** The metrics agents get, in page order, grouped as on the page. */
export const groups = [
  { title: "Start-up", ids: ["cold"] },
  { title: "Tool calls and agent steps", ids: ["tool-replay", "npm-install", "pip-install", "git-clone", "dev-server", "preview-first-byte", "edit-loop"] },
  { title: "Everyday calls", ids: ["command", "files-1kb", "files-10mb", "reconnect", "destroy"] },
  { title: "Pause and snapshots", ids: ["pause-resume", "snapshot", "create-from-snapshot"] },
  { title: "Bursts", ids: ["burst-10", "burst-25"] },
  { title: "Machine speed", ids: ["cpu-single", "cpu-all", "memory", "disk-write", "disk-read", "iops-write", "iops-read"] },
] as const;

const round = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
const roundCost = (v: number | null) => (v === null ? null : Number(v.toPrecision(4)));

// Tests with no published result for a provider, with the reason, per track. Shown only where the
// data has no result; the page's footnotes use the same map. Results from runs we stopped early are
// left out rather than shown partly, and none of their failures count against the provider.
const superserveJoins = "not-run: Superserve joins the 4 vCPU track in this release; its results here come in the next update";
const modalNoPause = "unsupported: Modal sandboxes can't stop and run again, so Modal has no pause and resume";
const beamNoPause = "unsupported: Beam sandboxes have no pause and resume (Beam's persistent VMs do; they are a different product and weren't tested)";
const beamNoSnapshotDelete = "not-run: Beam sandboxes take memory snapshots, but Beam has no way to delete one, and our runs delete everything they make";
const beamBurstQuota = (n: number) => `not-run: our Beam account's quota is 30 vCPU, and ${n} sandboxes at 4 vCPU need ${n * 4}`;
const beamNoPage = "not-run: blocked on every run: on Beam's default 1 CPU and 128 MiB the dev server ran out of memory or its preview never answered, so there was no page to edit";
type NotRun = Record<TrackId, Partial<Record<string, Partial<Record<ProviderId, string>>>>>;
const handNotRun: NotRun = {
  default: {
    "pause-resume": { "upstash-ephemeral": "unsupported: Upstash Ephemeral Box has no pause and resume", modal: modalNoPause, beam: beamNoPause },
    snapshot: { beam: beamNoSnapshotDelete },
    "create-from-snapshot": { beam: beamNoSnapshotDelete },
    "edit-loop": { beam: beamNoPage },
  },
  "same-spec": {
    "pause-resume": { "upstash-ephemeral": "unsupported: Upstash Ephemeral Box has no pause and resume", modal: modalNoPause, beam: beamNoPause },
    snapshot: { superserve: superserveJoins, beam: beamNoSnapshotDelete },
    "create-from-snapshot": { superserve: superserveJoins, beam: beamNoSnapshotDelete },
    "burst-10": {
      superserve: superserveJoins,
      beam: beamBurstQuota(10),
    },
    "burst-25": {
      superserve: superserveJoins,
      beam: beamBurstQuota(25),
    },
  },
};

/** The harness scenarios a metric id differs from (bench/src/attempts.ts mainTests). */
const metricOfScenario: Readonly<Record<string, string>> = { "tcp-ms": "tcp" };
const notAvailable = /^Not available yet: /;

/**
 * Tests the attempt policy recorded as not run because the provider doesn't
 * offer them yet (reason "Not available yet: …", such as Baseten's snapshots),
 * as "not-available: …" statuses, so they read as missing features, never as
 * failures. Other policy reasons are left to the hand-written map.
 */
function unavailable(id: TrackId): NotRun[TrackId] {
  const out: NotRun[TrackId] = {};
  for (const [pid, ex] of Object.entries(tracks[id].exclusions)) {
    if (!isProviderId(pid)) continue;
    for (const n of ex?.notRun ?? []) {
      if (!notAvailable.test(n.reason)) continue;
      const m = metricOfScenario[n.scenario] ?? n.scenario;
      out[m] = { ...out[m], [pid]: `not-available: ${n.reason.replace(notAvailable, "")}` };
    }
  }
  return out;
}

/** The hand-written reasons above plus the ones each track's data works out from its runs; the data wins for a provider it names. */
function withData(id: TrackId): NotRun[TrackId] {
  const fromData = tracks[id].missing;
  const policy = unavailable(id);
  const out: NotRun[TrackId] = {};
  for (const m of new Set([...Object.keys(handNotRun[id]), ...Object.keys(policy), ...Object.keys(fromData)])) {
    const row: Partial<Record<ProviderId, string>> = { ...handNotRun[id][m], ...policy[m] };
    for (const [pid, why] of Object.entries(fromData[m] ?? {})) if (isProviderId(pid)) row[pid] = why;
    out[m] = row;
  }
  return out;
}
export const notRun: NotRun = { default: withData("default"), "same-spec": withData("same-spec") };

/** A notRun reason as chart text: "not run: …", or the reason alone for a stopped run. */
export const notRunText = (why: string) => why.replace(/^not-run: /, "not run: ").replace(/^not-available: /, "not available yet: ").replace(/^stopped-early: /, "");

/**
 * Results we measured but leave out of rankings, with the reason, keyed by
 * the harness run they apply to so a rerun that fixed the cause is never
 * excluded by mistake. The page uses the same map.
 */
const exclusionsByRun: Record<string, Partial<Record<string, Partial<Record<ProviderId, string>>>>> = {
  "publication-final-v3": {
    "files-10mb": {
      boxd: "boxd's download cut large files short, so our SDK read them in 1 MB pieces and the time measures that workaround",
    },
  },
};

export const excludedFor = (track: Track) => exclusionsByRun[track.generatedFrom] ?? {};

/** Why a result is blank, so an agent never has to guess. */
function statusOf(track: Track, id: string, provider: ProviderId, v: Metric["values"][number] | undefined) {
  const skipped = notRun[track.id][id]?.[provider];
  if (skipped && (!v || v.n === 0)) return skipped;
  if (track.metric(id).values.length === 0) return "coming-next-update: not collected in this release";
  const left = excludedFor(track)[id]?.[provider];
  if (left) return `excluded: ${left}`;
  if (id === "pause-resume" && noRealPause[provider]) return `unsupported: ${noRealPause[provider]}`;
  if (id === "pause-resume" && autoStandby[provider]) return standbyStatus(track, provider);
  if (!v) return "unsupported";
  if (v.n > 0) return "measured";
  if (v.ourFailures > 0 && v.failures === 0) return "not-measured: our harness could not run this test on this provider";
  if (v.failures > 0 && v.limitFailures === v.failures) return "not-run: our account or plan limit";
  if (v.failures > 0) return "all-failed";
  return "unsupported";
}

/**
 * The pause + resume status of a provider that pauses by itself: never a
 * measured total, since there is no pause to add, but its resume after
 * standby where the data has one.
 */
function standbyStatus(track: Track, id: ProviderId) {
  const p = track.providers.find((x) => x.id === id);
  const r = p ? pauseOf(track, p) : null;
  const resume = r?.kind === "standby" ? ` Only its resume is timed, so it isn't ranked as a pause + resume total: the first command after standby took ${formatValue(r.resume, "s")} (median of ${r.n}, after ${formatValue(r.idleS, "s")} with no requests).` : " No resume after standby was measured in this track.";
  return `standby: ${autoStandby[id] ?? ""}${resume}`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The pause field of a provider in the agent files. */
function pauseData(track: Track, p: Provider) {
  const restart = noRealPause[p.id];
  if (restart) return { supported: false, note: restart };
  const r = pauseOf(track, p);
  const note = (s: string) => capitalise(s.replace(/^standby: /, ""));
  if (r.kind === "standby") return { supported: true, note: note(standbyStatus(track, p.id)), standby: { resumeAfterStandby: round(r.resume), idleSeconds: r.idleS, n: r.n } };
  if (autoStandby[p.id]) return { supported: true, note: note(standbyStatus(track, p.id)), standby: null };
  return { supported: p.pauseSplit !== null || track.metric("pause-resume").values.some((v) => v.provider === p.id && v.p50 !== null), split: p.pauseSplit };
}

const results = (track: Track, m: Metric) =>
  track.providers
    .map((p) => {
      const v = m.values.find((x) => x.provider === p.id);
      const status = statusOf(track, m.id, p.id, v);
      const shown = status === "measured";
      return {
        provider: p.id,
        median: shown ? round(v?.p50 ?? null) : null,
        p95: shown ? round(v?.p95 ?? null) : null,
        ci95: shown && v && v.ciLow !== null && v.ciHigh !== null ? [round(v.ciLow), round(v.ciHigh)] : null,
        attempts: v ? v.n + v.failures : 0,
        failed: v?.failures ?? 0,
        status,
        equalSpec: p.equalSpec,
      };
    })
    .sort((a, b) => {
      // Ranked results first, best first; anything unranked (blank or excluded) after.
      const ra = a.status === "measured" && a.median !== null;
      const rb = b.status === "measured" && b.median !== null;
      if (ra !== rb) return ra ? -1 : 1;
      return a.median === null || b.median === null ? 0 : (m.better === "lower" ? 1 : -1) * (a.median - b.median);
    });

/** One row of quick picks. `note` carries what a pick needs said beside it, such as the eligible set for cost. */
export interface QuickPick {
  need: string;
  pick: string;
  runnerUp: string;
  note: string | null;
}

/** "boxd $0.000128 per task, $0.13 per 1,000 (metered, provisional)"; a lower bound reads "at least …". */
const costCell = (t: PricedTask) => `${providerName(t.id)} ${perTaskText(t.cost)} per task, ${perThousandText(t.cost)} per 1,000 (${costTag(t.id, t.cost, t.status)})`;

/** Whether any track shows a lower bound. Lower-bound fields and notes appear only then, so data without one publishes as before. */
const anyLowerBound = () => hasLowerBounds(trackIds.map((id) => tracks[id]));

/** `{ bound: "lower" }` on a lower-bound amount, nothing otherwise. */
const lowerBoundField = (lower: boolean) => (lower ? { bound: "lower" as const } : {});

const nameList = (ids: readonly ProviderId[]) => ids.map(providerName).join(", ");

/** The cost row of the quick picks: the cheapest billed or metered exact cost. */
function costPickRow(track: Track): QuickPick {
  const c = costPick(track);
  switch (c.kind) {
    case "picked":
      return {
        need: `Quick task: ${pickLabel.toLowerCase()}`,
        pick: costCell(c.pick),
        runnerUp: c.runnerUp ? costCell(c.runnerUp) : "n/a",
        note: c.lower.length ? `Not counted: ${c.lower.map((t) => `${costCell(t)} (${t.why.join("; ")})`).join("; ")}.` : null,
      };
    case "none":
      return {
        need: `Quick task: ${noPickLabel.toLowerCase()}`,
        pick: noPickWhy(c).replace(/^\w/, (ch) => ch.toUpperCase()),
        runnerUp: "n/a",
        note: c.lower.length ? `Not counted: ${c.lower.map((t) => `${costCell(t)} (${t.why.join("; ")})`).join("; ")}.` : null,
      };
    case "empty":
      return { need: `Quick task: ${pickLabel.toLowerCase()}`, pick: "n/a", runnerUp: "n/a", note: null };
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** The cost pick as data for agents: the cheapest billed or metered exact cost, the runner-up, and any cheaper cost that can't count, with why. */
function costPickData(track: Track) {
  const row = (t: PricedTask) => ({ provider: t.id, perTaskUsd: roundCost(t.cost.usd), per1000TasksUsd: roundCost(t.cost.usd * TASKS_PER_PRICE), ...lowerBoundField(isLowerBound(t.cost)), kind: t.cost.kind });
  const lowerRow = (t: NotCounted) => ({ ...row(t), whyNotCounted: t.why });
  const c = costPick(track);
  switch (c.kind) {
    case "picked":
      return { label: pickLabel, pick: row(c.pick), runnerUp: c.runnerUp ? row(c.runnerUp) : null, lowerNotCounted: c.lower.map(lowerRow) };
    case "none":
      return { label: noPickLabel, why: noPickWhy(c), pick: null, runnerUp: null, lowerNotCounted: c.lower.map(lowerRow) };
    case "empty":
      return { label: noPickLabel, pick: null, runnerUp: null, lowerNotCounted: [] };
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** Who wins each common question in one track, straight from the data. */
export function quickPicks(track: Track): QuickPick[] {
  const name = (id: ProviderId) => providerName(id);
  // Format from the raw medians, not the rounded export, so picks match the page exactly.
  const timed = (id: string, label: string): QuickPick => {
    const m = track.metric(id);
    // Providers are ranked on their first CPU tier.
    const ranked = new Set(results(track, m).filter((r) => r.status === "measured" && r.median !== null && !isExtraTier(r.provider)).map((r) => r.provider));
    const [a, b] = m.values
      .filter((v) => ranked.has(v.provider) && v.p50 !== null)
      .sort((x, y) => (m.better === "lower" ? 1 : -1) * ((x.p50 ?? 0) - (y.p50 ?? 0)));
    const cell = (v: typeof a) => (v ? `${name(v.provider)} ${formatValue(v.p50 ?? 0, m.unit)}` : "n/a");
    return { need: label, pick: cell(a), runnerUp: cell(b), note: null };
  };
  const reliable = track.providers.filter((p) => !isExtraTier(p.id)).map((p) => ({ p, rate: successRate(track, p).rate ?? 0 })).sort((a, b) => b.rate - a.rate);
  const top = reliable.filter((x) => x.rate === reliable[0]?.rate);
  const rest = reliable.slice(top.length);
  const picks = [
    timed("cold", "Fastest cold start"),
    timed("tool-replay", "Fastest agent work (tool replay)"),
    timed("burst-25", "Fastest 25-sandbox fan-out"),
    timed("reconnect", "Fastest reconnect"),
    costPickRow(track),
    {
      need: "Most reliable",
      // Several providers can share the top rate; name every one of them.
      pick: top.length ? `${top.map((x) => name(x.p.id)).join(", ")} ${formatPercent(top[0]?.rate ?? 0, 2)}${top.length > 1 ? " (tied)" : ""}` : "n/a",
      runnerUp: rest[0] ? `${name(rest[0].p.id)} ${formatPercent(rest[0].rate, 2)}` : "n/a",
      note: null,
    },
  ];
  // Picks with no data in this release (bursts, cost per task) are left out rather than shown as n/a.
  return picks.filter((q) => q.pick !== "n/a");
}

// ---------------------------------------------------------------------------
// What a task costs: the realistic workloads (pilot), in every export.

const realisticAbout =
  "Real work instead of the quick task, each in a fresh sandbox from the create request to confirmed deletion, setup included. Fix and test applies a real Vue bug, runs the type checker and Vue's test suite, applies the fix and runs them again. Build is a production build of the Jitsi Meet web app. Each runs on the same-machine track (4 vCPU, 8 GB) and on each provider's default machine. An idle test leaves the sandbox open after fix and test.";

const realisticHowToRead =
  "Cost per completed task is the cost of every attempt, failed ones included, divided by the tasks that completed. Its kind is billed (the provider's charge), metered (the provider's usage meter at its rates) or estimate (our measured time at list price), and `billingStatus` says how far the cost was checked against the provider's bill (verified, unreconciled, provisional, unsettled, estimate); it is billing evidence only and doesn't affect the pick. `counted` and `whyNotCounted` say whether a row could be the pick. The pick is the cheapest billed or metered row with at most 1 incomplete run and, on the same-machine track, exactly 4 vCPU and 8 GB; a list-price estimate is shown but never picked, and billing status doesn't affect the pick. `billing` is the same evidence-backed billing model as the rest of this file; whole machine at list price is a counterfactual for providers that bill usage. Each workload and track has its own pick, and this pilot names no certified winner.";

const usd6 = (v: number | null) => (v === null ? null : Number(v.toPrecision(6)));

function realisticRowData(row: RealisticRow, track: TrackId) {
  const billing = billingText(row.provider);
  const ci = wilson(row.completed, row.attempts);
  return {
    provider: row.provider,
    name: providerName(row.provider),
    attempts: row.attempts,
    completed: row.completed,
    incomplete: row.incomplete,
    notRun: row.notRun,
    completedText: completedText(row),
    completedWilson95: { low: round(ci.low), high: round(ci.high) },
    medianWallS: round(row.medianWallS),
    medianCpuS: round(row.medianCpuS),
    costPerCompletedUsd: usd6(row.cost?.usdPerCompleted ?? null),
    per1000CompletedUsd: usd6(row.cost ? row.cost.usdPerCompleted * TASKS_PER_PRICE : null),
    kind: row.cost?.kind ?? null,
    counted: row.cost !== null && isCounted(row),
    whyNotCounted: notCountedWhy(row),
    // Billing evidence only; the pick doesn't read it.
    billingStatus: row.cost ? billingTag(row) : null,
    noCost: row.cost ? null : noCostReason(row),
    wholeMachinePer1000Usd: usd6(row.cost?.wholeMachineUsdPerCompleted === null || row.cost === null ? null : row.cost.wholeMachineUsdPerCompleted * TASKS_PER_PRICE),
    // "lower": the whole-machine figure is a lower bound (Modal's default track prices only its request); read it as at least that.
    wholeMachineBound: row.cost?.wholeMachineBound ?? null,
    wholeMachineCounterfactual: isCounterfactual(row.provider),
    billing,
    ...(row.costNote ? { costNote: row.costNote } : {}),
    ...estimatedPartData(row.cost?.kind ?? null, row.estimatedPart, row.cost?.usdPerCompleted ?? null, "per1000CompletedUsd"),
    ...regionData(row.provider, track),
  };
}

/** A pinned region's price multiplier, said as the quick-task exports say it (regionNote); nothing where none applies. */
function regionData(id: ProviderId, track: TrackId) {
  const r = regionFor(id, track);
  return r ? { regionNote: r.long } : {};
}

/** The part of a cost we added at list price, per 1,000, with what it is; nothing when none was added. */
function estimatedPartData(kind: CostKind | null, part: RealisticRow["estimatedPart"], total: number | null, key: "per1000CompletedUsd" | "medianPer1000Usd") {
  const note = kind ? estimatedPartText(kind, part, total, "per 1,000") : null;
  return part && note ? { estimatedPart: { [key]: usd6(part.usd * TASKS_PER_PRICE), shareOfTotal: total ? Number((part.usd / total).toPrecision(6)) : null, what: part.labels, note } } : {};
}

/** A provider's pricing note without its monthly-minimum clause ("$20 monthly minimum/packs excluded; "): per-task costs are usage, and the site says nothing about plans. */
const withoutPlanMinimum = (note: string | null) => note
    ?.replace(/\s*\$\d+(?:\.\d+)? monthly minimum[^;.]*[;.]/g, "")
    .replace(/\.\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)
    .trim() ?? null;

const pickRow = (r: Costed) => ({
  provider: r.provider,
  per1000CompletedUsd: usd6(r.cost.usdPerCompleted * TASKS_PER_PRICE),
  kind: r.cost.kind,
  whyNotCounted: notCountedWhy(r),
});

function realisticPickData(costed: readonly Costed[]) {
  const p = taskPick(costed);
  const uncertified = { certified: false, certification: `${pickLabels.uncertified}: ${uncertifiedWhy(realistic)}.` };
  switch (p.kind) {
    case "picked":
      return { label: p.label, ...uncertified, pick: pickRow(p.pick), counted: p.counted, lowerNotCounted: p.lower.map(pickRow) };
    case "none":
      return { label: p.label, ...uncertified, pick: null, counted: [], lowerNotCounted: p.lower.map(pickRow) };
    case "empty":
      return { label: pickLabels.none, ...uncertified, pick: null, counted: [], lowerNotCounted: [] };
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

function realisticProfile(id: TrackId, profile: ProfileId) {
  const { costed, uncosted } = headlineRows(realistic, runTrackOf[id], profile);
  return {
    pick: realisticPickData(costed),
    providers: [...costed, ...uncosted].map((row) => realisticRowData(row, id)),
  };
}

/** The realistic workloads as plain data: definitions, the pilot label, per track and workload the pick and every provider, and the idle test. */
export function realisticData() {
  return {
    title: "What a task costs",
    pilot: pilotLine(realistic),
    runsPerProvider: realistic.coverage.headline.attempts,
    comingLater: laterLine,
    runDates: runsLine,
    about: realisticAbout,
    costScope: scopeLine(realistic),
    howToRead: realisticHowToRead,
    source: { generatedAt: realistic.generatedAt, runs: realistic.sources.map((s) => ({ name: s.name, generatedAt: s.generatedAt, providers: s.providers })), eurToUsd: realistic.fx },
    workloads: profileIds.map((profile) => {
      const w = realistic.workloads?.[profile] ?? null;
      return { id: profile, label: profileInfo[profile].label, what: profileWhat(profile, w), footprint: profileFootprint(profile, w), repo: w?.repo ?? null, commit: w?.commit ?? null };
    }),
    tracks: Object.fromEntries(trackIds.map((id) => [id, { label: trackInfo[id].label, workloads: Object.fromEntries(profileIds.map((profile) => [profile, realisticProfile(id, profile)])) }])),
    idle: {
      what: `Fix and test, then the sandbox left open for 0, 10 or 60 minutes on each provider's default settings, then a resume step (git status and the tests). Same-machine track only, ${realistic.coverage.idle.attempts} runs per provider and wait. medianCostUsd is the median total cost of one run, fix, wait and resume, failed runs included. vsNoWait: ${multipleNote} Providers are listed with those whose sandbox stopped or couldn't resume last.`,
      notTested: realistic.coverage.idle.notTested.map((n) => ({ provider: n.provider, name: providerName(n.provider), reason: n.reason, short: n.short })),
      providers: idleGroups(realistic).map((g) => ({
        provider: g.provider,
        name: providerName(g.provider),
        outcome: idleOutcome(g),
        ...regionData(g.provider, "same-spec"),
        waits: g.points.map((p) => ({
          minutes: p.minutes,
          runs: p.runs,
          completed: p.completed,
          medianCostUsd: usd6(p.medianCostUsd),
          per1000Usd: usd6(p.medianCostUsd === null ? null : p.medianCostUsd * TASKS_PER_PRICE),
          kind: p.costKind,
          status: holdTag(p),
          changeVsNoWait: changeText(p),
          vsNoWait: multipleText(p),
          ...(resumeFailed(p) ? { resumeFailed: true, note: "No run resumed, so this figure is what the failed runs cost, not a price for leaving work open." } : {}),
          medianWakeMs: p.medianWakeMs,
          stateChanges: p.transitions,
          stoppedWhileIdle: p.stopped,
          ...estimatedPartData(p.costKind, p.estimatedPart, p.medianCostUsd, "medianPer1000Usd"),
        })),
      })),
    },
  };
}

const pickLine = (track: TrackId, profile: ProfileId) => {
  const p = realisticProfile(track, profile).pick;
  const lower = p.lowerNotCounted.map((r) => `${providerName(r.provider)} ${perThousand(r.per1000CompletedUsd === null ? 0 : r.per1000CompletedUsd / TASKS_PER_PRICE)} (${r.whyNotCounted.join("; ")})`).join("; ");
  const head = p.pick ? `${p.label}: ${providerName(p.pick.provider)} ${perThousand((p.pick.per1000CompletedUsd ?? 0) / TASKS_PER_PRICE)} per 1,000.` : `${p.label}: no provider meets the pick rule.`;
  return `${head} ${p.certification}${lower ? ` Not counted: ${lower}.` : ""}`;
};

function realisticMarkdown() {
  const d = realisticData();
  const lines = ["# What a task costs (realistic workloads)", "", d.pilot, d.comingLater, "", d.about, "", d.costScope, "", d.howToRead, ""];
  for (const id of trackIds) {
    for (const profile of profileIds) {
      const w = d.workloads.find((x) => x.id === profile);
      const t = realisticProfile(id, profile);
      lines.push(
        `## ${profileInfo[profile].label}, ${trackInfo[id].tab}`,
        "",
        `${w?.what ?? ""}.${w?.footprint ? ` ${w.footprint}.` : ""}`,
        "",
        pickLine(id, profile),
        "",
        "| Provider | Per 1,000 completed | Kind and status | Completed | Median time | Billing model | Whole machine at list price, per 1,000 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...t.providers.map(
          (r) =>
            `| ${r.name} | ${r.per1000CompletedUsd === null ? "n/a" : perThousand(r.per1000CompletedUsd / TASKS_PER_PRICE)} | ${r.billingStatus ?? `n/a: ${r.noCost ?? ""}`}${r.whyNotCounted.length ? ` (not counted: ${r.whyNotCounted.join("; ")})` : ""} | ${r.notRun === r.attempts ? "not run" : r.completedText} | ${r.medianWallS === null ? "n/a" : wallText(r.medianWallS)} | ${r.billing} | ${r.wholeMachinePer1000Usd === null ? "n/a" : `${qualify({ amount: perThousand(r.wholeMachinePer1000Usd / TASKS_PER_PRICE), bound: r.wholeMachineBound, style: "tight" })}${r.wholeMachineCounterfactual ? " (counterfactual)" : ""}`} |`,
        ),
        "",
        ...t.providers.flatMap((r) => [
          ...("estimatedPart" in r && r.estimatedPart ? [`${r.name}: ${r.estimatedPart.note}`] : []),
          ...("regionNote" in r && r.regionNote ? [`${r.name} is ${r.regionNote}.`] : []),
          ...(r.wholeMachineBound === "lower" ? [`${r.name}'s whole machine at list price is a lower bound (≥): it prices only the resources requested, and ${r.name} also bills use above them.`] : []),
        ]),
        "",
      );
    }
  }
  lines.push("## Leaving the sandbox open (same machine, fix and test)", "", d.idle.what, "", "| Provider | Wait | Completed | Median cost, per 1,000 | Kind and status | vs no wait | Median wake | State change while idle |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const g of d.idle.providers)
    for (const p of g.waits)
      lines.push(`| ${g.name} | ${idleLabel(p)} | ${p.completed} of ${p.runs} | ${p.per1000Usd === null ? "n/a" : perThousand(p.per1000Usd / TASKS_PER_PRICE)} | ${p.status} | ${p.vsNoWait ?? "n/a"}${"resumeFailed" in p ? " (resume failed)" : ""} | ${p.medianWakeMs === null ? "n/a" : `${p.medianWakeMs} ms`} | ${p.stateChanges.length ? p.stateChanges.join(", ") : "none seen"} |`);
  lines.push(
    "",
    ...d.idle.providers.flatMap((g) => (g.outcome ? [`${g.name}: ${g.outcome}.`, ""] : [])),
    ...d.idle.providers.flatMap((g) => g.waits.flatMap((w) => ("estimatedPart" in w && w.estimatedPart ? [`${g.name}, ${idleLabel(w)}: ${w.estimatedPart.note.replace("per 1,000", "per 1,000 (median)")}`, ""] : []))),
    ...d.idle.notTested.flatMap((n) => [`Not in the idle test: ${n.name}, because ${n.reason}.`, ""]),
  );
  return lines;
}

function realisticLlms() {
  const d = realisticData();
  const picks = trackIds.flatMap((id) => profileIds.map((profile) => `- ${profileInfo[profile].label}, ${trackInfo[id].tab}: ${pickLine(id, profile)}`));
  const idle = d.idle.providers.flatMap((g) => (g.outcome ? [`${g.name}: ${g.outcome}`] : []));
  return `## What a task costs (realistic workloads)

${d.pilot} ${d.comingLater}

${d.about} Full numbers: \`whatATaskCosts\` in /results.json and the "What a task costs" section of /results.md.

${picks.join("\n")}

${d.costScope}

${[...new Set(d.tracks["same-spec"]?.workloads["fix-and-test"].providers.flatMap((p) => ("estimatedPart" in p && p.estimatedPart ? [`${p.name}'s costs include an estimated part: ${p.estimatedPart.note}`] : [])) ?? [])].join(" ")}

Idle test (same machine, fix and test, then 10 or 60 minutes open, ${realistic.coverage.idle.attempts} runs per provider and wait): ${idle.length ? `${idle.join("; ")}.` : "no provider stopped the sandbox."} Not tested: ${d.idle.notTested.map((n) => `${n.name} (${n.reason})`).join("; ") || "none"}.

`;
}

const allocationOf = (p: Track["providers"][number]) => ({
  requested: { ...p.requestedAllocation, text: requestedText(p) },
  // A shared file system reports the host's disk, not the sandbox's: no size, and why.
  measured: p.measuredAllocations.map((a) => ({ cpu: a.cpu, memoryGiB: round(a.memoryGiB), diskGiB: sharedDisk[p.id] ? null : round(a.diskGiB) })),
  ...(sharedDisk[p.id] ? { diskNote: sharedDisk[p.id] } : {}),
  measuredText: measuredText(p),
  equalSpec: p.equalSpec,
  verified: p.allocationVerification.verified,
  mismatches: p.allocationVerification.mismatches,
  pricedAt: p.pricingAllocation,
});

/** The hardware probe's findings, with how sure each one is, or null where the probe hasn't run. */
function hardwareOf(id: ProviderId) {
  const h = hardware[id];
  if (h === undefined) return null;
  return {
    chip: h.chip,
    family: h.family,
    chipBasis: chipBasisLabel[h.chipBasis],
    memory: h.memory.kind === "known" ? { type: h.memory.type, basis: h.memory.basis, detail: h.memory.detail } : { type: null, note: h.memory.why },
    cloud: h.cloud,
    region: h.region,
    runsAs: `${h.runsAs}, ${h.runsAsDetail}`,
    hidden: h.hidden,
    probed: fingerprintDate(id) === null ? probeDate : `${fingerprintDate(id)}, from the benchmark's fingerprints`,
  };
}

function costOf(track: Track, id: ProviderId) {
  const c = taskCostOf(track, id);
  if (!c) return { kind: "none", perTaskUsd: null, note: "no cost data" };
  switch (c.kind) {
    case "billed":
    case "metered":
    case "estimate": {
      const s = costStatus(id, c);
      return {
        kind: c.kind,
        perTaskUsd: roundCost(c.usd),
        per1000TasksUsd: roundCost(c.usd * TASKS_PER_PRICE),
        ...lowerBoundField(isLowerBound(c)),
        confidence: c.confidence,
        tasks: c.n,
        source: c.source,
        basis: costBasis(c),
        settled: c.settled,
        // Billing evidence only; the cost pick doesn't read it.
        billingStatus: s.kind,
        billingVerified: isEligible(s),
        statusNote: statusNote(s),
        tag: costTag(id, c, s),
      };
    }
    case "none":
      return { kind: c.kind, perTaskUsd: null, note: c.why };
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** What a provider bills on, with the evidence for it. */
function billingOf(p: Provider) {
  const b = billingBases[p.id];
  return { basis: b.kind, label: billingLabel(b), evidence: b.evidence };
}

/** The allocation's hourly list price: a counterfactual for providers that bill usage. No per-task figure until the harness exports lifetimes. */
function wholeMachineOf(p: Provider) {
  const w = wholeMachine(p);
  return w.kind === "none"
    ? { perHourUsd: null, perTaskUsd: null, counterfactual: billingBases[p.id].kind === "usage", text: w.why, note: perTaskLifetimeNote }
    : { perHourUsd: round(w.usdPerHour), ...lowerBoundField(isLowerBound(w)), perTaskUsd: null, allocation: { cpu: w.cpu, memoryGiB: round(w.memoryGiB) }, counterfactual: w.counterfactual, text: wholeMachineText(w), note: perTaskLifetimeNote };
}

/** Where a provider's prices carry a region multiplier: the region, the multiplier and the note. Nothing otherwise. */
function regionOf(p: Provider) {
  const note = regionNote(p);
  return note ? { region: p.pricingRegion, regionMultiplier: p.regionMultiplier, regionNote: note } : {};
}

const stressAbout =
  "Stress suites, higher is better throughout. cpuSustained: CPU work held for a fixed time, single core (one worker) and all cores (several workers started together, rates added up); median operations per second per run, with consistency (slowest segment over median segment, 1 is even) and trend (last quarter over first, below 1 the sandbox slowed). cpuBurst: K sandboxes started at once running the same CPU work; perSandbox is per-sandbox throughput from cohorts whose sandboxes all finished and provably ran together, maxOverMin the fastest over the slowest sandbox. burstSurvival: K sandboxes started at once and held for windowS seconds with a heartbeat every heartbeatS seconds; survivalRate is survived over members the provider had a fair chance with (account-limit refusals, our network errors, interrupted windows and invalid evidence left out). Only failures the provider caused count against it. Providers are listed best first.";

/** The stress suites of one track as plain data, best first. */
function stressData(s: StressData) {
  return {
    about: stressAbout,
    observations: s.observations,
    runs: s.runs,
    selectionRemoved: s.selectionRemoved,
    cpuSustained: [...s.cpuSustained.rows]
      .sort((a, b) => (b.single.p50 ?? -1) - (a.single.p50 ?? -1))
      .map((r) => ({ name: providerName(r.provider), ...r })),
    cpuBurst: s.cpuBurst.map((g) => ({ k: g.k, providers: [...g.rows].sort((a, b) => (burstValue(b) ?? -1) - (burstValue(a) ?? -1)).map((r) => ({ name: providerName(r.provider), ...r })) })),
    burstSurvival: s.burstSurvival.map((g) => ({
      k: g.k,
      providers: [...survivalRanked(g.rows).map((x) => x.row), ...g.rows.filter((r) => r.survivalRate === null)].map((r) => ({ name: providerName(r.provider), ...r })),
    })),
  };
}

const expandedAbout =
  "Expanded benchmarks: real work inside each sandbox from a fresh random seed per run, with the output checked against the seed before the result counts, so cached or hardcoded answers fail. median, min and max are over a provider's verified runs (n), in `unit`; `better` says which direction wins; values are sorted best first. Not split by track.";

/** The expanded benchmarks as plain data, by category, best first. */
function expandedData(e: Expanded) {
  return {
    about: expandedAbout,
    scenarioCount: e.scenarioCount,
    generatedAt: e.generatedAt,
    runId: e.runId,
    runsPerProvider: e.runs,
    categories: e.groups.map((g) => ({
      id: g.category,
      label: g.label,
      tests: g.metrics.map((m) => ({ ...m, values: bestFirst(m.values, m.better).map((v) => ({ name: providerName(v.provider), ...v })) })),
    })),
  };
}

/** A row's CPU tier as plain data, or null for a provider that sells one tier. */
function tierFacts(id: ProviderId) {
  const t = tierOf(id);
  if (!t) return null;
  return { name: t.name, cpu: t.cpu, preemptible: t.preemptible, ratesUsd: t.rates, firstTier: !isExtraTier(id), promise: t.promise };
}

/** One track as plain data. */
function trackData(track: Track) {
  const notes = allocationNotes(track);
  return {
    id: track.id,
    label: trackInfo[track.id].label,
    description: trackInfo[track.id].description,
    published: hasResults(track),
    run: { source: track.generatedFrom, start: track.window.start, end: track.window.end, runs: track.runs.map((r) => r.id), observations: track.timedOperations },
    absent: track.absent.map((id) => ({ provider: id, reason: absentNote(track, id) })),
    // Per provider, the harness's record of main-suite runs left out or rerun: samples removed by reason,
    // superseded iterations with the rerun that replaced them and why, and scenarios not run.
    exclusions: track.exclusions,
    providers: track.providers.map((p) => {
      const rel = successRate(track, p);
      return {
        id: p.id,
        name: providerName(p.id),
        // The company, and for a provider that sells more than one CPU tier, which one this row ran on.
        provider: providerBrand(p.id),
        cpuTier: tierFacts(p.id),
        cpuCaveat: cpuCaveat(p.id),
        allocation: allocationOf(p),
        allocationNote: notes[p.id] ?? (track.id === "default" ? advertised[p.id].note : null),
        advertisedDefault: track.id === "default" ? { ...sizeOf(p), source: advertised[p.id].source } : null,
        ranIn: p.hardware?.location[0]?.value ?? null,
        cpu: p.hardware?.cpuModels[0]?.value ?? null,
        hardware: hardwareOf(p.id),
        costPerTask: costOf(track, p.id),
        billing: billingOf(p),
        wholeMachineAtListPrice: wholeMachineOf(p),
        price: {
          currency: p.currency,
          perHour: round(p.hourly),
          perVcpuHour: round(p.perVcpuHour),
          perHourUsd: round(usdPrice(p, "hourly")?.usd ?? null),
          ...lowerBoundField(p.hourly !== null && p.pricingBound === "lower"),
          commonSizeUsd: round(commonPrice(p)?.usd ?? null),
          ...regionOf(p),
          note: withoutPlanMinimum(p.pricingNotes),
          usdNote: p.currency === "EUR" ? `Converted at the ECB rate of ${eurUsd.rate} USD per EUR on ${eurUsd.date}.` : null,
          source: p.pricingSource,
        },
        pause: pauseData(track, p),
        reliability: { attempts: rel.attempts, succeeded: rel.succeeded, successRate: rel.rate === null ? null : Math.round(rel.rate * 1e5) / 1e5 },
        failures: p.failureReasons,
        setAside: p.ourFailures,
      };
    }),
    quickPicks: hasResults(track) ? quickPicks(track) : [],
    costPick: costPickData(track),
    metrics: groups.flatMap((g) =>
      g.ids.map((id) => {
        const m = track.metric(id);
        return { id, group: g.title, label: m.label, unit: m.unit, better: m.better, results: results(track, m) };
      }),
    ),
    // Only once the track's export has stress results, so older exports read exactly as before.
    ...(track.stress ? { stress: stressData(track.stress) } : {}),
  };
}

const about =
  "Sandbox bench: cloud sandbox providers for AI agents, timed through one SDK (Sandbox SDK, built by us; 0.2.0 is public on npm and the 1.0 used here will be published soon) from one server in Florida, US, on two tracks: the same 4 vCPU, 8 GB machine for every provider (the fair comparison, and the one the site opens on), and each provider's default machine. Medians, p95s and 95% confidence intervals per provider; every provider-side failure kept, failures caused by our own code set aside.";

const howToRead =
  "Pick a track first: `tracks[\"same-spec\"]` asks every provider for 4 vCPU and 8 GB, so prefer it for comparisons; `tracks.default` compares each provider's default sandbox, so sizes differ. In same-spec, `allocation.equalSpec: false` means the machine measured inside was not 4 vCPU, 8 GB, so compare that provider with care. median and p95 are in `unit`; `better` says which direction wins; results are sorted best first. attempts counts every try, failed included. A null median means the provider does not support the test, every attempt failed, or the result is excluded (see `status`). Cold start is the provider's own time, create() until the first command; Our SDK's setup after create is not included; on the faster SDK it measured 0.1 to 0.3 ms median per provider (20 creates each, separate run). `costPerTask.billingStatus` and `costPerTask.billingVerified` say how far a cost was checked against the provider's bill; they don't affect the cost pick. `costPerTask.kind` is billed (provider charge), metered (provider usage at published rates) or estimate (list price, where billing gives no amount); the quick task is one sandbox that is created, runs the 100-call tool replay and is deleted, from a separate cost run (real workloads are in `whatATaskCosts`): never compare them as if they were the same kind without saying so. The cost pick (`costPick`) is the cheapest exact cost from a provider bill or usage meter (kind billed or metered): a list-price estimate is shown but never picked; in same-spec only a provider that measured 4 vCPU and 8 GB counts; and each cheaper cost that can't count is in `lowerNotCounted` with `whyNotCounted`. `billing` says what each provider bills on, or that its billing basis is not confirmed. `wholeMachineAtListPrice` is the hourly list price of the allocation, a counterfactual for providers that bill usage; it has no per-task figure until the harness exports each task's sandbox lifetime. A row is one product on one CPU tier: `provider` names the company, and `cpuTier` (null for a provider that sells one tier) names the tier, its CPU class (dedicated, shared or spot), whether the provider can stop it mid-task, and its list rates. `cpuCaveat` (null when there is none) says when a row's CPU is burstable, shared or spot, as the page says it beside a winner: `short` for a label, `detail` for a sentence. Beam's Shared and Spot tiers are their own rows (beam-shared, beam-spot), measured on same-spec only with the quick tests and the real tasks; snapshots, pause and bursts of sandboxes were not run on them by design. Rank providers against each other on each one's first tier (`cpuTier.firstTier`), and compare a provider's tiers with each other; a preemptible tier is never the cost pick.";

/** How to read lower bounds and region multipliers, said only once the data has one. */
function howToReadQualifiers() {
  const lower = anyLowerBound()
    ? " `bound: \"lower\"` on a cost or price marks a lower bound (status `lowerBound`): it counts only the resources requested and the provider also bills use above them, so the charge can be higher. Read it as at least that amount; it is never eligible and never compared with exact costs."
    : "";
  const region = trackIds.some((id) => tracks[id].providers.some((p) => regionNote(p) !== null))
    ? " `price.regionMultiplier` is the pinned region's price multiplier, already included in every price and cost for that provider."
    : "";
  return `${lower}${region}`;
}

const howToReadText = () => `${howToRead}${howToReadQualifiers()}`;

// ---------------------------------------------------------------------------
// Sustained CPU over 15 minutes, same machine only, in every export once the file has providers.

const sustainedAbout =
  "Each provider's 4 vCPU, 8 GB sandbox kept busy on all cores for 15 minutes: 30 back-to-back 30-second segments of 32-bit LCG arithmetic, each segment's checksum verified. A CPU that runs on burst credit, then drops to a baseline share, shows its speed after the credit is spent.";

const sustainedHowToRead =
  "`first3MinOpsPerS` and `last3MinOpsPerS` are the mean all-core operations per second of the segments that start in minutes 0–3 and 12–15; `retention` is the second divided by the first (1 held its speed). `ranked` is every provider with a minutes 12–15 figure, highest first; `noSteadyState` lists the rest with why (a failed run, or one that stopped before minute 12). `status` is completed, stopped-early or failed, with `stopReason`. `segments` has every segment's start, length and rate. `cpuCaveat` says when a row's CPU is burstable, shared or spot. One run per provider.";

export function sustainedCpuData(d: SustainedCpuData) {
  const { ranked, missing } = sustainedRanked(d);
  return {
    about: sustainedAbout,
    howToRead: sustainedHowToRead,
    track: "same-spec",
    run: d.run,
    generatedAt: d.generatedAt,
    targetDurationS: d.targetDurationS,
    segmentDurationS: d.segmentDurationS,
    ranked: ranked.map((p) => ({
      provider: p.provider,
      name: providerName(p.provider),
      first3MinOpsPerS: round(p.first3MinOps),
      last3MinOpsPerS: round(p.last3MinOps),
      retention: Number(p.retention.toFixed(3)),
      status: p.status,
      stopReason: p.stopReason,
      cpuCaveat: cpuCaveat(p.provider),
    })),
    noSteadyState: missing.map((m) => ({ provider: m.provider, name: providerName(m.provider), why: m.why })),
    providers: d.providers.map((p) => ({
      provider: p.provider,
      status: p.status,
      stopReason: p.stopReason,
      guestVcpus: p.guestVcpus,
      durationS: round(p.durationS),
      segments: p.segments.map((s) => ({ startS: round(s.startS), durationS: round(s.durationS), opsPerS: round(s.opsPerS) })),
    })),
  };
}

export function sustainedCpuMarkdown(d: SustainedCpuData) {
  const { ranked, missing } = sustainedRanked(d);
  return [
    "# Sustained CPU over 15 minutes (Same machine)",
    "",
    sustainedAbout,
    "",
    "| Rank | Provider | Minutes 0–3, ops/s | Minutes 12–15, ops/s | Retention | Status |",
    "| --- | --- | --- | --- | --- | --- |",
    ...ranked.map(
      (p, i) =>
        `| ${i + 1} | ${providerName(p.provider)} | ${formatValue(p.first3MinOps, "ops/s")} | ${formatValue(p.last3MinOps, "ops/s")} | ${retentionText(p.retention)} | ${p.status === "completed" ? "completed" : `stopped early: ${p.stopReason}`} |`,
    ),
    "",
    ...missing.map((m) => `${providerName(m.provider)}: no minutes 12–15 figure (${m.why}).`),
    ...(missing.length ? [""] : []),
  ];
}

export function sustainedCpuLlms(d: SustainedCpuData) {
  const { ranked, missing } = sustainedRanked(d);
  return `## Sustained CPU over 15 minutes

${sustainedAbout} Same machine only. Data: \`sustainedCpu\` in results.json.

${[...ranked.map((p, i) => `${i + 1}. ${providerName(p.provider)}: ${steadyText(p)}${cpuCaveat(p.provider) ? ` (${cpuCaveat(p.provider)?.short})` : ""}`), ...missing.map((m) => `- ${providerName(m.provider)}: ${m.why}`)].join("\n")}

`;
}

/** Everything on the page as one JSON document, both tracks, for agents and scripts. */
export function agentData() {
  return {
    about,
    howToRead: howToReadText(),
    task: "The quick task is: create a sandbox, run the 100-call tool replay, delete it. Cost per task comes from a separate cost run, billed per sandbox. It is a small synthetic task; whatATaskCosts has real workloads.",
    whatATaskCosts: realisticData(),
    commonSize: commonSize.label,
    comingNextUpdate: ["Snapshot and restore", "Bursts of 10 and 25", "The same-machine (4 vCPU, 8 GB) track"],
    tracks: Object.fromEntries(trackIds.map((id) => [id, trackData(tracks[id])])),
    ...(hasExpanded(expanded) ? { expandedBenchmarks: expandedData(expanded) } : {}),
    ...(hasSustainedCpu(sustainedCpu) ? { sustainedCpu: sustainedCpuData(sustainedCpu) } : {}),
  };
}

const cell = (v: number | null, m: Pick<Metric, "unit">) => (v === null ? "n/a" : formatValue(v, m.unit));

function trackMarkdown(id: TrackId) {
  const track = tracks[id];
  const d = trackData(track);
  const lines = [`# Track: ${d.label}`, "", d.description, ""];
  if (!d.published) return [...lines, "No results published for this track yet.", ""];
  lines.push(
    `Run ${d.run.source}: ${d.run.start.slice(0, 10)} to ${d.run.end.slice(0, 10)}.`,
    "",
    ...d.absent.map((a) => `${providerName(a.provider)}: ${a.reason}`),
    ...(d.absent.length ? [""] : []),
    "## Quick picks",
    "",
    "| Need | Pick | Runner-up |",
    "| --- | --- | --- |",
    ...d.quickPicks.map((q) => `| ${q.need} | ${q.pick} | ${q.runnerUp} |`),
    "",
    ...d.quickPicks.flatMap((q) => (q.note ? [`${q.need}: ${q.note}`, ""] : [])),
    "## Machines and cost",
    "",
    `${wholeMachineLabel}: ${perTaskLifetimeNote} For a provider that bills usage it is a counterfactual, not its price.`,
    "",
    "| Provider | Asked for | Measured inside | 4 vCPU, 8 GB? | Ran in | Cost per task | Per 1,000 tasks | Cost kind | Billing status | Billing model | Whole machine at list price, per hour | Success rate |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...d.providers.map(
      (p) =>
        `| ${p.name} | ${p.allocation.requested.text} | ${p.allocation.measuredText ?? "not measured"} | ${p.allocation.equalSpec ? "yes" : "no"} | ${p.ranIn ?? "not reported"} | ${costCells(track, p.id).perTask} | ${costCells(track, p.id).perThousand} | ${p.costPerTask.kind} | ${"billingStatus" in p.costPerTask ? (p.costPerTask.billingStatus === "estimate" || p.costPerTask.billingStatus === "lowerBound" ? p.costPerTask.tag : p.costPerTask.billingStatus) : "n/a"} | ${p.billing.label} | ${p.wholeMachineAtListPrice.perHourUsd === null ? "n/a" : `${"bound" in p.wholeMachineAtListPrice ? "≥ " : ""}$${p.wholeMachineAtListPrice.perHourUsd}${p.wholeMachineAtListPrice.counterfactual ? " (counterfactual)" : ""}`} | ${p.reliability.successRate === null ? "n/a" : `${(p.reliability.successRate * 100).toFixed(2)}%`} |`,
    ),
    "",
    ...d.providers.flatMap((p) => ("regionNote" in p.price && p.price.regionNote ? [`Price note on ${p.name}: ${p.price.regionNote}.`, ""] : [])),
    ...d.providers.flatMap((p) => (p.allocationNote ? [`Machine note on ${p.name}: ${p.allocationNote}`, ""] : [])),
    ...d.providers.flatMap((p) =>
      "basis" in p.costPerTask
        ? [`Cost on ${p.name}: ${p.costPerTask.basis}. ${p.billing.label.replace(/^\w/, (ch) => ch.toUpperCase())}.`]
        : [`Cost on ${p.name}: none (${"note" in p.costPerTask ? p.costPerTask.note : ""}). ${p.billing.label.replace(/^\w/, (ch) => ch.toUpperCase())}.`],
    ),
    "",
  );
  for (const g of groups) {
    lines.push(`## ${g.title}`, "");
    for (const metricId of g.ids) {
      const m = track.metric(metricId);
      lines.push(
        `### ${m.label}`,
        "",
        `Median and p95, ${m.better} is better. Each cell carries its unit.`,
        "",
        "| Rank | Provider | Median | p95 | Attempts | Failed | Status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...results(track, m).map(
          (r, i) =>
            `| ${r.status === "measured" && r.median !== null ? i + 1 : "-"} | ${providerName(r.provider)}${id === "same-spec" && !r.equalSpec ? " (machine differs)" : ""} | ${cell(r.median, m)} | ${cell(r.p95, m)} | ${r.attempts} | ${r.failed} | ${r.status} |`,
        ),
        "",
      );
    }
  }
  lines.push("## What failed", "");
  for (const p of d.providers) {
    const counted = p.failures.length === 0 ? "no failures counted against the provider." : `${p.failures.map((f) => `${f.reason}${typeof f.status === "number" ? ` (HTTP ${f.status})` : ""}${f.code ? ` [${f.code}]` : ""}${f.stage ? ` during ${f.stage}` : ""}: ${f.runs} runs, ${f.count} failed tests (${f.kind}; ${f.tests.join(", ")})`).join("; ")}.`;
    const aside = p.setAside.map((f) => ` Set aside, not counted: ${f.reason} (${f.runs} runs, ${f.count} failed tests).`).join("");
    lines.push(`- ${p.name}: ${counted}${aside}`);
  }
  lines.push("");
  const rerun = d.providers.flatMap((p) => setAsideLines(p.id).filter((l) => l.startsWith(`${trackInfo[id].label}:`)).map((l) => `- ${l.slice(trackInfo[id].label.length + 2)}`));
  if (rerun.length) lines.push("## Runs set aside and rerun", "", ...rerun, "");
  if (track.stress) lines.push(...stressMarkdown(track.stress));
  return lines;
}

const ops = (v: number | null) => (v === null ? "n/a" : formatValue(v, "ops/s"));
const ratioCell = (r: { p50: number | null } | null) => (r === null || r.p50 === null ? "n/a" : r.p50.toFixed(2));

/** A track's stress suites as Markdown tables, best first. */
function stressMarkdown(s: StressData) {
  const lines = ["## Stress", "", stressAbout, ""];
  const sustained = [...highestFirst(s.cpuSustained.rows, sustainedValue("single")).map((x) => x.row), ...s.cpuSustained.rows.filter((r) => r.single.p50 === null)];
  if (sustained.length)
    lines.push(
      "### Sustained CPU",
      "",
      "| Provider | Single core, median | All cores, median | Runs (single / all) | Min ÷ median segment (all) | Last ÷ first quarter (all) | vCPU | Failed attempts |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...sustained.map((r) => `| ${providerName(r.provider)} | ${ops(r.single.p50)} | ${ops(r.all.p50)} | ${r.single.n} / ${r.all.n} | ${ratioCell(r.consistency.all)} | ${ratioCell(r.trend.all)} | ${r.guestVcpus.map((v) => v.value).join(", ") || "n/a"} | ${r.attempts.failures.provider} |`),
      "",
    );
  for (const g of s.cpuBurst) {
    const rows = [...highestFirst(g.rows, burstValue).map((x) => x.row), ...g.rows.filter((r) => burstValue(r) === null)];
    if (!rows.length) continue;
    lines.push(
      `### CPU under burst, ${g.k} at once`,
      "",
      "| Provider | Median per sandbox (single core) | Fastest ÷ slowest | Counted cohorts | Complete cohorts | Excluded cohorts | Failed |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...rows.map((r) => `| ${providerName(r.provider)} | ${ops(burstValue(r))} | ${r.perSandbox.single.maxOverMin === null ? "n/a" : `${r.perSandbox.single.maxOverMin.toFixed(2)}×`} | ${r.perSandbox.cohorts} | ${r.completeCohorts} of ${r.cohorts} | ${r.excluded.lowOverlap + r.excluded.invalidEvidence} | ${r.failures.provider} |`),
      "",
    );
  }
  for (const g of s.burstSurvival) {
    const rows = [...survivalRanked(g.rows).map((x) => x.row), ...g.rows.filter((r) => r.survivalRate === null)];
    if (!rows.length) continue;
    lines.push(
      `### Burst survival, ${g.k} at once`,
      "",
      "| Provider | Survival rate | Survived | Attempted | Window | Create failed | Died | Unresponsive | Interrupted | Invalid evidence |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...rows.map((r) => `| ${providerName(r.provider)} | ${r.survivalRate === null ? "n/a" : formatPercent(r.survivalRate)} | ${r.survived} | ${r.attempted} | ${r.windowS === null ? "n/a" : `${r.windowS} s`} | ${r.createFailed.total} | ${r.died} | ${r.unresponsive} | ${r.interrupted} | ${r.invalidEvidence} |`),
      "",
    );
  }
  return lines;
}

/** The expanded benchmarks as Markdown, one table per test, best first. */
function expandedMarkdown(e: Expanded) {
  const lines = ["# Expanded benchmarks", "", expandedAbout, ""];
  for (const g of e.groups) {
    if (!g.metrics.some((m) => m.values.length > 0)) continue;
    lines.push(`## ${g.label}`, "");
    for (const m of g.metrics) {
      lines.push(`### ${m.label}`, "", `${m.description} Median, ${m.better} is better.`, "");
      if (m.values.length === 0) {
        lines.push("No verified runs yet.", "");
        continue;
      }
      lines.push(
        "| Rank | Provider | Median | Min | Max | Verified runs |",
        "| --- | --- | --- | --- | --- | --- |",
        ...bestFirst(m.values, m.better).map((v, i) => `| ${i + 1} | ${providerName(v.provider)} | ${formatValue(v.median, m.unit)} | ${formatValue(v.min, m.unit)} | ${formatValue(v.max, m.unit)} | ${v.n} |`),
        "",
      );
    }
  }
  return lines;
}

/** A provider's cost per task and per 1,000 for a table cell: "≥ $X" for a lower bound, "n/a" without a cost. */
function costCells(track: Track, id: ProviderId) {
  const c = taskCostOf(track, id);
  return c && isPriced(c) ? { perTask: perTaskText(c, "tight"), perThousand: perThousandText(c, "tight") } : { perTask: "n/a", perThousand: "n/a" };
}

/** The same results as Markdown tables, one section per track, one table per metric, best first. */
export function agentMarkdown() {
  const lines = [
    "# Sandbox bench results",
    "",
    about,
    "",
    "JSON: /results.json. Guide: /llms.txt.",
    "",
    ...realisticMarkdown(),
    "# The quick task and the main suite",
    "",
    howToReadText(),
    "",
    "The quick task is: create a sandbox, run the 100-call tool replay, delete it, priced from a separate cost run. Prices cover compute only; disk, transfer, subscriptions and credits are excluded. boxd bills in euros, converted at the ECB rate.",
    "",
    ...trackIds.flatMap(trackMarkdown),
    ...(hasSustainedCpu(sustainedCpu) ? sustainedCpuMarkdown(sustainedCpu) : []),
    ...(hasExpanded(expanded) ? expandedMarkdown(expanded) : []),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Sentences on lower bounds, region multipliers, destroy timing and snapshot
 * caveats for the notes section, per provider with data, so its provider page
 * quotes them. Empty while no provider in the data has one.
 */
function qualifierNotes() {
  const seen = new Map<ProviderId, string[]>();
  const add = (id: ProviderId, s: string) => seen.set(id, [...new Set([...(seen.get(id) ?? []), s])]);
  for (const id of trackIds)
    for (const p of tracks[id].providers) {
      const c = taskCostOf(tracks[id], p.id);
      const where = id === "default" ? "on its default machine" : `on the ${trackInfo[id].short} machine`;
      if (c && isPriced(c) && isLowerBound(c)) add(p.id, `${providerName(p.id)}'s cost per task ${where} is a lower bound: it counts only the resources requested, and ${providerName(p.id)} also bills use above them, so it is shown as at least that amount and never ranked or picked.`);
      if (p.hourly !== null && p.pricingBound === "lower") add(p.id, `${providerName(p.id)}'s hourly price ${where} is a lower bound for the same reason.`);
      const note = regionNote(p);
      if (note) add(p.id, `${providerName(p.id)} is ${note}.`);
      const destroy = destroyNotes[p.id];
      if (destroy) add(p.id, `Destroy on ${providerName(p.id)} ${destroy}.`);
      const snapshot = snapshotNotes[p.id];
      if (snapshot) add(p.id, snapshot);
    }
  return [...seen.values()].flat().map((s) => ` ${s}`).join("");
}

/** " 23 Modal main-suite runs (…) were set aside as our-side failures and rerun: …", for every provider with some; "" otherwise. */
const setAsideSummary = () => allProviders.flatMap((id) => { const s = setAsideSentence(id); return s ? [` ${s}`] : []; }).join("");

/**
 * "Billing model of boxd: bills active CPU and memory in use. Billing model of
 * E2B, Boat: bills the whole machine while it exists. …", one sentence per
 * label, so a provider page quoting the sentences that name it gets only its
 * own group, never the others'.
 */
function billingSummary() {
  // Pages quote these sentences by name, so each provider is listed on its first CPU tier; a tier's billing is in its own row.
  const ids = [...new Set(trackIds.flatMap((id) => tracks[id].providers.map((p) => p.id)))].filter((id) => !isExtraTier(id));
  const byLabel = new Map<string, ProviderId[]>();
  for (const id of ids) {
    const label = billingLabel(billingBases[id]);
    byLabel.set(label, [...(byLabel.get(label) ?? []), id]);
  }
  return [...byLabel].map(([label, group]) => `Billing model of ${nameList(group)}: ${label}.`).join(" ");
}

/** The llms.txt guide: what the site is and where agents find each piece. */
export function llmsTxt() {
  const picks = trackIds.flatMap((id) => {
    const t = tracks[id];
    return hasResults(t) ? [`### ${trackInfo[id].label}`, "", ...quickPicks(t).map((q) => `- ${q.need}: ${q.pick} (runner-up ${q.runnerUp})${q.note ? ` ${q.note}` : ""}`), ""] : [`### ${trackInfo[id].label}`, "", "No results published yet.", ""];
  });
  const names = [...new Set(trackIds.flatMap((id) => tracks[id].providers.map((p) => p.id)))];
  return `# Sandbox bench

> ${about}

Providers (id → name): ${names.map((id) => `${id} → ${providerName(id)}`).join(", ")}.

## Tracks

${trackIds.map((id) => `- \`${id}\`: ${trackInfo[id].label}. ${trackInfo[id].description}${tracks[id].absent.length ? ` ${tracks[id].absent.map((a) => `${providerName(a)} is ${absentNote(tracks[id], a)}`).join(" ")}` : ""}`).join("\n")}

The page shows one track at a time: \`/\` opens the same-machine track and \`/?track=default\` the default-machines track.

${realisticLlms()}${hasSustainedCpu(sustainedCpu) ? sustainedCpuLlms(sustainedCpu) : ""}## Quick picks

${picks.join("\n")}
## Coming in the next update

Any snapshot or burst a chart marks as coming. Every result, cold start, SDK setup, snapshots, bursts and cost included, comes from the runs on our faster SDK (commit 1185278); Superserve now runs the same-machine track at 4 vCPU. Pause and resume are from the previous run (SDK a2316c3), because the new main runs skipped them. boxd is the exception: every boxd result, pause and resume included, comes from a full re-run on its New York region on Nov 19 (commit 5a8bdda, boxd SDK 0.3.2), except its cost per task, which is from its Nov 4 New York run (commit d8844f0). Baseten is also an exception: its results come from its own runs on Nov 12 and 13 (SDK setup Nov 13, commit 9e2a752) and its resume from a separate run on Nov 17, because Baseten has no pause call and its sandboxes go on standby by themselves. Instabox is the third exception: every Instabox result, pause and resume, snapshots and bursts included, comes from its own runs on Nov 18 (commit 6074f7b), on its Builder plan; each burst started a minute apart, to stay inside Instabox's start rate (50 a minute on Builder). Beam joined on Nov 18: its results, SDK setup included, come from its own runs that day (commit 69d48ed). Styne joined on Nov 23: every Styne result, pause and resume, snapshots, bursts and SDK setup included, comes from its own runs that day (commit cd2e6e1). Styne runs a burstable shared-CPU class: a new sandbox starts with up to 10 minutes of full-speed burst credit (less after sustained account load), drops to 16% per vCPU when credit runs out, and replenishes credit while staying under baseline; our longest Styne real task took 131 s. Daytona was re-collected on Oct 22 after its account quota was raised from 10 vCPU / 10 GiB; earlier Daytona numbers were limited by that quota. Upstash appears twice because Box (long-lived, can pause) and Ephemeral Box (short-lived, for one-off agent jobs) are separate products. A provider gets another row only for a product it sells separately or a CPU tier it prices separately, never for a size, region or setting of the same product, and at most four rows; Beam Shared and Beam Spot are Beam's CPU tiers, and Beam is ranked on Performance, the tier a new account gets. Ephemeral Box has no pause, so it has no pause result. Baseten has no pause call: its sandboxes go on standby by themselves about 15 s after their last request, keeping memory and processes, so only Baseten's resume is timed, from a separate run, and it is never ranked as a pause + resume total. Baseten's API has no snapshots yet, and Baseten's outbound network is IPv6-only for now, so a raw IPv4 address can't be reached; Baseten's snapshot tests and the TCP-connect probe show as not available yet, not as failures. Instabox blocks outbound HTTPS to public DNS resolvers, including 1.1.1.1:443, the TCP-connect probe's target, so its probe shows as not available yet too; other port 443 traffic works. Baseten raised our account's limits from 4 GB per sandbox and 10 sandboxes at once, so Baseten runs the same-machine track and bursts of 25. Beam sandboxes have no pause call, and Beam keeps memory snapshots but has no way to delete one, so its pause and snapshot tests did not run. Beam's default sandbox is 1 CPU and 128 MiB, too little memory for our dev server, Python install and realistic workloads, which show as failures or too small on the default track. Our Beam account's 30 vCPU quota can't hold 10 sandboxes at 4 vCPU, so Beam has no same-machine bursts. Cheapest is the lowest exact cost; on the same-machine track only a provider that measured 4 vCPU and 8 GB counts. Freestyle, Luxor, Baseten, Beam and Styne costs use their list prices on our measured sandbox lifetime; Styne has no per-sandbox billing data, as its usage API reports daily account totals.${qualifierNotes()} ${billingSummary()} ${wholeMachineLabel}: ${perTaskLifetimeNote} A burst size is published only when all three bursts finished. Failures caused by our own code are set aside, not counted.${setAsideSummary()}

## Data

- [results.json](/results.json): both tracks. \`whatATaskCosts\` holds the realistic workloads (pilot): per track and workload the cheapest provider, any cheaper cost that wasn't counted (a list-price estimate, too many failures or a different machine), and every provider's cost, kind, status and completion count; plus the idle test. Per provider: what we asked for and measured (allocation, equalSpec), cost per task with its kind (billed, metered, estimate), source and confidence, SDK-ready time, prices, regions and failures. Per metric: median, p95, attempts, failed and status. Start here.
- [results.md](/results.md): the same numbers as Markdown tables, one section per track.

## How to read it

${howToReadText()}

Cheapest requires a provider bill or usage meter: list-price estimates are shown on the chart but not picked. Prices cover compute only at list rates; disk, transfer, subscriptions and credits are excluded. Every call starts in Florida, so a provider hosted in Europe (Boat, in France) pays a transatlantic round trip per call. In the same-machine track, usable memory measured inside sits a little under 8 GB; equalSpec allows 7.6 to 8.4 GiB. Amounts are US dollars unless marked EUR.

## Metrics

${groups.map((g) => `- ${g.title}: ${g.ids.map((id) => `${tracks.default.metric(id).label} (\`${id}\`)`).join(", ")}`).join("\n")}
`;
}
