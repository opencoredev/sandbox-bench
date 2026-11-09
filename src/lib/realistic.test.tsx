import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { buildRealistic, flagsOf as harnessFlags, prepareFailures, sourceName, workloadsFrom } from "../../scripts/realistic-site-data";
import { IdleChart, TaskCost } from "@/components/realistic";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { tracks } from "@/lib/data";
import {
  SCHEMA,
  headlineRows,
  idleGroups,
  idleOutcome,
  noCostReason,
  parseRealistic,
  pickFor,
  pickLabels,
  pilotLine,
  profileIds,
  readFlag,
  runTracks,
  statusTag,
  taskPick,
  wilson,
} from "@/lib/realistic";
import type { Costed, RealisticRow } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

// The realistic workloads (SBX-94, SBX-103): the data script, the schema, the pick rule and every export. Run with `bun test`.

const meter = "provisional: meter not reconciled with settled charges: pilot: no settled-charge reconciliation was run";

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

const summary = (over: Record<string, unknown> = {}) => ({
  generatedAt: "2026-11-09T00:00:00.000Z",
  fx: { eurToUsd: 1.08, date: "2026-11-05" },
  rows: [summaryRow(), summaryRow({ provider: "boat", costKind: "metered", costPerCompletedUSD: 0.001, eligibility: `unsettled (5 attempts); ${meter}` })],
  picks: [pick()],
  heldOpen: [],
  dropped: [],
  ...over,
});

const build = (summaries: { name: string; raw: unknown }[], attempts: string[] = []) => buildRealistic({ summaries, attempts, generatedAt: "2026-11-09T01:00:00.000Z" });

