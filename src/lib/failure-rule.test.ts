import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { trackIds, tracks } from "@/lib/data";

// Method, Reliability, the caveats and the agent files name exactly two kinds of failure set aside as ours.
// A new kind in the data must update that wording, so this fails until it does.
const kinds = [/^Our own scenario deadline ran out\b/, /^Our SDK timed out or wrapped the error moving 10 MB\b/];

describe("the failure rule", () => {
  test("every failure set aside in the data is one of the two kinds the copy names", () => {
    const reasons = trackIds.flatMap((id) => tracks[id].providers.flatMap((p) => p.ourFailures.map((f) => f.reason)));
    assert.ok(reasons.length > 0);
    for (const reason of reasons) assert.ok(kinds.some((k) => k.test(reason)), reason);
  });
});
