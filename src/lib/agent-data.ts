import { TASKS_PER_PRICE, costBasis, costKinds, formatPerThousand, formatTaskCost, isPriced } from "@/lib/cost";
import { hasResults, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Metric, Track, TrackId } from "@/lib/data";
import { formatPercent, formatValue } from "@/lib/format";
import { chipBasisLabel, hardware, probeDate } from "@/lib/hardware";
import { commonPrice, commonSize, eurUsd, usdPrice } from "@/lib/fx";
import { absentNote, allocationNotes, measuredText, noRealPause, requestedText } from "@/lib/notes";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
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
const stopped = "stopped-early: our run was stopped early, so nothing is counted against it; coming in the next update";
const notYet = "not-run: not run yet; coming in the next update";
const daytonaSnapshotQuota = "not-run: our Daytona account's 10 vCPU quota kept its 4 vCPU snapshot tests from running";
export const notRun: Record<TrackId, Partial<Record<string, Partial<Record<ProviderId, string>>>>> = {
  default: {
    "burst-25": {
      boxd: "stopped-early: one of its three bursts of 25 was cut short by our own ownership check (16 creates and 5 deletes failed on our side), so it is not counted; coming in the next update",
      upstash: "stopped-early: two of its three bursts of 25 never started, because our harness still had two of its own sandboxes open and Upstash's 25-sandbox account cap left no room; not counted; coming in the next update",
      daytona: "not-run: our Daytona account's 10 vCPU quota can't hold 25 sandboxes at once",
    },
  },
  "same-spec": {
    snapshot: { boxd: stopped, upstash: stopped, daytona: daytonaSnapshotQuota },
    "create-from-snapshot": { boxd: stopped, upstash: stopped, daytona: daytonaSnapshotQuota },
    "burst-10": {
      freestyle: stopped,
      boxd: stopped,
      upstash: stopped,
      tenki: notYet,
      daytona: "not-run: our Daytona account's 10 vCPU quota can't hold ten 4 vCPU sandboxes at once",
    },
    "burst-25": {
      e2b: stopped,
      freestyle: stopped,
      boxd: stopped,
      upstash: stopped,
      tenki: notYet,
      daytona: "not-run: our Daytona account's 10 vCPU quota can't hold 25 4 vCPU sandboxes at once",
    },
  },
};

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

