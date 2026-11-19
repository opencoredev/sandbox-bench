import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { lastModified, sitePaths, updatePath, updatesPath } from "@/lib/seo/pages";
import type { SitePath } from "@/lib/seo/pages";
import { homeHref, latestUpdates, updateDay, updates } from "@/lib/updates";

describe("updates", () => {
  test("every update has its own page, a unique slug and a body", () => {
    assert.equal(new Set(updates.map((u) => u.slug)).size, updates.length);
    for (const u of updates) {
      assert.match(u.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, u.slug);
      assert.match(u.date, /^\d{4}-\d{2}-\d{2}$/, u.slug);
      assert.ok(u.body.length > 0, u.slug);
      for (const p of [u.text, ...u.body]) assert.doesNotMatch(p, /—/, `${u.slug}: no em dashes`);
    }
  });

  test("newest first, and the hero shows the newest three", () => {
    const dates = updates.map((u) => u.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    assert.deepEqual(latestUpdates, updates.slice(0, 3));
    assert.equal(updateDay({ date: "2026-11-18" }), "Nov 18");
  });

  test("the index and every update page are in the sitemap with a date", () => {
    const paths: SitePath[] = [updatesPath, ...updates.map((u) => updatePath(u.slug))];
    for (const path of paths) {
      assert.ok(sitePaths.includes(path), path);
      assert.match(lastModified(path), /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("each update page links back to a home page section and tab", () => {
    for (const u of updates) assert.match(homeHref(u), /^\/#[\w-]+\/[\w-]+$/);
  });
});