describe("data script", () => {
  test("reads a summary into the site's schema, with flags split from the eligibility text", () => {
    const d = build([{ name: "run/merged", raw: summary() }]);
    assert.equal(d.schema, SCHEMA);
    assert.equal(d.rows.length, 2);
    const boat = d.rows.find((r) => r.provider === "boat");
    assert.ok(boat);
    assert.equal(boat.eligible, false);
    assert.deepEqual(boat.flags, ["unsettled (5 attempts)", meter]);
    assert.deepEqual(d.sources, [{ name: "run/merged", generatedAt: "2026-11-09T00:00:00.000Z", providers: ["upstash", "boat"] }]);
    assert.deepEqual(harnessFlags("n/a"), []);
    assert.deepEqual(harnessFlags(""), []);
  });

  test("a later summary replaces every row of the providers it has, and adds new ones", () => {
    const modal = summary({
      rows: [summaryRow({ provider: "modal", costKind: "metered", costPerCompletedUSD: 0.02, eligibility: meter }), summaryRow({ provider: "boat", costKind: "metered", costPerCompletedUSD: 0.0005, eligibility: meter })],
      picks: [],
    });
    const d = build([
      { name: "a/merged", raw: summary() },
      { name: "b/summary", raw: modal },
    ]);
    assert.deepEqual(d.rows.map((r) => r.provider).sort(), ["boat", "modal", "upstash"]);
    assert.equal(d.rows.find((r) => r.provider === "boat")?.cost?.usdPerCompleted, 0.0005);
    assert.deepEqual(d.sources.map((s) => s.name), ["a/merged", "b/summary"]);
  });

  test("stops when the summary's own pick disagrees with the site's rule", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [pick({ lowest: "boat" })] }) }]), /lowest eligible is boat/);
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [pick({ lowerUnverified: [] })] }) }]), /lower unverified/);
  });

  test("stops on a certified verdict, which the site can't show without intervals", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ picks: [pick({ verdict: "certified" })] }) }]), /isn't supported/);
  });

  test("stops when two summaries froze different exchange rates", () => {
    assert.throws(() => build([{ name: "a", raw: summary() }, { name: "b", raw: summary({ fx: { eurToUsd: 1.1, date: "2026-11-06" }, picks: [] }) }]), /EUR to USD/);
  });

  test("stops on an unknown provider, so a new one is registered first", () => {
    assert.throws(() => build([{ name: "x", raw: summary({ rows: [summaryRow({ provider: "nimbus" })], picks: [] }) }]), /unknown provider "nimbus"/);
  });

  test("adds out-of-disk details from attempts, skipping dropped attempts, and checks the count", () => {
    const attempt = (id: string, free: number) =>
      JSON.stringify({ attemptId: id, provider: "superserve", profile: "build", track: "same-machine", variant: "headline", completion: { kind: "incomplete", reason: "prepare-failed", detail: JSON.stringify({ kind: "insufficient-disk", freeGiB: free, requiredGiB: 4 }) } });
    const failing = summaryRow({ provider: "superserve", profile: "build", attempts: 2, completed: 0, incomplete: 2, reasons: { "prepare-failed": 2 }, costPerCompletedUSD: null, medianWallS: null, wholeMachinePerCompletedUSD: null, eligibility: "did not complete; 2 incomplete runs (at most 1)" });
    const raw = summary({ rows: [failing], picks: [], dropped: [{ attemptId: "old" }] });
    const d = build([{ name: "x", raw }], [attempt("a1", 1.5), attempt("a2", 1.4), attempt("old", 0.1)]);
    const row = d.rows[0];
    assert.ok(row);
    assert.deepEqual(row.prepare, { kind: "insufficient-disk", freeGiB: 1.4, requiredGiB: 4, runs: 2 });
    assert.equal(noCostReason(row), "not enough free disk to start: 1.40 GiB free, 4 GiB needed");
    assert.throws(() => build([{ name: "x", raw }], [attempt("a1", 1.5)]), /attempts files show 1/);
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

describe("schema", () => {
  const file = () => structuredClone(JSON.parse(JSON.stringify(realistic))) as Record<string, unknown> & { rows: Record<string, unknown>[] };

  test("the committed data parses", () => {
    assert.equal(parseRealistic(JSON.parse(JSON.stringify(realistic))).rows.length, realistic.rows.length);
  });

  test("rejects a wrong schema, counts that don't add up, an eligible row with flags and duplicate rows", () => {
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
  });

  test("every headline row on the page ran 5 times, as the pilot line says", () => {
    const headline = realistic.rows.filter((r) => r.variant === "headline");
    assert.ok(headline.length > 0);
    assert.ok(headline.every((r) => r.attempts === 5), "the pilot line says 5 runs per provider; update it with the data");
    assert.match(pilotLine, /5 runs per provider/);
  });
});

describe("statuses", () => {
  test("each harness reason reads as a kind and plain words", () => {
    assert.equal(readFlag("unsettled (5 attempts)").kind, "unsettled");
    assert.equal(readFlag(meter).text, "its usage meter hasn't been checked against settled charges yet");
    assert.equal(readFlag("provisional: storage coverage of the billing source unknown").text, "it isn't known yet whether its billing source includes disk");
    assert.equal(readFlag("unverified estimate: missing rules-confirmed-in-writing and isolated-window-reconciliation").short, "unconfirmed");
    assert.equal(readFlag("wrong machine size: 15.64040756225586 GiB memory, not within 10% of 8 GiB").text, "it ran with 15.6 GiB of memory, not the 8 GiB this track asks for");
    assert.equal(readFlag("3 incomplete runs (at most 1)").text, "3 of its runs didn't complete, and a pick allows at most 1");
    assert.deepEqual(readFlag("something new"), { kind: "other", short: "not eligible", text: "something new" });
  });

  test("every bar's tag names its kind and status", () => {
    for (const r of realistic.rows.filter((x) => x.cost !== null)) assert.match(statusTag(r), /^(billed|metered|estimate) · /);
    const verified = realistic.rows.find((r) => r.eligible);
    assert.ok(verified);
    assert.match(statusTag(verified), / · verified$/);
  });

  test("Wilson interval of 5 of 5 is about 57 to 100%", () => {
    const w = wilson(5, 5);
    assert.ok(Math.abs(w.low - 0.566) < 0.002);
    assert.equal(w.high, 1);
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
  billingModel: null,
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
    const p = taskPick([costed("upstash", 0.012, true, { completed: 3, incomplete: 2 })]);
    assert.equal(p.kind, "none");
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
  const held = (provider: "boat" | "upstash", idle: "zero-wait" | "held-10" | "held-60", completed: number, transitions: string[], usd: number) => ({
    provider,
    idle,
    runs: 3,
    completed,
    costKind: "metered" as const,
    medianCostUsd: usd,
    changeVsZeroWait: null,
    status: "settled",
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
});

describe("exports", () => {
  test("results.json carries the realistic results for both tracks and both workloads, uncertified", () => {
    const d = agentData().whatATaskCosts;
    assert.equal(d.pilot, pilotLine);
    for (const track of ["same-spec", "default"] as const)
      for (const profile of profileIds) {
        const w = d.tracks[track]?.workloads[profile];
        assert.ok(w, `${track} ${profile}`);
        assert.equal(w.pick.certified, false);
        assert.ok(w.providers.every((p) => p.kind === null || ["billed", "metered", "estimate"].includes(p.kind)));
        assert.ok(w.pick.lowerNotEligible.every((r) => r.whyNotEligible.length > 0));
      }
    assert.ok(d.idle.providers.length > 0);
  });

  test("llms.txt and results.md carry the pilot line, kinds and statuses, and no single cheapest", () => {
    const llms = llmsTxt();
    const md = agentMarkdown();
    for (const text of [llms, md]) {
      assert.ok(text.includes(pilotLine));
      assert.ok(text.includes("What a task costs"));
      assert.match(text, /billed · verified/);
      assert.match(text, /metered · /);
    }
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
  test("each workload tab shows its pick, the uncertified line and why providers are missing", () => {
    const html = renderToStaticMarkup(<TaskCost track={tracks.default} />);
    assert.match(html, /Fix and test: cost per 1,000 completed tasks/);
    assert.match(html, /Build: cost per 1,000 completed tasks/);
    assert.match(html, /No certified winner/);
    assert.match(html, /Not in the chart:/);
    assert.match(html, /default machine is too small for this workload/);
    assert.doesNotMatch(html.replaceAll("There is no overall cheapest", ""), /cheapest/i);
  });

  test("the idle chart names who stopped the sandbox", () => {
    const html = renderToStaticMarkup(<IdleChart />);
    assert.match(html, /What leaving the sandbox open costs/);
    assert.match(html, /couldn&#x27;t resume/);
  });
});
