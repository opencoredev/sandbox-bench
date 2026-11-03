import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { agentData } from "@/lib/agent-data";
import { trackIds } from "@/lib/data";
import { alternativesTrack, verdictCount } from "@/lib/seo/alternatives";
import { compareTrack } from "@/lib/seo/compare";
import { alternativesPages } from "@/lib/seo/pages";

// The alternatives pages publish who is ahead of a provider, so they must agree with the comparison model. Run with `bun test`.

describe("alternativesTrack on the published data", () => {
  for (const target of alternativesPages) {
    for (const tid of trackIds) {
      test(`${target}, ${tid}: every other provider on the track, with the comparison page's tally`, () => {
        const t = alternativesTrack(tid, target);
        if (!t) return;
        const others = agentData().tracks[tid].providers.map((p) => p.id).filter((id) => id !== target);
        assert.deepEqual(t.alternatives.map((a) => a.id), others);
        for (const a of t.alternatives) {
          assert.deepEqual(a.pair.tally, compareTrack(tid, a.id, target)?.tally, a.id);
          assert.equal(a.pair.sides.b.reliability.attempts, t.target.reliability.attempts, a.id);
        }
        const cold = verdictCount(t, (a) => a.cold);
        const compared = t.alternatives.filter((a) => a.cold?.verdict.kind !== "not-compared" && a.cold !== null).length;
        assert.equal(cold.ahead + cold.behind + cold.tied, compared);
      });
    }
  }

  test("every alternatives page has results on at least one track", () => {
    for (const target of alternativesPages) assert.ok(trackIds.some((tid) => alternativesTrack(tid, target) !== null), target);
  });
});
