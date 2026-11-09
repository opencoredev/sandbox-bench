import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { buildRealistic, flagsOf as harnessFlags, prepareFailures, sourceName, workloadsFrom } from "../../scripts/realistic-site-data";
import { IdleChart, TaskCost } from "@/components/realistic";
import { StatStrip } from "@/components/stat-strip";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { billingBases, billingLabel } from "@/lib/cost";
import { tracks } from "@/lib/data";
import {
  SCHEMA,
  billingText,
  coverageGaps,
  headlineRows,
  holdStatuses,
  holdTag,
  idleGroups,
  idleOutcome,
  noCostReason,
  parseCoverage,
  parseRealistic,
  pickFor,
  pickLabels,
  pilotLine,
  profileIds,
  readFlag,
  runTracks,
  scopeLine,
  statusTag,
  taskPick,
  wilson,
} from "@/lib/realistic";
import type { Costed, HeldOpen, RealisticRow } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

// The realistic workloads (SBX-94, SBX-103): the data script, coverage, the schema, the pick rule and every export. Run with `bun test`.

const meter = "provisional: meter not reconciled with settled charges: pilot: no settled-charge reconciliation was run";

/** A small coverage: two providers, one workload and track, Upstash in the idle test. */
const coverage = {
  headline: { attempts: 5, providers: ["upstash", "boat"], profiles: ["fix-and-test"], tracks: ["same-machine"] },
  idle: { attempts: 3, profile: "fix-and-test", track: "same-machine", providers: ["upstash"], notTested: [{ provider: "boat", reason: "no per-sandbox billing" }] },
};

/** A harness summary row, as summary.json writes it. */
const summaryRow = (over: Record<string, unknown> = {}) => ({
  provider: "upstash",
  profile: "fix-and-test",
  track: "same-machine",
  variant: "headline",
  attempts: 5,
  completed: 5,
  incomplete: 0,
  notRun: 0,
  reasons: {},
  medianWallS: 92.1,
  medianCpuS: 216,
  costKind: "billed",
  costPerCompletedUSD: 0.012,
  costNote: null,
  wholeMachinePerCompletedUSD: 0.005,
  billingModel: "bills a fixed size per active hour",
  eligibility: "eligible",
  ...over,
});

const idleRows = (provider: string) => (["zero-wait", "held-10", "held-60"] as const).map((variant) => summaryRow({ provider, variant, attempts: 3, completed: 3, eligibility: "" }));
const heldEntry = (provider: string, idle: string, over: Record<string, unknown> = {}) => ({
  provider,
  idle,
  runs: 3,
  completed: 3,
  costKind: "billed",
  medianCostUSD: 0.016,
  changeVsZeroWait: null,
  status: "settled",
  medianWakeMs: 250,
  transitions: [],
  ...over,
});

const pick = (over: Record<string, unknown> = {}) => ({
  profile: "fix-and-test",
  track: "same-machine",
  verdict: "no-certified-winner",
  label: "no certified winner",
  lowest: "upstash",
  eligible: ["upstash"],
  lowerUnverified: [{ provider: "boat", costPerCompletedUSD: 0.001, reasons: [] }],
  didNotComplete: [],
  ...over,
});

const boatRow = summaryRow({ provider: "boat", costKind: "metered", costPerCompletedUSD: 0.001, eligibility: `unsettled (5 attempts); ${meter}` });

const summary = (over: Record<string, unknown> = {}) => ({
  generatedAt: "2026-11-09T00:00:00.000Z",
  fx: { eurToUsd: 1.08, date: "2026-11-05" },
  rows: [summaryRow(), boatRow, ...idleRows("upstash")],
  picks: [pick()],
  heldOpen: ["zero-wait", "held-10", "held-60"].map((idle) => heldEntry("upstash", idle)),
  dropped: [],
  ...over,
});