/** Who wins each common question in one track, straight from the data. */
export function quickPicks(track: Track) {
  const name = (id: ProviderId) => providerName(id);
  // Format from the raw medians, not the rounded export, so picks match the page exactly.
  const timed = (id: string, label: string) => {
    const m = track.metric(id);
    const ranked = new Set(results(track, m).filter((r) => r.status === "measured" && r.median !== null).map((r) => r.provider));
    const [a, b] = m.values
      .filter((v) => ranked.has(v.provider) && v.p50 !== null)
      .sort((x, y) => (m.better === "lower" ? 1 : -1) * ((x.p50 ?? 0) - (y.p50 ?? 0)));
    const cell = (v: typeof a) => (v ? `${name(v.provider)} ${formatValue(v.p50 ?? 0, m.unit)}` : "n/a");
    return { need: label, pick: cell(a), runnerUp: cell(b) };
  };
  const pair = <T,>(xs: T[], f: (x: T) => string) => ({ pick: xs[0] ? f(xs[0]) : "n/a", runnerUp: xs[1] ? f(xs[1]) : "n/a" });
  const cheapest = track.providers
    .flatMap((p) => {
      const c = track.costs[p.id];
      return c && isPriced(c) ? [{ p, c }] : [];
    })
    .sort((a, b) => a.c.usd - b.c.usd);
  const reliable = track.providers.map((p) => ({ p, rate: successRate(track, p).rate ?? 0 })).sort((a, b) => b.rate - a.rate);
  const top = reliable.filter((x) => x.rate === reliable[0]?.rate);
  const rest = reliable.slice(top.length);
  const picks = [
    timed("cold", "Fastest cold start"),
    timed("tool-replay", "Fastest agent work (tool replay)"),
    timed("burst-25", "Fastest 25-sandbox fan-out"),
    timed("reconnect", "Fastest reconnect"),
    { need: "Cheapest task", ...pair(cheapest, (x) => `${name(x.p.id)} ${formatTaskCost(x.c.usd)} per task, ${formatPerThousand(x.c.usd)} per 1,000 (${costKinds[x.c.kind].label.toLowerCase()})`) },
    {
      need: "Most reliable",
      // Several providers can share the top rate; name every one of them.
      pick: top.length ? `${top.map((x) => name(x.p.id)).join(", ")} ${formatPercent(top[0]?.rate ?? 0, 2)}${top.length > 1 ? " (tied)" : ""}` : "n/a",
      runnerUp: rest[0] ? `${name(rest[0].p.id)} ${formatPercent(rest[0].rate, 2)}` : "n/a",
    },
  ];
  // Picks with no data in this release (bursts, cost per task) are left out rather than shown as n/a.
  return picks.filter((q) => q.pick !== "n/a");
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

/** The hardware probe's findings, with how sure each one is. */
function hardwareOf(id: ProviderId) {
  const h = hardware[id];
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
    case "estimate":
      return { kind: c.kind, perTaskUsd: roundCost(c.usd), per1000TasksUsd: roundCost(c.usd * TASKS_PER_PRICE), confidence: c.confidence, tasks: c.n, source: c.source, basis: costBasis(c) };
    case "none":
      return { kind: c.kind, perTaskUsd: null, note: c.why };
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
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
      const sdk = track.sdkReady[p.id];
      return {
        id: p.id,
        name: providerName(p.id),
        allocation: allocationOf(p),
        allocationNote: notes[p.id] ?? (track.id === "default" ? advertised[p.id].note : null),
        advertisedDefault: track.id === "default" ? { ...sizeOf(p), source: advertised[p.id].source } : null,
        ranIn: p.hardware?.location[0]?.value ?? null,
        cpu: p.hardware?.cpuModels[0]?.value ?? null,
        hardware: hardwareOf(p.id),
        sdkReady: sdk ? { median: round(sdk.p50), p95: round(sdk.p95), sdkSetupMedian: round(sdk.setupP50), coldStarts: sdk.n } : null,
        costPerTask: costOf(track, p.id),
        price: {
          currency: p.currency,
          perHour: round(p.hourly),
          perVcpuHour: round(p.perVcpuHour),
          perHourUsd: round(usdPrice(p, "hourly")?.usd ?? null),
          commonSizeUsd: round(commonPrice(p)?.usd ?? null),
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
    metrics: groups.flatMap((g) =>
      g.ids.map((id) => {
        const m = track.metric(id);
        return { id, group: g.title, label: m.label, unit: m.unit, better: m.better, results: results(track, m) };
      }),
    ),
  };
}

const about =
  "Sandbox bench: cloud sandbox providers for AI agents, timed through one SDK (Sandbox SDK, built by us; 0.2.0 is public on npm and the 1.0 used here will be published soon) from one server in Florida, US, on two tracks: each provider's default machine, and the same 4 vCPU, 8 GB machine. Medians, p95s and 95% confidence intervals per provider; every provider-side failure kept, failures caused by our own code set aside.";

const howToRead =
  "Pick a track first: `tracks.default` compares each provider's default sandbox, so sizes differ; `tracks[\"same-spec\"]` asks every provider for 4 vCPU and 8 GB. In same-spec, `allocation.equalSpec: false` means the machine measured inside was not 4 vCPU, 8 GB, so compare that provider with care. median and p95 are in `unit`; `better` says which direction wins; results are sorted best first. attempts counts every try, failed included. A null median means the provider does not support the test, every attempt failed, or the result is excluded (see `status`). Cold start is the provider's own time, create() until the first command; `sdkReady` adds our SDK's setup and is ours, not the provider's. `costPerTask.kind` is billed (provider charge), metered (provider usage at published rates) or estimate (list price, where billing gives no amount); a task is one sandbox that is created, runs the 100-call tool replay and is deleted, from a separate cost run: never compare them as if they were the same kind without saying so.";

/** Everything on the page as one JSON document, both tracks, for agents and scripts. */
export function agentData() {
  return {
    about,
    howToRead,
    task: "A task is: create a sandbox, run the 100-call tool replay, delete it. Cost per task comes from a separate cost run, billed per sandbox.",
    commonSize: commonSize.label,
    comingNextUpdate: ["Boat", "Snapshot and restore", "Bursts of 10 and 25", "The same-machine (4 vCPU, 8 GB) track"],
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
    "## Machines and cost",
    "",
    "| Provider | Asked for | Measured inside | 4 vCPU, 8 GB? | Ran in | Cost per task | Per 1,000 tasks | Cost kind | Price per hour | Success rate |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...d.providers.map(
      (p) =>
        `| ${p.name} | ${p.allocation.requested.text} | ${p.allocation.measuredText ?? "not measured"} | ${p.allocation.equalSpec ? "yes" : "no"} | ${p.ranIn ?? "not reported"} | ${p.costPerTask.perTaskUsd === null ? "n/a" : formatTaskCost(p.costPerTask.perTaskUsd)} | ${p.costPerTask.perTaskUsd === null ? "n/a" : formatPerThousand(p.costPerTask.perTaskUsd)} | ${p.costPerTask.kind} | ${p.price.perHourUsd === null ? "n/a" : `$${p.price.perHourUsd}${p.price.currency === "EUR" ? ` (EUR ${p.price.perHour})` : ""}`} | ${p.reliability.successRate === null ? "n/a" : `${(p.reliability.successRate * 100).toFixed(2)}%`} |`,
    ),
    "",
    ...d.providers.flatMap((p) => (p.allocationNote ? [`Machine note on ${p.name}: ${p.allocationNote}`, ""] : [])),
    ...d.providers.flatMap((p) => ("basis" in p.costPerTask ? [`Cost on ${p.name}: ${p.costPerTask.basis}.`] : [`Cost on ${p.name}: none (${"note" in p.costPerTask ? p.costPerTask.note : ""}).`])),
    "",
  );
  const sdk = d.providers.filter((p) => p.sdkReady);
  if (sdk.length) {
    lines.push("## Ready through Sandbox SDK", "", "Cold start plus our SDK's setup. The setup is ours, not the provider's.", "", "| Provider | Ready through SDK, median | Our SDK setup, median |", "| --- | --- | --- |");
    for (const p of sdk) lines.push(`| ${p.name} | ${cell(p.sdkReady?.median ?? null, { unit: "s" })} | ${cell(p.sdkReady?.sdkSetupMedian ?? null, { unit: "s" })} |`);
    lines.push("");
  }
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

/** The same results as Markdown tables, one section per track, one table per metric, best first. */
export function agentMarkdown() {
  const lines = [
    "# Sandbox bench results",
    "",
    about,
    "",
    "JSON: /results.json. Guide: /llms.txt.",
    "",
    howToRead,
    "",
    "A task is: create a sandbox, run the 100-call tool replay, delete it, priced from a separate cost run. Prices cover compute only; disk, transfer, subscriptions and credits are excluded. boxd bills in euros, converted at the ECB rate.",
    "",
    ...trackIds.flatMap(trackMarkdown),
  ];
  return `${lines.join("\n")}\n`;
}

/** The llms.txt guide: what the site is and where agents find each piece. */
export function llmsTxt() {
  const picks = trackIds.flatMap((id) => {
    const t = tracks[id];
    return hasResults(t) ? [`### ${trackInfo[id].label}`, "", ...quickPicks(t).map((q) => `- ${q.need}: ${q.pick} (runner-up ${q.runnerUp})`), ""] : [`### ${trackInfo[id].label}`, "", "No results published yet.", ""];
  });
  const names = [...new Set(trackIds.flatMap((id) => tracks[id].providers.map((p) => p.id)))];
  return `# Sandbox bench

> ${about}

Providers (id → name): ${names.map((id) => `${id} → ${providerName(id)}`).join(", ")}.

## Tracks

${trackIds.map((id) => `- \`${id}\`: ${trackInfo[id].label}. ${trackInfo[id].description}${tracks[id].absent.length ? ` ${tracks[id].absent.map((a) => `${providerName(a)} is ${absentNote(tracks[id], a)}`).join(" ")}` : ""}`).join("\n")}

The page shows one track at a time: \`/?track=same-spec\` opens the same-machine track.

## Quick picks

${picks.join("\n")}
## Coming in the next update

Boat, and any snapshot or burst a chart marks as coming. Default-machine timings come from one run on one harness commit. Snapshots, bursts, the same-machine track and cost per task come from runs on a later harness commit whose changes only touched cleanup. Tenki's same-machine run stopped early at 78 of 100 cold starts; each chart shows its attempt count. A burst size is published for a provider only when all three of its bursts finished, and a chart names the reason for any provider it leaves out. Failures caused by our own code are set aside, not counted. Boat will be added in the next update.

## Data

- [results.json](/results.json): both tracks. Per provider: what we asked for and measured (allocation, equalSpec), cost per task with its kind (billed, metered, estimate), source and confidence, SDK-ready time, prices, regions and failures. Per metric: median, p95, attempts, failed and status. Start here.
- [results.md](/results.md): the same numbers as Markdown tables, one section per track.

## How to read it

${howToRead}

Prices cover compute only at list rates; disk, transfer, subscriptions and credits are excluded. Every call starts in Florida, so providers hosted in Europe (Boat in France, boxd in Germany) pay a transatlantic round trip per call. In the same-machine track, usable memory measured inside sits a little under 8 GB; equalSpec allows 7.6 to 8.4 GiB. Amounts are US dollars unless marked EUR.

## Metrics

${groups.map((g) => `- ${g.title}: ${g.ids.map((id) => `${tracks.default.metric(id).label} (\`${id}\`)`).join(", ")}`).join("\n")}
`;
}
