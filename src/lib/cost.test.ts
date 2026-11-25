import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { costNotCountedWhy, costPick, costStatus, estimateNotCounted, costTag, isEligible, pricedTasks, taskCostOf, unpricedTasks } from "@/lib/cost";
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