const build = (summaries: { name: string; raw: unknown }[], attempts: string[] = [], cov: unknown = coverage) =>
  buildRealistic({ summaries, coverage: cov, attempts, generatedAt: "2026-11-09T01:00:00.000Z" });

describe("data script", () => {
  test("reads a summary into the site's schema, with flags split from the eligibility text", () => {
    const d = build([{ name: "run/merged", raw: summary() }]);
    assert.equal(d.schema, SCHEMA);
    assert.equal(d.rows.length, 5);
    const boat = d.rows.find((r) => r.provider === "boat");
    assert.ok(boat);
    assert.equal(boat.eligible, false);
    assert.deepEqual(boat.flags, ["unsettled (5 attempts)", meter]);
    assert.deepEqual(d.sources, [{ name: "run/merged", generatedAt: "2026-11-09T00:00:00.000Z", providers: ["upstash", "boat"] }]);
    assert.deepEqual(harnessFlags("n/a"), []);
    assert.deepEqual(harnessFlags(""), []);
  });

  test("a later complete summary replaces every row of the providers it has, and adds new ones", () => {
    const withModal = { ...coverage, headline: { ...coverage.headline, providers: ["upstash", "boat", "modal"] }, idle: { ...coverage.idle, notTested: [...coverage.idle.notTested, { provider: "modal", reason: "later" }] } };
    const later = summary({
      rows: [summaryRow({ provider: "modal", costKind: "metered", costPerCompletedUSD: 0.02, eligibility: meter }), summaryRow({ provider: "boat", costKind: "metered", costPerCompletedUSD: 0.0005, eligibility: meter })],
      heldOpen: [],
      picks: [pick({ lowest: null, eligible: [], lowerUnverified: [] })],
    });
    const d = build([{ name: "a/merged", raw: summary() }, { name: "b/summary", raw: later }], [], withModal);
    assert.deepEqual([...new Set(d.rows.map((r) => r.provider))].sort(), ["boat", "modal", "upstash"]);
    assert.equal(d.rows.find((r) => r.provider === "boat")?.cost?.usdPerCompleted, 0.0005);
    assert.deepEqual(d.sources.map((s) => s.name), ["a/merged", "b/summary"]);
  });

  // The four inputs the code review found were published anyway.
  test("refuses a summary missing a provider's rows", () => {
    const noBoat = summary({ rows: [summaryRow(), ...idleRows("upstash")], picks: [pick({ lowerUnverified: [] })] });
    assert.throws(() => build([{ name: "x", raw: noBoat }]), /boat has no fix-and-test \/ same-machine headline row/);
  });

  test("refuses a headline row with a different run count, so the pilot label can't drift", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ rows: [summaryRow({ attempts: 4, completed: 4 }), boatRow, ...idleRows("upstash")] }) }]), /headline has 4 attempts, not 5/);
  });

  test("refuses a summary with no picks, or a missing pick", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [] }) }]), /has no pick for fix-and-test \/ same-machine/);
    const { picks: _p, ...noPicks } = summary();
    assert.throws(() => build([{ name: "x", raw: noPicks }]), /has no pick/);
  });

  test("refuses empty rows, empty held-open entries or empty picks", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ rows: [] }) }]), /has no rows/);
    assert.throws(() => build([{ name: "x", raw: summary({ heldOpen: [] }) }]), /upstash has no zero-wait held-open entry/);
    assert.throws(() => build([{ name: "x", raw: summary({ rows: [], heldOpen: [], picks: [] }) }]), /has no rows/);
  });

  test("a partial later summary replaces nothing", () => {
    const partial = summary({ rows: [summaryRow({ provider: "boat", costKind: "metered", costPerCompletedUSD: 0.0005, eligibility: meter, profile: "build" })], heldOpen: [], picks: [pick()] });
    assert.throws(() => build([{ name: "a", raw: summary() }, { name: "b", raw: partial }]), /b is incomplete for boat, so nothing was replaced/);
  });

  test("refuses a provider or row the coverage doesn't list", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ rows: [...summary().rows, summaryRow({ provider: "e2b" })] }) }]), /e2b, which isn't in the coverage file/);
  });

  test("stops when the summary's own pick disagrees with the site's rule", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [pick({ lowest: "boat" })] }) }]), /lowest eligible is boat/);
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [pick({ lowerUnverified: [] })] }) }]), /lower unverified/);
  });

  test("stops on a certified verdict, which the site can't show without intervals", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [pick({ verdict: "certified" })] }) }]), /isn't supported/);
  });

  test("stops when two summaries froze different exchange rates", () => {
    assert.throws(() => build([{ name: "a", raw: summary() }, { name: "b", raw: summary({ fx: { eurToUsd: 1.1, date: "2026-11-06" } }) }]), /EUR to USD/);
  });

  test("adds out-of-disk details from attempts, skipping dropped attempts, and checks the count", () => {
    const cov = { ...coverage, headline: { ...coverage.headline, providers: ["upstash", "boat", "superserve"] }, idle: { ...coverage.idle, notTested: [...coverage.idle.notTested, { provider: "superserve", reason: "x" }] } };
    const attempt = (id: string, free: number) =>
      JSON.stringify({ attemptId: id, provider: "superserve", profile: "fix-and-test", track: "same-machine", variant: "headline", completion: { kind: "incomplete", reason: "prepare-failed", detail: JSON.stringify({ kind: "insufficient-disk", freeGiB: free, requiredGiB: 4 }) } });
    const failing = summaryRow({ provider: "superserve", completed: 0, incomplete: 5, reasons: { "prepare-failed": 5 }, costPerCompletedUSD: null, medianWallS: null, wholeMachinePerCompletedUSD: null, eligibility: "did not complete; 5 incomplete runs (at most 1)" });
    const raw = summary({ rows: [...summary().rows, failing], dropped: [{ attemptId: "old" }] });
    const five = ["a1", "a2", "a3", "a4", "a5"].map((id, i) => attempt(id, 1.5 - i * 0.01));
    const d = build([{ name: "x", raw }], [...five, attempt("old", 0.1)], cov);
    const row = d.rows.find((r) => r.provider === "superserve");
    assert.ok(row);
    assert.deepEqual(row.prepare, { kind: "insufficient-disk", freeGiB: 1.46, requiredGiB: 4, runs: 5 });
    assert.equal(noCostReason(row), "not enough free disk to start: 1.46 GiB free, 4 GiB needed");
    assert.throws(() => build([{ name: "x", raw }], five.slice(0, 1), cov), /attempts files show 1/);
    assert.equal(prepareFailures([attempt("old", 1)], new Set(["old"])).size, 0);
  });

  test("reads workload footprints from the manifest", () => {
    const run = (cpu: number, peak: number, anon: number) => ({ work: { cpuS: cpu }, memoryPeakGiB: peak, anonPeakGiBSampled: anon });
    const w = workloadsFrom({
      profiles: {
        "fix-and-test": { repo: "r", commit: "c", referenceFootprint: { runs: [run(175, 2.4, 1.4), run(204, 2.5, 1.5)] }, completionChecks: { afterPatchB: { tests: { passed: 4028 } } } },
        build: { repo: "j", commit: "k", referenceFootprint: { runs: [run(170, 8, 4.8), run(162, 8, 5.6)] } },
      },
    });
    assert.deepEqual(w["fix-and-test"], { repo: "r", commit: "c", workCpuS: { min: 175, max: 204 }, memoryGiB: { min: 2.4, max: 2.5 }, tests: 4028 });
    assert.deepEqual(w.build.memoryGiB, { min: 4.8, max: 5.6 });
    assert.equal(w.build.tests, null);
  });

  test("names a source by its run folder, without the home directory", () => {
    assert.equal(sourceName("/home/x/agents/provider-runs/sbx103-vercel/merged/summary.json"), "sbx103-vercel/merged");
  });
});

