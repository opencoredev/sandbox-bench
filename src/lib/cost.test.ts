import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { agentData, llmsTxt } from "@/lib/agent-data";
import { costBasis, costLabel, costNotCountedWhy, costPick, costSource, costSourceText, costStatus, costTag, estimateNotCounted, isEligible, machineText, pricedTasks, taskCostOf, unpricedTasks, wholeMachine } from "@/lib/cost";
import type { Priced } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";
import type { TaskCost, Track } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

// The cost eligibility table and the pick built on it. Run with `bun test`.

const cost = (kind: Priced["kind"], settled: boolean): Priced => ({ kind, usd: 0.001, n: 10, confidence: "medium", source: null, settled, bound: null });

describe("cost status", () => {
  test("billed and settled is verified and eligible", () => {
    assert.equal(costStatus("superserve", cost("billed", true)).kind, "verified");
    assert.ok(isEligible(costStatus("upstash", cost("billed", true))));
  });

  test("metered is unreconciled and not eligible, the same rule for every provider", () => {
    const s = costStatus("e2b", cost("metered", true));
    assert.equal(s.kind, "unreconciled");
    assert.ok(!isEligible(s));
  });

  test("unsettled is shown, not eligible", () => {
    const s = costStatus("daytona", cost("billed", false));
    assert.equal(s.kind, "unsettled");
    assert.ok(!isEligible(s));
  });

  test("boxd's metered figure is provisional, but a reconciled billed one would not be", () => {
    assert.equal(costStatus("boxd", cost("metered", true)).kind, "provisional");
    assert.equal(costStatus("boxd", cost("billed", true)).kind, "verified");
  });

  test("estimates are never eligible, and Boat's says it is from docs", () => {
    const s = costStatus("boat", cost("estimate", true));
    assert.equal(s.kind, "estimate");
    assert.ok(!isEligible(s));
    assert.equal(costTag("boat", cost("estimate", true), s), "estimate from docs");
    assert.match("why" in s ? s.why : "", /no settled-charge source for Boat/);
  });
});

describe("usage cost", () => {
  test("Archil's billed export is its reported usage cost, never called a bill, and says unsettled beside the amount", () => {
    const c = cost("billed", false);
    const s = costStatus("archil", c);
    assert.equal(s.kind, "unsettled");
    assert.equal(costLabel("archil", c), "Usage cost");
    assert.equal(costTag("archil", c, s), "usage cost, unsettled");
    assert.equal(costSource("archil", c), "From the usage cost Archil's per-sandbox usage API reports, 10 tasks, unsettled");
    assert.equal(costSourceText("archil", c), "from the usage cost Archil's per-sandbox usage API reports");
    assert.match(costBasis("archil", c), /^Usage cost over 10 tasks/);
    assert.match("why" in s ? s.why : "", /metadata record \(its status and end time\).*keeps the usage record for 90 days/);
  });

  test("other providers keep their labels, an unsettled bill included", () => {
    const daytona = cost("billed", false);
    assert.equal(costTag("daytona", daytona, costStatus("daytona", daytona)), "billed");
    assert.equal(costSource("daytona", daytona), "From Daytona's bill, 10 tasks");
    const upstash = cost("billed", true);
    assert.equal(costTag("upstash", upstash, costStatus("upstash", upstash)), "billed");
    assert.equal(costSource("upstash", upstash), "From Upstash Box's bill, 10 tasks");
    assert.equal(costSource("e2b", cost("metered", true)), "From E2B's usage record, 10 tasks");
  });
});

