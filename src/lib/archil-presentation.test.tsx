import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ScoreMeter } from "@/components/score-parts";
import { trackIds, tracks } from "@/lib/data";
import { hardware, locationLabel, ranInOf, ranInPhrase, ranInTerm, ranInText } from "@/lib/hardware";
import { isProviderId, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { trackScores } from "@/lib/score-categories";
import { caveats } from "@/lib/seo/copy";
import { placings, providerFaqs, providerNotes, providerResults, providerSummary, providerTrack, scorecard, verdict } from "@/lib/seo/provider";
import { updates } from "@/lib/updates";

// Three presentation fixes on Archil's pages: its headline and ranked fix and test cost says
// "usage cost, unsettled", its location says only what the evidence shows (outbound IPs and the
// API region), and its pause behaviour stays out of the copy every provider page shares. Every
// other provider reads as before. Run with `bun test`.

const usageTag = "usage cost, unsettled";
const ids = Object.keys(providerInfo).filter(isProviderId);
const others = ids.filter((id) => id !== "archil");

/** Every sentence a provider page builds from the scorecard, on every track it has. */
function pageTexts(id: ProviderId) {
  const r = providerResults(id);
  return [
    providerSummary(id),
    ...r.tracks.flatMap((t) => [verdict(t, id), ...placings(t, id).map((p) => `${p.label} ${p.value}`)]),
    ...providerFaqs(id).map((f) => f.answer),
  ];
}

describe("item 1: Archil's headline and ranked fix and test cost carries its status", () => {
  test("the meta summary says usage cost, unsettled beside $8.87", () => {
    assert.equal(
      providerSummary("archil"),
      "Archil sandbox on the same 4 vCPU, 8 GB machine: 0.67 s cold start (6th of 15), 22 s agent tool replay, fix and test task in 64 s for $8.87 per 1,000 (usage cost, unsettled). Medians, p95s and 95% intervals.",
    );
  });

  test("the verdict puts the tag ahead of the cost rank on both tracks", () => {
    for (const t of providerResults("archil").tracks) assert.match(verdict(t, "archil"), /per 1,000 \(usage cost, unsettled; \d+(st|nd|rd|th) of \d+ on cost\)/);
  });

  test("the scorecard's cost cell carries the tag on both tracks, and the tile renders it", () => {
    for (const id of trackIds) {
      const e = scorecard(id, "archil").find((x) => x.category.id === "cost");
      assert.ok(e?.cell.kind === "valued", `Archil's ${id} cost is ${e?.cell.kind ?? "missing"}`);
      assert.equal(e.cell.tag, usageTag);
      const html = renderToStaticMarkup(<ScoreMeter cell={e.cell} provider="archil" under="space" />);
      assert.ok(html.includes(e.cell.display) && html.includes(usageTag), `${id} meter shows the amount and the tag`);
    }
  });

  test("the FAQ's cost answer and the ranked cost placing say it too", () => {
    const cost = providerFaqs("archil").find((f) => f.question.toLowerCase().includes("cost"));
    assert.ok(cost?.answer.includes(`per 1,000 completed (${usageTag})`), cost?.answer ?? "no cost answer");
    const placed = providerResults("archil").tracks.flatMap((t) => placings(t, "archil")).filter((p) => p.id === "fix-and-test-cost");
    assert.ok(placed.length > 0 && placed.every((p) => p.label === `Fix and test cost, per 1,000 (${usageTag})`));
  });

  test("the update quotes $8.87 with its status", () => {
    const u = updates.find((x) => x.slug === "archil-added");
    assert.ok(u?.body.some((p) => p.includes(`$8.87 per 1,000 (${usageTag})`)));
  });

  test("no other provider's cost cell, home score cell or page sentence gains a tag", () => {
    for (const id of trackIds)
      for (const { category, scores } of trackScores(tracks[id]))
        for (const s of scores.filter((x) => x.provider !== "archil")) {
          if (s.kind === "valued") assert.equal(s.tag, null, `${s.provider} ${category.id} on ${id}`);
        }
    for (const id of others) for (const text of pageTexts(id)) assert.ok(!text.includes("usage cost"), `${id}: ${text}`);
  });

  test("other providers' summaries read exactly as before", () => {
    assert.equal(
      providerSummary("instabox"),
      "Instabox sandbox on the same 4 vCPU, 8 GB machine: 1.8 s cold start (14th of 15), 25 s agent tool replay, fix and test task in 82 s for $0.76 per 1,000. Medians, p95s and 95% intervals.",
    );
    assert.equal(
      providerSummary("daytona"),
      "Daytona sandbox on the same 4 vCPU, 8 GB machine: 1.2 s cold start (13th of 15), 12 s agent tool replay, fix and test task in 93 s for $10.49 per 1,000. Medians, p95s and 95% intervals.",
    );
    assert.equal(
      providerSummary("e2b"),
      "E2B sandbox on the same 4 vCPU, 8 GB machine: 0.79 s cold start (10th of 15), 15 s agent tool replay, fix and test task in 112 s for $10.07 per 1,000. Medians, p95s and 95% intervals.",
    );
  });
});

describe("item 2: Archil's location names the outbound IPs and the API region, not the sandbox", () => {
  test("the location chart says API in Virginia, as Daytona's does", () => {
    const archil = hardware.archil;
    assert.ok(archil);
    assert.equal(locationLabel(archil, "Sandbox in"), "API in Virginia");
    assert.equal(locationLabel(archil, "Runs in"), "API in Virginia");
  });

  test("the provider page's location row says outbound IPs and API, never Ran in", () => {
    for (const id of trackIds) {
      const t = providerTrack(id, "archil");
      assert.ok(t?.ranIn, `Archil has a place on ${id}`);
      assert.equal(ranInTerm(t.ranIn), "Location");
      assert.equal(ranInText(t.ranIn), "Amazon outbound IPs in Ashburn, US; API in aws-us-east-1");
      assert.equal(ranInPhrase(t.ranIn), "with Amazon outbound IPs in Ashburn, US and the API in aws-us-east-1");
    }
  });

  test("every other provider keeps Ran in and its place, and its chart label", () => {
    const labels: Partial<Record<ProviderId, string>> = { daytona: "API in Virginia", instabox: "API in Oregon", baseten: "Sandbox in Oregon" };
    for (const [id, label] of Object.entries(labels)) {
      const h = isProviderId(id) ? hardware[id] : undefined;
      assert.ok(h);
      assert.equal(locationLabel(h, "Sandbox in"), label);
    }
    for (const id of others)
      for (const track of trackIds) {
        const t = providerTrack(track, id);
        if (!t?.ranIn) continue;
        assert.equal(t.ranIn.kind, "ran-in", `${id} on ${track}`);
        assert.equal(ranInTerm(t.ranIn), "Ran in");
        assert.ok(!ranInText(t.ranIn).includes("outbound"));
      }
    assert.deepEqual(ranInOf({ id: "instabox", place: "Boardman, US" }), { kind: "ran-in", place: "Boardman, US" });
  });
});

describe("item 3: Archil's pause behaviour stays on Archil's own page", () => {
  test("the copy every provider page shares names no Archil behaviour", () => {
    for (const c of caveats) assert.ok(!c.includes("Archil"), c);
  });

  test("Archil's own notes carry it", () => {
    assert.ok(providerNotes("archil").some((s) => s.includes("a paused Archil sandbox stays asleep until it is resumed")));
  });

  test("Instabox's, Daytona's and E2B's notes carry no Archil sentence", () => {
    for (const id of ["instabox", "daytona", "e2b"] as const) for (const s of providerNotes(id)) assert.ok(!s.includes("Archil"), `${id}: ${s}`);
  });
});