describe("coverage", () => {
  test("the coverage file reads, and every headline provider is in the idle test or says why not", () => {
    const file: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../scripts/realistic-coverage.json"), "utf8"));
    const c = parseCoverage(file);
    assert.deepEqual(c, realistic.coverage, "src/data/realistic.json was built from a different coverage file; rerun the script");
    assert.throws(() => parseCoverage({ ...coverage, idle: { ...coverage.idle, notTested: [] } }), /must test boat or say why not/);
  });

  test("the committed data is complete against its coverage", () => {
    assert.deepEqual(coverageGaps(realistic.coverage, realistic.rows, realistic.heldOpen), []);
  });
});

describe("schema", () => {
  const file = () => structuredClone(JSON.parse(JSON.stringify(realistic))) as Record<string, unknown> & { rows: Record<string, unknown>[] };

  test("the committed data parses", () => {
    assert.equal(parseRealistic(JSON.parse(JSON.stringify(realistic))).rows.length, realistic.rows.length);
  });

  test("rejects a wrong schema, counts that don't add up, an eligible row with flags, duplicate and missing rows", () => {
    assert.throws(() => parseRealistic({ ...file(), schema: "realistic-site/0" }), /schema/);
    const bad = file();
    const [first] = bad.rows;
    assert.ok(first);
    bad.rows[0] = { ...first, completed: 99 };
    assert.throws(() => parseRealistic(bad), /add up to attempts/);
    const flagged = file();
    const eligible = flagged.rows.find((r) => r.eligible === true);
    assert.ok(eligible);
    eligible.flags = ["unsettled"];
    assert.throws(() => parseRealistic(flagged), /no flags/);
    const twice = file();
    twice.rows = [...twice.rows, ...twice.rows.slice(0, 1)];
    assert.throws(() => parseRealistic(twice), /twice/);
    const missing = file();
    missing.rows = missing.rows.filter((r) => r.provider !== "vercel");
    assert.throws(() => parseRealistic(missing), /vercel has no/);
  });

  test("the pilot line prints the run count every headline row was checked against", () => {
    assert.match(pilotLine(realistic), new RegExp(`^Pilot: ${realistic.coverage.headline.attempts} runs per provider`));
    assert.ok(realistic.rows.filter((r) => r.variant === "headline").every((r) => r.attempts === realistic.coverage.headline.attempts));
  });

  test("an unknown held-open status stops the build instead of being guessed", () => {
    const f = structuredClone(JSON.parse(JSON.stringify(realistic))) as Record<string, unknown> & { heldOpen: Record<string, unknown>[] };
    const [h] = f.heldOpen;
    assert.ok(h);
    h.status = "refunded";
    assert.throws(() => parseRealistic(f), /isn't a status this site can read/);
  });
});

describe("statuses and billing", () => {
  test("each harness reason reads as an eligibility-table status or a qualifier", () => {
    assert.equal(readFlag("unsettled (5 attempts)").status, "unsettled");
    assert.equal(readFlag(meter).status, "unreconciled");
    assert.equal(readFlag(meter).text, "its usage meter hasn't been checked against settled charges yet");
    assert.equal(readFlag("provisional: storage coverage of the billing source unknown").status, "provisional");
    assert.equal(readFlag("unverified estimate: missing rules-confirmed-in-writing and isolated-window-reconciliation").status, "estimate");
    assert.equal(readFlag("wrong machine size: 15.64040756225586 GiB memory, not within 10% of 8 GiB").text, "it ran with 15.6 GiB of memory, not the 8 GiB this track asks for");
    assert.equal(readFlag("3 incomplete runs (at most 1)").short, "too many failures");
    assert.deepEqual(readFlag("something new"), { status: null, short: "not eligible", text: "something new" });
  });

  test("tags use the cost charts' words: kind, then statuses, then qualifiers", () => {
    const row = (kind: "billed" | "metered" | "estimate", eligible: boolean, flags: string[]) => ({ cost: { kind, usdPerCompleted: 1, wholeMachineUsdPerCompleted: null }, eligible, flags });
    assert.equal(statusTag(row("billed", true, [])), "billed, verified");
    assert.equal(statusTag(row("metered", false, ["unsettled (5 attempts)", meter])), "metered, unsettled, unreconciled");
    assert.equal(statusTag(row("estimate", false, ["unverified estimate: x"])), "estimate");
    assert.equal(statusTag(row("metered", false, [meter, "wrong machine size: 15.6 GiB memory"])), "metered, unreconciled, wrong size");
    for (const r of realistic.rows.filter((x) => x.cost !== null)) assert.match(statusTag(r), /^(billed|metered|estimate)\b/);
  });

  test("held-open statuses read into the same words", () => {
    assert.deepEqual(holdStatuses("settled"), []);
    assert.deepEqual(holdStatuses("unsettled; metered, unreconciled (provisional)"), ["unsettled", "unreconciled"]);
    assert.equal(holdTag({ costKind: "billed", statuses: [] }), "billed, verified");
    assert.equal(holdTag({ costKind: "metered", statuses: ["unreconciled"] }), "metered, unreconciled");
    assert.equal(holdStatuses("refunded"), null);
  });

  test("billing comes from the site's one table, so both Upstash products read the same", () => {
    assert.equal(billingText("upstash"), billingLabel(billingBases.upstash));
    assert.equal(billingText("upstash"), billingText("upstash-ephemeral"));
    const md = agentMarkdown();
    assert.doesNotMatch(md, /bills a fixed size per active hour/);
    const exported = agentData().whatATaskCosts.tracks["same-spec"]?.workloads["fix-and-test"].providers ?? [];
    for (const p of exported) assert.equal(p.billing, billingLabel(billingBases[p.provider]));
  });

  test("Wilson interval of 5 of 5 is about 57 to 100%", () => {
    const w = wilson(5, 5);
    assert.ok(Math.abs(w.low - 0.566) < 0.002);
    assert.equal(w.high, 1);
  });

  test("the cost scope names only what the data has, and says what isn't measured", () => {
    const line = scopeLine(realistic);
    assert.match(line, /compute, memory, disk and standby storage/);
    assert.match(line, /Upstash Box's billing leaves disk out, so disk is added at list price/);
    assert.match(line, /For (Daytona and Upstash Ephemeral Box|Upstash Ephemeral Box and Daytona) it isn't known whether the billing source includes disk/);
    assert.match(line, /snapshots after deletion and data transfer are outside the task cost; this pilot doesn't measure them/);
  });
});

const costed = (provider: Costed["provider"], usd: number, eligible: boolean, over: Partial<Omit<RealisticRow, "cost">> = {}): Costed => ({
  provider,
  profile: "fix-and-test",
  track: "same-machine",
  variant: "headline",
  attempts: 5,
  completed: 5,
  incomplete: 0,
  notRun: 0,
  reasons: [],
  prepare: null,
  medianWallS: 90,
  medianCpuS: 200,
  cost: { kind: eligible ? "billed" : "metered", usdPerCompleted: usd, wholeMachineUsdPerCompleted: null },
  costNote: null,
  eligible,
  flags: eligible ? [] : [meter],
  ...over,
});

describe("pick", () => {
  test("one eligible provider: the only verified cost, with every lower one that isn't eligible", () => {
    const p = taskPick([costed("upstash", 0.012, true), costed("boat", 0.001, false), costed("vercel", 0.014, false)]);
    assert.equal(p.kind, "verified");
    if (p.kind !== "verified") return;
    assert.equal(p.label, pickLabels.only);
    assert.equal(p.pick.provider, "upstash");
    assert.deepEqual(p.lower.map((r) => r.provider), ["boat"]);
  });

  test("two eligible providers: the lowest verified cost, and the eligible set", () => {
    const p = taskPick([costed("upstash", 0.012, true), costed("daytona", 0.01, true), costed("boat", 0.001, false)]);
    assert.ok(p.kind === "verified");
    assert.equal(p.label, pickLabels.lowest);
    assert.equal(p.pick.provider, "daytona");
    assert.deepEqual(p.eligible, ["daytona", "upstash"]);
  });

  test("more than one incomplete run can't be a pick, whatever the flags say", () => {
    assert.equal(taskPick([costed("upstash", 0.012, true, { completed: 3, incomplete: 2 })]).kind, "none");
  });

  test("nothing eligible: no clear winner, every cost listed", () => {
    const p = taskPick([costed("boat", 0.001, false), costed("e2b", 0.01, false)]);
    assert.ok(p.kind === "none");
    assert.equal(p.label, pickLabels.none);
    assert.deepEqual(p.lower.map((r) => r.provider), ["boat", "e2b"]);
    assert.equal(taskPick([]).kind, "empty");
  });

  test("every pick in the data is eligible, and every lower cost is cheaper and not eligible", () => {
    for (const track of runTracks)
      for (const profile of profileIds) {
        const p = pickFor(realistic, track, profile);
        if (p.kind !== "verified") continue;
        assert.ok(p.pick.eligible && p.pick.incomplete <= 1);
        for (const r of p.lower) assert.ok(!r.eligible && r.cost.usdPerCompleted < p.pick.cost.usdPerCompleted);
      }
  });

  test("providers with no completed task are kept apart, never costed as zero", () => {
    for (const track of runTracks)
      for (const profile of profileIds) {
        const { costed: c, uncosted } = headlineRows(realistic, track, profile);
        assert.ok(c.every((r) => r.cost.usdPerCompleted > 0));
        assert.ok(uncosted.every((r) => r.cost === null && noCostReason(r).length > 0));
      }
  });
});

describe("idle", () => {
  const held = (provider: "boat" | "upstash", idle: "zero-wait" | "held-10" | "held-60", completed: number, transitions: string[], usd: number): HeldOpen => ({
    provider,
    idle,
    runs: 3,
    completed,
    costKind: "metered",
    medianCostUsd: usd,
    changeVsZeroWait: null,
    status: "settled",
    statuses: [],
    medianWakeMs: 100,
    transitions,
  });

  test("a stop while idle is named, and a failed resume without one is said apart", () => {
    const groups = idleGroups({
      ...realistic,
      heldOpen: [held("boat", "zero-wait", 3, [], 0.001), held("boat", "held-60", 0, ["running -> stopped"], 0.03), held("upstash", "zero-wait", 3, [], 0.01), held("upstash", "held-60", 0, [], 0.012)],
    });
    const boat = groups.find((g) => g.provider === "boat");
    const upstash = groups.find((g) => g.provider === "upstash");
    assert.ok(boat && upstash);
    assert.match(idleOutcome(boat) ?? "", /^stopped the sandbox during the hour, so the work couldn't resume \(0 of 3 resumed\)$/);
    assert.match(idleOutcome(upstash) ?? "", /resume step failed after the hour in all 3 runs, with no stop reported/);
    assert.deepEqual(groups.map((g) => g.provider), ["upstash", "boat"]);
  });

  test("a provider whose billing may leave disk out stays provisional in the idle test, as on the cost charts", () => {
    const eph = idleGroups(realistic).find((g) => g.provider === "upstash-ephemeral");
    assert.ok(eph);
    for (const p of eph.points) assert.equal(holdTag(p), "billed, provisional");
  });
});

describe("exports", () => {
  test("results.json carries the realistic results for both tracks and both workloads, uncertified", () => {
    const d = agentData().whatATaskCosts;
    assert.equal(d.pilot, pilotLine(realistic));
    assert.equal(d.runsPerProvider, realistic.coverage.headline.attempts);
    assert.equal(d.costScope, scopeLine(realistic));
    for (const track of ["same-spec", "default"] as const)
      for (const profile of profileIds) {
        const w = d.tracks[track]?.workloads[profile];
        assert.ok(w, `${track} ${profile}`);
        assert.equal(w.pick.certified, false);
        assert.ok(w.providers.every((p) => p.kind === null || ["billed", "metered", "estimate"].includes(p.kind)));
        assert.ok(w.pick.lowerNotEligible.every((r) => r.whyNotEligible.length > 0));
      }
    assert.ok(d.idle.providers.length > 0);
    for (const g of d.idle.providers) for (const w of g.waits) assert.match(w.status, /^(billed|metered|estimate), /);
  });

  test("every export names the providers left out of the idle test, with why", () => {
    const d = agentData().whatATaskCosts;
    assert.deepEqual(d.idle.notTested.map((n) => n.provider), realistic.coverage.idle.notTested.map((n) => n.provider));
    const md = agentMarkdown();
    const llms = llmsTxt();
    for (const n of realistic.coverage.idle.notTested) {
      assert.ok(md.includes(n.reason), `results.md misses ${n.provider}`);
      assert.ok(llms.includes(n.reason), `llms.txt misses ${n.provider}`);
    }
  });

  test("llms.txt and results.md carry the pilot line, scope, kinds and statuses, and no single cheapest", () => {
    const llms = llmsTxt();
    const md = agentMarkdown();
    for (const text of [llms, md]) {
      assert.ok(text.includes(pilotLine(realistic)));
      assert.ok(text.includes(scopeLine(realistic)));
      assert.ok(text.includes("What a task costs"));
      assert.match(text, /billed, verified/);
      assert.match(text, /metered, unreconciled/);
    }
    assert.match(md, /\| Kind and status \| Change vs no wait \|/);
    const section = llms.slice(llms.indexOf("## What a task costs"), llms.indexOf("## Quick picks"));
    assert.doesNotMatch(section.replace("There is no overall cheapest", ""), /cheapest/i);
    assert.match(section, /No certified winner/);
  });

  test("the quick task's pick says it is the quick task", () => {
    const needs = agentData().tracks["same-spec"]?.quickPicks.map((q) => q.need) ?? [];
    assert.ok(needs.some((n) => n.startsWith("Quick task: ")));
  });
});

describe("page", () => {
  test("each workload tab shows its pick, one line on lower costs, and why providers are missing", () => {
    const html = renderToStaticMarkup(<TaskCost track={tracks.default} />);
    assert.match(html, /Fix and test: cost per 1,000 completed tasks/);
    assert.match(html, /Build: cost per 1,000 completed tasks/);
    assert.match(html, /No certified winner/);
    assert.match(html, /lower reported costs? (is|are) unverified or ineligible; reasons below/);
    assert.doesNotMatch(html, /Lower but not eligible/);
    assert.match(html, /Not in the chart:/);
    assert.match(html, /default machine is too small for this workload/);
    assert.doesNotMatch(html.replaceAll("There is no overall cheapest", ""), /cheapest/i);
  });

  test("the idle chart says its run count and scope, names who stopped, and isn't ranked", () => {
    const html = renderToStaticMarkup(<IdleChart />);
    assert.match(html, /What leaving the sandbox open costs/);
    assert.match(html, new RegExp(`${realistic.coverage.idle.attempts} runs per provider and wait\\. Median total cost of fix, wait and resume, failed attempts included, per 1,000`));
    assert.doesNotMatch(html, /Lower is better/);
    assert.match(html, /couldn&#x27;t resume/);
    assert.match(html, /Not in this test:/);
    assert.match(html, /billed, verified|metered, unreconciled/);
  });

  test("the stat card shows the pick's kind and status, and the pilot label outside the clamped line", () => {
    const html = renderToStaticMarkup(<StatStrip track={tracks["same-spec"]} />);
    assert.match(html, /Fix and test, per 1,000/);
    assert.match(html, /billed, verified/);
    assert.match(html, /<span class="text-xs text-pretty text-neutral-7">Pilot · 5 runs · lower unverified costs exist<\/span>/);
  });
});