describe("cost pick", () => {
  // The published data, pinned: a change to the rule or the data must change these on purpose.
  const expected = {
    "same-spec": { pick: "upstash-ephemeral", lower: ["boxd"] },
    default: { pick: "boxd", lower: [] },
  } as const satisfies Record<(typeof trackIds)[number], { pick: string; lower: readonly string[] }>;

  for (const id of trackIds) {
    test(`${id}: the cheapest billed or metered exact cost, and any cheaper one that can't count`, () => {
      const c = costPick(tracks[id]);
      assert.ok(c.kind === "picked");
      assert.equal(c.pick.id, expected[id].pick);
      assert.deepEqual(c.lower.map((t) => t.id), expected[id].lower);
    });
  }

  test("same-spec: lists cheaper exact costs on a different machine in lower", () => {
    const c = costPick(tracks["same-spec"]);
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, "upstash-ephemeral");
    assert.deepEqual(c.lower.map((t) => t.id), ["boxd"]);
    assert.match(c.lower[0]?.why.join() ?? "", /not 4 vCPU, 8 GiB/);
  });

  test("Boat's usage cost is in the chart like every other provider's, not listed as unpriced", () => {
    for (const id of trackIds) {
      if (!tracks[id].costs.boat) continue;
      assert.ok(pricedTasks(tracks[id]).some((t) => t.id === "boat"));
      assert.ok(!unpricedTasks(tracks[id]).some((t) => t.id === "boat"));
    }
  });

  /** The default track with one provider's cost replaced, cheaper than every published one. */
  const withCost = (id: ProviderId, cost: TaskCost): Track => ({ ...tracks.default, costs: { ...tracks.default.costs, [id]: cost } });
  const cheap: Omit<Priced, "kind" | "settled"> = { usd: 0.000001, n: 10, confidence: "high", source: null, bound: null };

  test("an unsettled billed cost can be the cheapest", () => {
    const c = costPick(withCost("daytona", { kind: "billed", settled: false, ...cheap }));
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, "daytona");
    assert.equal(c.pick.status.kind, "unsettled");
  });

  test("an exact list-price estimate is never the cheapest, and is listed as not counted with why", () => {
    const c = costPick(withCost("freestyle", { kind: "estimate", settled: false, ...cheap }));
    assert.ok(c.kind === "picked");
    assert.notEqual(c.pick.id, "freestyle");
    assert.notEqual(c.pick.cost.kind, "estimate");
    const freestyle = c.lower.find((t) => t.id === "freestyle");
    assert.ok(freestyle);
    assert.deepEqual(freestyle.why, [estimateNotCounted]);
  });

  test("a metered cost can be the cheapest", () => {
    const c = costPick(withCost("e2b", { kind: "metered", settled: false, ...cheap }));
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, "e2b");
  });

  test("published: every lower cost is cheaper than the pick and has a reason; the pick and runner-up are billed or metered", () => {
    for (const id of trackIds) {
      const c = costPick(tracks[id]);
      assert.ok(c.kind === "picked");
      for (const t of [c.pick, ...(c.runnerUp ? [c.runnerUp] : [])]) assert.notEqual(t.cost.kind, "estimate");
      for (const t of c.lower) {
        assert.ok(t.cost.usd < c.pick.cost.usd);
        assert.deepEqual(t.why, costNotCountedWhy(tracks[id], t));
      }
    }
  });

  test("Boat's cost in the data is its per-task cost, and can be the cheapest", () => {
    const t = withCost("boat", { kind: "billed", settled: true, ...cheap });
    assert.equal(taskCostOf(t, "boat")?.kind, "billed");
    const c = costPick(t);
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, "boat");
  });

  test("on Same machine, with only a wrong-size exact cost, there is no pick, and the reason is the machine", () => {
    const t = tracks["same-spec"];
    const boxd = t.costs.boxd;
    assert.ok(boxd && boxd.kind !== "none");
    const c = costPick({ ...t, costs: { boxd } });
    assert.ok(c.kind === "none");
    assert.equal(c.why, "not-counted");
    assert.deepEqual(c.lower.map((x) => x.id), ["boxd"]);
    assert.match(c.lower[0]?.why.join() ?? "", /not 4 vCPU, 8 GiB/);
  });

  test("with only a list-price estimate, there is no pick, and the estimate is listed with why", () => {
    const t = tracks.default;
    const buddy = t.costs.buddy;
    assert.ok(buddy && buddy.kind === "estimate");
    const c = costPick({ ...t, costs: { buddy } });
    assert.ok(c.kind === "none");
    assert.equal(c.why, "not-counted");
    assert.deepEqual(c.lower.map((x) => [x.id, x.why]), [["buddy", [estimateNotCounted]]]);
  });

  test("no costs at all: empty", () => {
    const base = tracks["same-spec"];
    assert.equal(costPick({ ...base, costs: {} } as typeof base).kind, "empty");
  });
});

