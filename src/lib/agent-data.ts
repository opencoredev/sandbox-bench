import {
  TASKS_PER_PRICE,
  billingBases,
  billingLabel,
  costBasis,
  costPick,
  costStatus,
  costStatuses,
  costTag,
  hasLowerBounds,
  isEligible,
  isLowerBound,
  isPriced,
  noPickLabel,
  perTaskLifetimeNote,
  perTaskText,
  perThousandText,
  pickLabel,
  pricedTasks,
  regionNote,
  statusNote,
  wholeMachine,
  wholeMachineLabel,
  wholeMachineText,
} from "@/lib/cost";
import type { PricedTask } from "@/lib/cost";
import { hasResults, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Metric, Provider, Track, TrackId } from "@/lib/data";
import { formatPercent, formatValue } from "@/lib/format";
import { chipBasisLabel, hardware, probeDate } from "@/lib/hardware";
import { commonPrice, commonSize, eurUsd, usdPrice } from "@/lib/fx";
import { absentNote, allocationNotes, destroyNotes, measuredText, noRealPause, requestedText, snapshotNotes } from "@/lib/notes";
import { isProviderId, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import {
  billingText,
  changeText,
  completedText,
  flagsOf,
  headlineRows,
  holdTag,
  idleGroups,
  idleLabel,
  idleOutcome,
  isCounterfactual,
  laterLine,
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
  statusTag,
  taskPick,
  uncertifiedWhy,
  wallText,
  wilson,
} from "@/lib/realistic";
import type { Costed, ProfileId, RealisticRow } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { advertised, sizeOf } from "@/lib/sizes";
import { successRate } from "@/lib/status";

/** The metrics agents get, in page order, grouped as on the page. */
export const groups = [
  { title: "Start-up", ids: ["cold"] },
  { title: "Agent work", ids: ["tool-replay", "npm-install", "pip-install", "git-clone", "dev-server", "preview-first-byte", "edit-loop"] },
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
type NotRun = Record<TrackId, Partial<Record<string, Partial<Record<ProviderId, string>>>>>;
const handNotRun: NotRun = {
  default: {
    "pause-resume": { "upstash-ephemeral": "unsupported: Upstash Ephemeral Box has no pause and resume", modal: modalNoPause },
  },
  "same-spec": {
    "pause-resume": { "upstash-ephemeral": "unsupported: Upstash Ephemeral Box has no pause and resume", modal: modalNoPause },
    snapshot: { superserve: superserveJoins },
    "create-from-snapshot": { superserve: superserveJoins },
    "burst-10": {
      superserve: superserveJoins,
    },
    "burst-25": {
      superserve: superserveJoins,
    },
  },
};

/** The hand-written reasons above plus the ones each track's data works out from its runs; the data wins for a provider it names. */
function withData(id: TrackId): NotRun[TrackId] {
  const fromData = tracks[id].missing;
  const out: NotRun[TrackId] = {};
  for (const m of new Set([...Object.keys(handNotRun[id]), ...Object.keys(fromData)])) {
    const row: Partial<Record<ProviderId, string>> = { ...handNotRun[id][m] };
    for (const [pid, why] of Object.entries(fromData[m] ?? {})) if (isProviderId(pid)) row[pid] = why;
    out[m] = row;
  }
  return out;
}
export const notRun: NotRun = { default: withData("default"), "same-spec": withData("same-spec") };

/** A notRun reason as chart text: "not run: …", or the reason alone for a stopped run. */
export const notRunText = (why: string) => why.replace(/^not-run: /, "not run: ").replace(/^stopped-early: /, "");

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
  if (!v) return "unsupported";
  if (v.n > 0) return "measured";
  if (v.ourFailures > 0 && v.failures === 0) return "not-measured: our harness could not run this test on this provider";
  if (v.failures > 0 && v.limitFailures === v.failures) return "not-run: our account or plan limit";
  if (v.failures > 0) return "all-failed";
  return "unsupported";
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

/** The cost row of the quick picks: the lowest verified cost among eligible providers, never "cheapest". */
function costPickRow(track: Track): QuickPick {
  const c = costPick(track);
  switch (c.kind) {
    case "verified": {
      // The tag in costCell already names the status, so only the reason follows it.
      const lower = c.lower.map((t) => `${costCell(t)}${"why" in t.status ? `, because ${t.status.why}` : ""}`);
      return {
        need: `Quick task: ${pickLabel.toLowerCase()}`,
        pick: costCell(c.pick),
        runnerUp: c.runnerUp ? costCell(c.runnerUp) : "n/a",
        note: `Eligible: ${nameList(c.eligible)}.${lower.length ? ` Lower but not eligible: ${lower.join("; ")}.` : ""}`,
      };
    }
    case "none":
      return c.lowest
        ? { need: `Quick task: ${noPickLabel.toLowerCase()}`, pick: `Lowest reported: ${costCell(c.lowest)}`, runnerUp: "n/a", note: `${statusNote(c.lowest.status) ?? ""}.` }
        : { need: `Quick task: ${noPickLabel.toLowerCase()}`, pick: "Every reported cost is a lower bound, so none is ranked", runnerUp: "n/a", note: null };
    case "empty":
      return { need: `Quick task: ${pickLabel.toLowerCase()}`, pick: "n/a", runnerUp: "n/a", note: null };
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** The cost pick as data for agents: who, the eligible set, and every lower cost that isn't eligible, with why. */
function costPickData(track: Track) {
  const row = (t: PricedTask) => ({ provider: t.id, perTaskUsd: roundCost(t.cost.usd), per1000TasksUsd: roundCost(t.cost.usd * TASKS_PER_PRICE), ...lowerBoundField(isLowerBound(t.cost)), kind: t.cost.kind, status: t.status.kind, why: "why" in t.status ? t.status.why : null });
  const c = costPick(track);
  switch (c.kind) {
    case "verified":
      return { label: pickLabel, pick: row(c.pick), runnerUp: c.runnerUp ? row(c.runnerUp) : null, eligible: c.eligible, lowerNotEligible: c.lower.map(row) };
    case "none":
      return { label: noPickLabel, pick: null, lowestReported: c.lowest ? row(c.lowest) : null, eligible: [], lowerNotEligible: [] };
    case "empty":
      return { label: noPickLabel, pick: null, eligible: [], lowerNotEligible: [] };
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
    const ranked = new Set(results(track, m).filter((r) => r.status === "measured" && r.median !== null).map((r) => r.provider));
    const [a, b] = m.values
      .filter((v) => ranked.has(v.provider) && v.p50 !== null)
      .sort((x, y) => (m.better === "lower" ? 1 : -1) * ((x.p50 ?? 0) - (y.p50 ?? 0)));
    const cell = (v: typeof a) => (v ? `${name(v.provider)} ${formatValue(v.p50 ?? 0, m.unit)}` : "n/a");
    return { need: label, pick: cell(a), runnerUp: cell(b), note: null };
  };
  const reliable = track.providers.map((p) => ({ p, rate: successRate(track, p).rate ?? 0 })).sort((a, b) => b.rate - a.rate);
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
  "Cost per completed task is the cost of every attempt, failed ones included, divided by the tasks that completed. Its kind is billed (the provider's charge), metered (the provider's usage meter at its rates) or estimate (our measured time at list price), and `status` adds the eligibility-table statuses in the same words as `costEligibility`: verified, unreconciled, provisional, unsettled, estimate, plus qualifiers of these runs (wrong size, too many failures). Only a row with eligible: true can be a pick: billed and settled (or a meter reconciled with settled charges), tied to our own sandboxes, at most 1 incomplete run and, on the same-machine track, exactly 4 vCPU and 8 GB. `billing` is the same evidence-backed billing model as the rest of this file; whole machine at list price is a counterfactual for providers that bill usage. There is no overall cheapest pick: each workload and track has its own, and this pilot names no certified winner.";

const usd6 = (v: number | null) => (v === null ? null : Number(v.toPrecision(6)));

function realisticRowData(row: RealisticRow) {
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
    eligible: row.eligible,
    status: row.cost ? statusTag(row) : null,
    whyNotEligible: flagsOf(row).map((f) => f.text),
    noCost: row.cost ? null : noCostReason(row),
    wholeMachinePer1000Usd: usd6(row.cost?.wholeMachineUsdPerCompleted === null || row.cost === null ? null : row.cost.wholeMachineUsdPerCompleted * TASKS_PER_PRICE),
    wholeMachineCounterfactual: isCounterfactual(row.provider),
    billing,
    ...(row.costNote ? { costNote: row.costNote } : {}),
  };
}

const pickRow = (r: Costed) => ({ provider: r.provider, per1000CompletedUsd: usd6(r.cost.usdPerCompleted * TASKS_PER_PRICE), kind: r.cost.kind, status: statusTag(r), whyNotEligible: flagsOf(r).map((f) => f.text) });

function realisticPickData(costed: readonly Costed[]) {
  const p = taskPick(costed);
  const uncertified = { certified: false, certification: `${pickLabels.uncertified}: ${uncertifiedWhy(realistic)}.` };
  switch (p.kind) {
    case "verified":
      return { label: p.label, ...uncertified, pick: pickRow(p.pick), eligible: p.eligible, lowerNotEligible: p.lower.map(pickRow) };
    case "none":
      return { label: p.label, ...uncertified, pick: null, eligible: [], lowerNotEligible: p.lower.map(pickRow) };
    case "empty":
      return { label: pickLabels.none, ...uncertified, pick: null, eligible: [], lowerNotEligible: [] };
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

function realisticProfile(id: TrackId, profile: ProfileId) {
  const { costed, uncosted } = headlineRows(realistic, runTrackOf[id], profile);
  return { pick: realisticPickData(costed), providers: [...costed, ...uncosted].map(realisticRowData) };
}

/** The realistic workloads as plain data: definitions, the pilot label, per track and workload the pick and every provider, and the idle test. */
export function realisticData() {
  return {
    title: "What a task costs",
    pilot: pilotLine(realistic),
    runsPerProvider: realistic.coverage.headline.attempts,
    comingLater: laterLine,
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
      what: `Fix and test, then the sandbox left open for 0, 10 or 60 minutes on each provider's default settings, then a resume step (git status and the tests). Same-machine track only, ${realistic.coverage.idle.attempts} runs per provider and wait. medianCostUsd is the median total cost of one run, fix, wait and resume, failed runs included.`,
      notTested: realistic.coverage.idle.notTested.map((n) => ({ provider: n.provider, name: providerName(n.provider), reason: n.reason })),
      providers: idleGroups(realistic).map((g) => ({
        provider: g.provider,
        name: providerName(g.provider),
        outcome: idleOutcome(g),
        waits: g.points.map((p) => ({
          minutes: p.minutes,
          runs: p.runs,
          completed: p.completed,
          medianCostUsd: usd6(p.medianCostUsd),
          per1000Usd: usd6(p.medianCostUsd === null ? null : p.medianCostUsd * TASKS_PER_PRICE),
          kind: p.costKind,
          status: holdTag(p),
          changeVsNoWait: changeText(p),
          medianWakeMs: p.medianWakeMs,
          stateChanges: p.transitions,
          stoppedWhileIdle: p.stopped,
        })),
      })),
    },
  };
}

const pickLine = (track: TrackId, profile: ProfileId) => {
  const p = realisticProfile(track, profile).pick;
  const lower = p.lowerNotEligible.map((r) => `${providerName(r.provider)} ${perThousand(r.per1000CompletedUsd === null ? 0 : r.per1000CompletedUsd / TASKS_PER_PRICE)} (${r.status})`).join("; ");
  const head = p.pick ? `${p.label}: ${providerName(p.pick.provider)} ${perThousand((p.pick.per1000CompletedUsd ?? 0) / TASKS_PER_PRICE)} per 1,000 (${p.pick.status}). Eligible: ${nameList(p.eligible)}.` : `${p.label}: no provider has a verified cost yet.`;
  return `${head} ${p.certification}${lower ? ` ${p.pick ? "Lower but not eligible" : "Reported, none eligible"}: ${lower}.` : ""}`;
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
            `| ${r.name} | ${r.per1000CompletedUsd === null ? "n/a" : perThousand(r.per1000CompletedUsd / TASKS_PER_PRICE)} | ${r.status ?? `no cost: ${r.noCost ?? ""}`}${r.whyNotEligible.length ? ` (${r.whyNotEligible.join("; ")})` : ""} | ${r.notRun === r.attempts ? "not run" : r.completedText} | ${r.medianWallS === null ? "n/a" : wallText(r.medianWallS)} | ${r.billing} | ${r.wholeMachinePer1000Usd === null ? "n/a" : `${perThousand(r.wholeMachinePer1000Usd / TASKS_PER_PRICE)}${r.wholeMachineCounterfactual ? " (counterfactual)" : ""}`} |`,
        ),
        "",
      );
    }
  }
  lines.push("## Leaving the sandbox open (same machine, fix and test)", "", d.idle.what, "", "| Provider | Wait | Completed | Median cost, per 1,000 | Kind and status | Change vs no wait | Median wake | State change while idle |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const g of d.idle.providers)
    for (const p of g.waits)
      lines.push(`| ${g.name} | ${idleLabel(p)} | ${p.completed} of ${p.runs} | ${p.per1000Usd === null ? "n/a" : perThousand(p.per1000Usd / TASKS_PER_PRICE)} | ${p.status} | ${p.changeVsNoWait ?? "n/a"} | ${p.medianWakeMs === null ? "n/a" : `${p.medianWakeMs} ms`} | ${p.stateChanges.length ? p.stateChanges.join(", ") : "none seen"} |`);
  lines.push(
    "",
    ...d.idle.providers.flatMap((g) => (g.outcome ? [`${g.name}: ${g.outcome}.`, ""] : [])),
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

Idle test (same machine, fix and test, then 10 or 60 minutes open, ${realistic.coverage.idle.attempts} runs per provider and wait): ${idle.length ? `${idle.join("; ")}.` : "no provider stopped the sandbox."} Not tested: ${d.idle.notTested.map((n) => `${n.name} (${n.reason})`).join("; ") || "none"}.

`;
}

const allocationOf = (p: Track["providers"][number]) => ({
  requested: { ...p.requestedAllocation, text: requestedText(p) },
  measured: p.measuredAllocations.map((a) => ({ cpu: a.cpu, memoryGiB: round(a.memoryGiB), diskGiB: round(a.diskGiB) })),
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
    probed: probeDate,
  };
}

function costOf(track: Track, id: ProviderId) {
  const c = track.costs[id];
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
        status: s.kind,
        eligible: isEligible(s),
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
    providers: track.providers.map((p) => {
      const rel = successRate(track, p);
      return {
        id: p.id,
        name: providerName(p.id),
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
          note: p.pricingNotes,
          usdNote: p.currency === "EUR" ? `Converted at the ECB rate of ${eurUsd.rate} USD per EUR on ${eurUsd.date}.` : null,
          source: p.pricingSource,
        },
        pause: noRealPause[p.id] ? { supported: false, note: noRealPause[p.id] } : { supported: p.pauseSplit !== null || track.metric("pause-resume").values.some((v) => v.provider === p.id && v.p50 !== null), split: p.pauseSplit },
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
  };
}

const about =
  "Sandbox bench: cloud sandbox providers for AI agents, timed through one SDK (Sandbox SDK, built by us; 0.2.0 is public on npm and the 1.0 used here will be published soon) from one server in Florida, US, on two tracks: the same 4 vCPU, 8 GB machine for every provider (the fair comparison, and the one the site opens on), and each provider's default machine. Medians, p95s and 95% confidence intervals per provider; every provider-side failure kept, failures caused by our own code set aside.";

const howToRead =
  "Pick a track first: `tracks[\"same-spec\"]` asks every provider for 4 vCPU and 8 GB, so prefer it for comparisons; `tracks.default` compares each provider's default sandbox, so sizes differ. In same-spec, `allocation.equalSpec: false` means the machine measured inside was not 4 vCPU, 8 GB, so compare that provider with care. median and p95 are in `unit`; `better` says which direction wins; results are sorted best first. attempts counts every try, failed included. A null median means the provider does not support the test, every attempt failed, or the result is excluded (see `status`). Cold start is the provider's own time, create() until the first command; Our SDK's setup after create is not included; on the faster SDK it measured 0.1 to 0.3 ms median per provider (20 creates each, separate run). `costPerTask.kind` is billed (provider charge), metered (provider usage at published rates) or estimate (list price, where billing gives no amount); the quick task is one sandbox that is created, runs the 100-call tool replay and is deleted, from a separate cost run (real workloads are in `whatATaskCosts`): never compare them as if they were the same kind without saying so. `costPerTask.status` comes from one eligibility table (`costEligibility`): verified (billed and settled, and not provisional) can be the cost pick; unreconciled (metered, not yet checked against settled charges), provisional, unsettled and estimate are shown but never picked. There is no overall cheapest pick: the cost pick is the lowest verified cost among eligible providers (`costPick`), with the eligible set and every lower cost that isn't eligible, with its reason. `billing` says what each provider bills on, or that its billing basis is not confirmed. `wholeMachineAtListPrice` is the hourly list price of the allocation, a counterfactual for providers that bill usage; it has no per-task figure until the harness exports each task's sandbox lifetime.";

/** The eligibility table as data, in the order a cost is checked against it. The lower-bound row is listed once a track has one. */
const costEligibility = () =>
  Object.entries(costStatuses)
    .filter(([status]) => status !== "lowerBound" || anyLowerBound())
    .map(([status, s]) => ({ status, label: s.label, eligible: s.eligible, rule: s.rule }));

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

/** Everything on the page as one JSON document, both tracks, for agents and scripts. */
export function agentData() {
  return {
    about,
    howToRead: howToReadText(),
    task: "The quick task is: create a sandbox, run the 100-call tool replay, delete it. Cost per task comes from a separate cost run, billed per sandbox. It is a small synthetic task; whatATaskCosts has real workloads.",
    whatATaskCosts: realisticData(),
    commonSize: commonSize.label,
    costEligibility: costEligibility(),
    comingNextUpdate: ["Snapshot and restore", "Bursts of 10 and 25", "The same-machine (4 vCPU, 8 GB) track"],
    tracks: Object.fromEntries(trackIds.map((id) => [id, trackData(tracks[id])])),
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
    `Cost status: ${costEligibility().map((r) => `${r.label.toLowerCase()} (${r.eligible ? "can be the cost pick" : "shown, never picked"}): ${r.rule}`).join(" ")}`,
    "",
    `${wholeMachineLabel}: ${perTaskLifetimeNote} For a provider that bills usage it is a counterfactual, not its price.`,
    "",
    "| Provider | Asked for | Measured inside | 4 vCPU, 8 GB? | Ran in | Cost per task | Per 1,000 tasks | Cost kind | Cost status | Billing model | Whole machine at list price, per hour | Success rate |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...d.providers.map(
      (p) =>
        `| ${p.name} | ${p.allocation.requested.text} | ${p.allocation.measuredText ?? "not measured"} | ${p.allocation.equalSpec ? "yes" : "no"} | ${p.ranIn ?? "not reported"} | ${costCells(track, p.id).perTask} | ${costCells(track, p.id).perThousand} | ${p.costPerTask.kind} | ${"status" in p.costPerTask ? (p.costPerTask.status === "estimate" || p.costPerTask.status === "lowerBound" ? p.costPerTask.tag : p.costPerTask.status) : "n/a"} | ${p.billing.label} | ${p.wholeMachineAtListPrice.perHourUsd === null ? "n/a" : `${"bound" in p.wholeMachineAtListPrice ? "≥ " : ""}$${p.wholeMachineAtListPrice.perHourUsd}${p.wholeMachineAtListPrice.counterfactual ? " (counterfactual)" : ""}`} | ${p.reliability.successRate === null ? "n/a" : `${(p.reliability.successRate * 100).toFixed(2)}%`} |`,
    ),
    "",
    ...d.providers.flatMap((p) => ("regionNote" in p.price && p.price.regionNote ? [`Price note on ${p.name}: ${p.price.regionNote}.`, ""] : [])),
    ...d.providers.flatMap((p) => (p.allocationNote ? [`Machine note on ${p.name}: ${p.allocationNote}`, ""] : [])),
    ...d.providers.flatMap((p) =>
      "basis" in p.costPerTask
        ? [`Cost on ${p.name}: ${p.costPerTask.basis}, ${p.costPerTask.eligible ? "verified" : (p.costPerTask.statusNote ?? "").replace(/^\w/, (ch) => ch.toLowerCase())}. ${p.billing.label.replace(/^\w/, (ch) => ch.toUpperCase())}.`]
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
  return lines;
}

/** A provider's cost per task and per 1,000 for a table cell: "≥ $X" for a lower bound, "n/a" without a cost. */
function costCells(track: Track, id: ProviderId) {
  const c = track.costs[id];
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
  ];
  return `${lines.join("\n")}\n`;
}

/** "boxd (provisional: …); E2B (unreconciled: …); Daytona (unsettled: …)": every billed or metered cost that isn't eligible, once across both tracks. */
function notEligibleSummary() {
  const seen = new Map<ProviderId, string>();
  for (const id of trackIds)
    for (const t of pricedTasks(tracks[id]))
      if (t.status.kind === "provisional" || t.status.kind === "unsettled" || t.status.kind === "unreconciled") seen.set(t.id, `${providerName(t.id)}'s ${t.cost.kind} cost is ${costStatuses[t.status.kind].label.toLowerCase()}: ${t.status.why}`);
  return seen.size ? [...seen.values()].join("; ") : "none";
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
      const c = tracks[id].costs[p.id];
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

/** "boxd: bills active CPU and memory in use; E2B, Boat: bills the whole machine while it exists; …", grouped by label. */
function billingSummary() {
  const ids = [...new Set(trackIds.flatMap((id) => tracks[id].providers.map((p) => p.id)))];
  const byLabel = new Map<string, ProviderId[]>();
  for (const id of ids) {
    const label = billingLabel(billingBases[id]);
    byLabel.set(label, [...(byLabel.get(label) ?? []), id]);
  }
  return [...byLabel].map(([label, group]) => `${nameList(group)}: ${label}`).join("; ");
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

${realisticLlms()}## Quick picks

${picks.join("\n")}
## Coming in the next update

Any snapshot or burst a chart marks as coming. Every result, cold start, SDK setup, snapshots, bursts and cost included, comes from the runs on our faster SDK (commit 1185278); Superserve now runs the same-machine track at 4 vCPU. Pause and resume are from the previous run (SDK a2316c3), because the new main runs skipped them. boxd is the exception: every boxd result, pause and resume included, comes from a full re-run on its New York region on Nov 4 (commit d8844f0). Daytona was re-collected on Oct 22 after its account quota was raised from 10 vCPU / 10 GiB; earlier Daytona numbers were limited by that quota. Upstash appears twice because Box (long-lived, can pause) and Ephemeral Box (short-lived, for one-off agent jobs) are separate products. A provider gets a second row only for a product it sells separately, not for a setting on the same product. Ephemeral Box has no pause, so it has no pause result. There is no overall cheapest pick: the cost pick is the lowest verified cost among eligible providers, and only a cost that is billed and settled, and not provisional, is eligible. Metered costs stay unreconciled until checked against the provider's settled charges, which none has been yet. Shown but not eligible yet: ${notEligibleSummary()}. Daytona settles up to 48 hours after a run. Freestyle and Tenki costs are list-price estimates on our measured sandbox lifetime, because neither has a billing API. Boat's is an estimate from its docs: its documented price on our measured sandbox lifetime, because its per-sandbox usage wasn't pulled for that run. Boat can't be a pick yet because no settled-charge source for Boat is available. Estimates are shown, never picked.${qualifierNotes()} Billing models: ${billingSummary()}. ${wholeMachineLabel}: ${perTaskLifetimeNote} A burst size is published only when all three bursts finished. Failures caused by our own code are set aside, not counted.

## Data

- [results.json](/results.json): both tracks. \`whatATaskCosts\` holds the realistic workloads (pilot): per track and workload the pick, its eligible set, lower costs that aren't eligible, and every provider's cost, kind, status and completion count; plus the idle test. Per provider: what we asked for and measured (allocation, equalSpec), cost per task with its kind (billed, metered, estimate), source and confidence, SDK-ready time, prices, regions and failures. Per metric: median, p95, attempts, failed and status. Start here.
- [results.md](/results.md): the same numbers as Markdown tables, one section per track.

## How to read it

${howToReadText()}

Prices cover compute only at list rates; disk, transfer, subscriptions and credits are excluded. Every call starts in Florida, so a provider hosted in Europe (Boat, in France) pays a transatlantic round trip per call. In the same-machine track, usable memory measured inside sits a little under 8 GB; equalSpec allows 7.6 to 8.4 GiB. Amounts are US dollars unless marked EUR.

## Metrics

${groups.map((g) => `- ${g.title}: ${g.ids.map((id) => `${tracks.default.metric(id).label} (\`${id}\`)`).join(", ")}`).join("\n")}
`;
}
