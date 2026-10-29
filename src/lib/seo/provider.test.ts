import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { providerNotes } from "@/lib/seo/provider";

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
