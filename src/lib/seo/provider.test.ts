import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { headlineRows, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { providerNotes, realTaskCost, realTaskTime } from "@/lib/seo/provider";

// Provider pages quote the site's own notes, so a note must reach the right provider and no other. Run with `bun test`.

describe("providerNotes", () => {
  test("Upstash Box gets the notes about its product family, Ephemeral Box included", () => {
    const notes = providerNotes("upstash");
    assert.ok(notes.some((n) => n.startsWith("Upstash appears twice")));
    assert.ok(notes.some((n) => n.startsWith("Ephemeral Box has no pause")));
  });

  test("a provider named mid-sentence gets that sentence", () => {
    assert.ok(providerNotes("superserve").some((n) => n.includes("Superserve now runs")));
  });

  test("notes about other providers stay off a page", () => {
    for (const n of providerNotes("e2b")) assert.ok(n.includes("E2B"));
    assert.ok(!providerNotes("daytona").some((n) => n.includes("Upstash")));
  });
});

describe("real-task placings", () => {
  test("time ranks follow the chart's order, fastest first", () => {
    const rows = headlineRows(realistic, runTrackOf["same-spec"], "fix-and-test");
    const timed = [...rows.costed, ...rows.uncosted].filter((r) => r.medianWallS !== null).sort((a, b) => (a.medianWallS ?? 0) - (b.medianWallS ?? 0));
    assert.ok(timed.length > 1);
    const first = realTaskTime("same-spec", timed[0]!.provider, "fix-and-test");
    const last = realTaskTime("same-spec", timed[timed.length - 1]!.provider, "fix-and-test");
    assert.equal(first.kind === "ranked" && first.rank, 1);
    assert.ok(last.kind === "ranked" && last.of === timed.length && last.rank > 1);
  });

  test("cost ranks follow the cost chart, cheapest first", () => {
    const { costed } = headlineRows(realistic, runTrackOf["same-spec"], "fix-and-test");
    costed.forEach((r, i) => {
      const c = realTaskCost("same-spec", r.provider, "fix-and-test");
      assert.ok(c.kind === "ranked" && c.rank === i + 1 && c.of === costed.length);
    });
  });

  test("a provider with no run says why instead of ranking", () => {
    // Beam's 128 MiB default machine is too small for the real tasks.
    const t = realTaskTime("default", "beam", "fix-and-test");
    assert.equal(t.kind, "blank");
  });
});
