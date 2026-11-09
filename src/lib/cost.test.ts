import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { costPick, costStatus, costTag, isEligible, pricedTasks } from "@/lib/cost";
import type { Priced } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";

// The cost eligibility table and the pick built on it. Run with `bun test`.

const cost = (kind: Priced["kind"], settled: boolean): Priced => ({ kind, usd: 0.001, n: 10, confidence: "medium", source: null, settled });

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
    "same-spec": { pick: "upstash-ephemeral", eligible: ["upstash-ephemeral", "upstash", "superserve"], lower: ["boxd"] },
    default: { pick: "upstash-ephemeral", eligible: ["upstash-ephemeral", "upstash", "superserve"], lower: ["boxd"] },
  } as const satisfies Record<(typeof trackIds)[number], { pick: string; eligible: readonly string[]; lower: readonly string[] }>;

  for (const id of trackIds) {
    test(`${id}: the published pick, its eligible set and the lower costs it flags`, () => {
      const c = costPick(tracks[id]);
      assert.equal(c.kind, "verified");
      if (c.kind !== "verified") return;
      assert.equal(c.pick.id, expected[id].pick);
      assert.deepEqual(c.eligible, expected[id].eligible);
      assert.deepEqual(
        c.lower.map((t) => t.id),
        expected[id].lower,
      );
    });
  }

  test("no eligible cost: no pick, and the lowest reported cost is still shown", () => {
    const base = tracks["same-spec"];
    const costs = Object.fromEntries(Object.entries(base.costs).map(([k, v]) => [k, v && v.kind === "billed" ? { ...v, settled: false } : v]));
    const c = costPick({ ...base, costs } as typeof base);
    assert.equal(c.kind, "none");
    if (c.kind === "none") assert.equal(c.lowest.id, pricedTasks({ ...base, costs } as typeof base)[0]?.id);
  });

  test("no costs at all: empty", () => {
    const base = tracks["same-spec"];
    assert.equal(costPick({ ...base, costs: {} } as typeof base).kind, "empty");
  });
});
