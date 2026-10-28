import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { agentData } from "@/lib/agent-data";
import { trackIds } from "@/lib/data";
import { compareTrack, verdictOf } from "@/lib/seo/compare";
import { isRanked } from "@/lib/seo/provider";

// The comparison pages publish a winner per test, so the rules behind it get their own tests. Run with `bun test`.

const r = (provider: "e2b" | "daytona" | "boxd", median: number, ci95: [number, number]) => ({ provider, median, ci95 });

describe("verdictOf", () => {
  test("the provider listed first (best first) is ahead when the intervals don't hold each other's medians", () => {
    assert.deepEqual(verdictOf([r("daytona", 1, [0.9, 1.1]), r("e2b", 2, [1.9, 2.1])], "e2b", "daytona"), { kind: "ahead", leader: "daytona" });
    assert.deepEqual(verdictOf([r("e2b", 30, [29, 31]), r("daytona", 10, [9, 11])], "e2b", "daytona"), { kind: "ahead", leader: "e2b" });
  });

  test("medians inside each other's intervals are tied", () => {
    assert.deepEqual(verdictOf([r("e2b", 1, [0.8, 1.3]), r("daytona", 1.2, [0.9, 1.4])], "e2b", "daytona"), { kind: "tied" });
  });

  test("one median inside the other's interval is not enough for a tie", () => {
    assert.deepEqual(verdictOf([r("daytona", 15, [13, 18]), r("e2b", 16, [16, 17])], "e2b", "daytona"), { kind: "ahead", leader: "daytona" });
  });

  test("a side without a ranked result is not compared", () => {
    assert.deepEqual(verdictOf([r("e2b", 1, [0.9, 1.1]), r("boxd", 2, [1.9, 2.1])], "e2b", "daytona"), { kind: "not-compared" });
  });
});

describe("compareTrack on the published data", () => {
  for (const tid of trackIds) {
    test(`${tid}: verdicts follow the ranking and the tally adds up`, () => {
      const t = compareTrack(tid, "e2b", "daytona");
      if (!t) return;
      const metrics = agentData().tracks[tid].metrics;
      const rows = t.groups.flatMap((g) => g.rows);
      for (const row of rows) {
        const ranked = metrics.find((m) => m.id === row.id)?.results.filter(isRanked) ?? [];
        const both = ranked.some((x) => x.provider === "e2b") && ranked.some((x) => x.provider === "daytona");
        assert.equal(row.verdict.kind === "not-compared", !both, row.id);
        if (row.verdict.kind === "ahead" && row.a.kind === "ranked" && row.b.kind === "ranked") {
          assert.ok(row.verdict.leader === "e2b" ? row.a.rank < row.b.rank : row.b.rank < row.a.rank, row.id);
        }
      }
      assert.equal(t.tally.a + t.tally.b + t.tally.tied, t.tally.compared);
      assert.equal(t.tally.compared, rows.filter((x) => x.verdict.kind !== "not-compared").length);
    });
  }
});
