import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { trackIds, tracks } from "@/lib/data";
import { providerName } from "@/lib/providers";
import { untested } from "@/lib/seo/copy";

// Pages say "not tested yet" for these names, so the list must drop a provider once its data lands. Run with `bun test`.

describe("untested", () => {
  test("names no provider that has results in either track", () => {
    const tested = new Set<string>(trackIds.flatMap((id) => tracks[id].providers.map((p) => providerName(p.id))));
    const stale = untested.filter((name) => tested.has(name));
    assert.deepEqual(stale, [], `remove from untested in src/lib/seo/copy.ts: ${stale.join(", ")}`);
  });
});