describe("Buddy's decimal GB", () => {
  test("its priced tiers keep 8 and 4 decimal GB apart from the GiB they measure", () => {
    const want = { "same-spec": { cpu: 4, gb: 8, gib: 7.451, measured: "4 vCPU, 7.45 GiB" }, default: { cpu: 2, gb: 4, gib: 3.725, measured: "2 vCPU, 3.73 GiB" } } as const;
    for (const id of trackIds) {
      const p = tracks[id].providers.find((x) => x.id === "buddy");
      assert.ok(p);
      const w = wholeMachine(p);
      assert.ok(w.kind === "hourly");
      assert.equal(w.memory.unit, "GB");
      assert.equal(machineText(w), `${want[id].cpu} vCPU, ${want[id].gb} GB (${want[id].gib.toFixed(2)} GiB)`);
      const out = agentData().tracks[id].providers.find((x) => x.id === "buddy");
      assert.ok(out && "allocation" in out.wholeMachineAtListPrice);
      assert.deepEqual(out.wholeMachineAtListPrice.allocation, { cpu: want[id].cpu, memoryGB: want[id].gb, memoryGiB: want[id].gib });
      assert.equal(out.allocation.pricedAt?.memoryGB, want[id].gb);
      assert.equal(out.allocation.measuredText, want[id].measured);
      assert.doesNotMatch(out.wholeMachineAtListPrice.text, /\d GiB\b(?! *\))/, "no tier is labelled GiB");
    }
  });

  test("every other provider keeps its GiB allocation and wording", () => {
    for (const id of trackIds)
      for (const p of tracks[id].providers.filter((x) => x.id !== "buddy")) {
        const w = wholeMachine(p);
        if (w.kind !== "hourly" || p.pricingAllocation === null) continue;
        assert.deepEqual(w.memory, { unit: "GiB", gib: p.pricingAllocation.memoryGiB });
        assert.equal(machineText(w), `${w.cpu} vCPU, ${Number(p.pricingAllocation.memoryGiB.toFixed(1))} GiB`);
        const out = agentData().tracks[id].providers.find((x) => x.id === p.id);
        assert.deepEqual(out?.allocation.pricedAt, p.pricingAllocation);
      }
  });

  test("llms.txt gives the pick rule's own reasons Buddy is never the quick-task cost pick", () => {
    const text = llmsTxt();
    assert.doesNotMatch(text, /An exact estimate can still be the quick-task cost pick/);
    for (const id of trackIds) {
      const t = pricedTasks(tracks[id]).find((x) => x.id === "buddy");
      assert.ok(t && t.cost.kind === "estimate", `Buddy's ${id} quick-task cost is a list-price estimate`);
      const why = costNotCountedWhy(tracks[id], t);
      assert.equal(why[0], estimateNotCounted, `the rule leaves Buddy out of the ${id} pick as an estimate`);
      // Even made the cheapest cost on the track, an estimate is never picked.
      const alone = costPick({ ...tracks[id], costs: { buddy: tracks[id].costs.buddy } });
      assert.ok(alone.kind === "none" && alone.why === "not-counted" && alone.lower.some((x) => x.id === "buddy"));
    }
    assert.equal(costNotCountedWhy(tracks.default, pricedTasks(tracks.default).find((x) => x.id === "buddy") ?? assert.fail()).length, 1, "size only counts on the same-machine track");
    assert.ok(
      text.includes(
        "Cheapest needs a cost billed or metered by the provider, so Buddy's list-price estimates are shown but never the quick-task cost pick; on the same-machine track its 4x8 size measured 7.45 GiB, not 8 GiB, so the exact-size rule leaves it out too.",
      ),
    );
    assert.match(text, /estimates, not verified or settled bills/);
  });

  test("Buddy's provenance keeps the SDK commit apart from the harness commits", () => {
    const text = llmsTxt();
    assert.match(text, /all on SDK commit a5c99d2; the benchmark harness was at commit 1e5683a for the default machine's runs and 5afd423 for the 4 vCPU runs/);
    assert.doesNotMatch(text, /commit 5afd423; its default-machine runs used a5c99d2/);
  });
});
