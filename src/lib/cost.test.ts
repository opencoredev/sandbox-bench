import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { costBasis, costLabel, costPick, costSource, costSourceText, costStatus, costTag, isEligible, pricedTasks, taskCostOf, unpricedTasks } from "@/lib/cost";
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

  test("other providers keep their labels; an unsettled bill says so beside the amount", () => {
    const daytona = cost("billed", false);
    assert.equal(costTag("daytona", daytona, costStatus("daytona", daytona)), "billed, unsettled");
    assert.equal(costSource("daytona", daytona), "From Daytona's bill, 10 tasks, unsettled");
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
    test(`${id}: the cheapest exact cost, and any cheaper one on a different machine`, () => {
      const c = costPick(tracks[id]);
      assert.ok(c.kind === "picked");
      assert.equal(c.pick.id, expected[id].pick);
      assert.deepEqual(c.lower.map((t) => t.id), expected[id].lower);
    });
  }

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

  test("an exact estimate can be the cheapest", () => {
    const c = costPick(withCost("freestyle", { kind: "estimate", settled: false, ...cheap }));
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, "freestyle");
    assert.equal(c.pick.cost.kind, "estimate");
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
    assert.equal(c.why, "machine");
    assert.deepEqual(c.lower.map((x) => x.id), ["boxd"]);
  });

  test("no costs at all: empty", () => {
    const base = tracks["same-spec"];
    assert.equal(costPick({ ...base, costs: {} } as typeof base).kind, "empty");
  });
});
