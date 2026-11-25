import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { agentData, llmsTxt } from "@/lib/agent-data";
import { costNotCountedWhy, costPick, costStatus, estimateNotCounted, costTag, isEligible, machineText, pricedTasks, taskCostOf, unpricedTasks, wholeMachine } from "@/lib/cost";
import type { Priced } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";
import type { TaskCost, Track } from "@/lib/data";
import { providerName } from "@/lib/providers";
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

describe("cost pick", () => {
  // The published data, pinned: a change to the rule or the data must change these on purpose.
  const expected = {
    // Styne's list-price estimate is cheapest on both tracks, but only a billed or metered cost can be picked.
    "same-spec": { pick: "upstash-ephemeral", lower: ["styne", "boxd"] },
    default: { pick: "boxd", lower: ["styne"] },
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
    const withoutStyne: Track = {
      ...tracks["same-spec"],
      providers: tracks["same-spec"].providers.filter((p) => p.id !== "styne"),
      costs: Object.fromEntries(Object.entries(tracks["same-spec"].costs).filter(([k]) => k !== "styne")),
    };
    const c = costPick(withoutStyne);
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, "upstash-ephemeral");
    assert.deepEqual(c.lower.map((t) => t.id), ["boxd"]);
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
    const styne = costPick(tracks["same-spec"]);
    assert.ok(styne.kind === "picked");
    assert.deepEqual(styne.lower.find((t) => t.id === "styne")?.why, [estimateNotCounted]);
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
    assert.match(c.lower[0]?.why.join() ?? "", /not 4 vCPU, 8 GB/);
  });

  test("with only a list-price estimate, there is no pick, and the estimate is listed with why", () => {
    const t = tracks.default;
    const styne = t.costs.styne;
    assert.ok(styne && styne.kind === "estimate");
    const c = costPick({ ...t, costs: { styne } });
    assert.ok(c.kind === "none");
    assert.equal(c.why, "not-counted");
    assert.deepEqual(c.lower.map((x) => [x.id, x.why]), [["styne", [estimateNotCounted]]]);
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

  test("llms.txt gives the pick rule's own reasons Buddy isn't the quick-task cost pick", () => {
    const text = llmsTxt();
    assert.doesNotMatch(text, /never names it cheapest/);
    const def = costPick(tracks.default);
    assert.ok(def.kind === "picked" && def.pick.id !== "buddy");
    assert.ok(text.includes(`An exact estimate can still be the quick-task cost pick: on the default machines ${providerName(def.pick.id)}'s cost is lower; on the same-machine track Buddy's 4x8 size measured 7.45 GiB, not 8 GiB, so the exact-size rule leaves it out of the pick.`));
    assert.match(text, /estimates, not verified or settled bills/);
  });

  test("Buddy's provenance keeps the SDK commit apart from the harness commits", () => {
    const text = llmsTxt();
    assert.match(text, /all on SDK commit a5c99d2; the benchmark harness was at commit 1e5683a for the default machine's runs and 5afd423 for the 4 vCPU runs/);
    assert.doesNotMatch(text, /commit 5afd423; its default-machine runs used a5c99d2/);
  });
});
