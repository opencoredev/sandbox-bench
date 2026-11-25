import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { lastModified, sitePaths, updatePath, updatesPath } from "@/lib/seo/pages";
import type { SitePath } from "@/lib/seo/pages";
import { homeHref, latestUpdates, updateDay, updates } from "@/lib/updates";
import { ordinal } from "@/lib/format";
import { providerResults, realTaskTime, scorecard } from "@/lib/seo/provider";
import type { TrackId } from "@/lib/tracks";

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

  test("each update page links back to a home page section, and its tab where it has tabs", () => {
    for (const u of updates) assert.match(homeHref(u), /^\/#[\w-]+(\/[\w-]+)?$/);
  });
});

describe("Buddy's update", () => {
  test("names the SDK commit apart from each track's harness commit", () => {
    const u = updates.find((x) => x.slug === "buddy-added");
    assert.ok(u);
    const body = u.body.join(" ");
    assert.match(body, /all on SDK commit a5c99d2; the benchmark harness was at commit 1e5683a for the default machine's runs and 5afd423 for the 4 vCPU runs and the real tasks/);
    assert.match(body, /we fixed that in harness commit 5afd423 and reran it/);
    assert.doesNotMatch(body, /sandbox-sdk 5afd423|used a5c99d2, the same SDK code/);
  });
});

describe("Buddy's update ranks", () => {
  // Every rank and denominator in the post, read back from the same standings the provider page shows, as the
  // field stood on Nov 25 when the post went out: Microsandbox, added after it, is taken back out of each standing.
  type Place = { rank: number; of: number };
  const placeText = (p: Place) => `${ordinal(p.rank)} of ${p.of}`;
  const withoutLater = (buddy: Place, later: Place | null): Place => (later === null ? buddy : { rank: buddy.rank - (later.rank < buddy.rank ? 1 : 0), of: buddy.of - 1 });
  const standing = (provider: "buddy" | "microsandbox", track: TrackId, id: string) => {
    const t = providerResults(provider).tracks.find((x) => x.id === track);
    const s = t?.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.standing;
    return s?.kind === "ranked" ? s : null;
  };
  const metric = (track: TrackId, id: string) => {
    const s = standing("buddy", track, id);
    assert.ok(s, `${track} ${id} is ranked`);
    return withoutLater(s, standing("microsandbox", track, id));
  };
  const placedThen = (p: Place, later: { kind: string; rank?: number; of?: number }) => withoutLater(p, later.kind === "ranked" && later.rank !== undefined && later.of !== undefined ? { rank: later.rank, of: later.of } : null);
  const slowest = (track: TrackId, id: string) => {
    const s = metric(track, id);
    assert.equal(s.rank, s.of, `${track} ${id} is the slowest`);
    return `slowest of ${s.of}`;
  };

  test("match the live standings with Styne in the field", () => {
    const u = updates.find((x) => x.slug === "buddy-added");
    assert.ok(u);
    const body = u.body.join(" ");
    const cold = metric("default", "cold");
    assert.ok(body.includes(`On the default machine it started in 0.93 s (100 of 100), ${placeText(cold)}, and ran 100 tool calls in 16.4 s, ${ordinal(metric("default", "tool-replay").rank)}.`));
    assert.ok(body.includes(`Ten at once were all ready in 1.03 s, ${placeText(metric("default", "burst-10"))}`));
    assert.ok(body.includes(`On 4 vCPU and 8 GB it started in 6.10 s (100 of 100), ${placeText(metric("same-spec", "cold"))}:`));
    assert.equal(slowest("same-spec", "burst-10"), slowest("same-spec", "burst-25"));
    assert.ok(body.includes(`Bursts there took 12.4 s for 10 and 23.3 s for 25, the ${slowest("same-spec", "burst-25")}.`));
    assert.equal(slowest("default", "create-from-snapshot"), slowest("same-spec", "create-from-snapshot"));
    assert.ok(body.includes(`a sandbox from a snapshot 6.26 s and 6.72 s, the ${slowest("same-spec", "create-from-snapshot")} on both machines.`));
    const def = realTaskTime("default", "buddy", "fix-and-test");
    const same = realTaskTime("same-spec", "buddy", "fix-and-test");
    assert.ok(def.kind === "ranked" && same.kind === "ranked");
    assert.ok(body.includes(`in 134 s (${placeText(placedThen(def, realTaskTime("default", "microsandbox", "fix-and-test")))}) and 96 s (${placeText(placedThen(same, realTaskTime("same-spec", "microsandbox", "fix-and-test")))})`));
    const reliabilityOf = (provider: "buddy" | "microsandbox") => scorecard("default", provider).find((e) => e.category.id === "reliability")?.rank ?? null;
    const live = reliabilityOf("buddy");
    assert.ok(live);
    const reliability = withoutLater(live, reliabilityOf("microsandbox"));
    assert.ok(reliability.rank === reliability.of);
    assert.ok(body.includes(`That leaves Buddy last of ${reliability.of} in the default machine's Reliability column`));
    assert.ok(body.includes("never picked as Cheapest"));
  });
});
