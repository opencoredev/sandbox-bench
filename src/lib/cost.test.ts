import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { costPick, costStatus, costTag, isEligible, monthlyPlanWhy, pricedTasks, unpricedTasks } from "@/lib/cost";
import type { Priced } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";

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

  test("a monthly-plan provider has no per-task cost: out of the chart and the pick, listed as unpriced", () => {
    for (const id of trackIds) {
      assert.ok(!pricedTasks(tracks[id]).some((t) => t.id === "boat"));
      assert.ok(unpricedTasks(tracks[id]).some((t) => t.id === "boat" && t.why === monthlyPlanWhy));
    }
  });

  test("an unsettled or estimated cost can still be the cheapest", () => {
    const base = tracks.default;
    const costs = Object.fromEntries(Object.entries(base.costs).map(([k, v]) => [k, v && v.kind === "billed" ? { ...v, settled: false } : v]));
    const c = costPick({ ...base, costs } as typeof base);
    assert.ok(c.kind === "picked");
    assert.equal(c.pick.id, pricedTasks({ ...base, costs } as typeof base)[0]?.id);
  });

  test("no costs at all: empty", () => {
    const base = tracks["same-spec"];
    assert.equal(costPick({ ...base, costs: {} } as typeof base).kind, "empty");
  });
});
