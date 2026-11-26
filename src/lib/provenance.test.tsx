import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ByLocation } from "@/components/by-location";
import { ProviderRows, TaskCostHeadline, columnsOf } from "@/components/realistic";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { trackIds, tracks } from "@/lib/data";
import { headlineRows, profileIds, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { parseRegional, providerBatchesText, regional } from "@/lib/regions";
import type { RegionId } from "@/lib/regions";
import { parseSdkSetupRuns, sdkSetupRuns } from "@/lib/sdk-setup";

// Three presentation gaps on Archil: its real-task cost bars say "usage cost, unsettled", the
// exports place it only by outbound IPs and API region, and its own By location batches and SDK
// setup run show wherever that provenance shows. Every other provider is pinned to read as
// before. Run with `bun test`.

const usageTag = "usage cost, unsettled";
const batches = {
  eu: ["sbxar-r1-eu-default-main-b1-archil", "sbxar-r1-eu-default-main-b2-archil"],
  "us-east": ["sbxar-r1-us-east-default-main-b1-archil", "sbxar-r1-us-east-default-main-b2-archil"],
};

describe("item 1: Archil's real-task cost bars carry the usage-cost tag", () => {
  const amounts = new Set<string>();
  const runs = [...new Set(Object.values(runTrackOf))];
  for (const run of runs)
    for (const profile of profileIds)
      test(`${run} ${profile}: only Archil's column has a tag, in its bar and its accessible label`, () => {
        const { costed } = headlineRows(realistic, run, profile);
        for (const c of columnsOf(costed)) {
          const [first] = c.detail;
          if (c.provider === "archil") {
            assert.equal(c.tag, usageTag);
            assert.deepEqual(first, ["Per 1,000 completed", `${c.label} (${usageTag})`]);
            amounts.add(c.label);
          } else {
            assert.ok(!("tag" in c), `${c.provider} has no tag`);
            assert.deepEqual(first, ["Per 1,000 completed", c.label], `${c.provider}'s detail is the bare amount`);
          }
        }
      });

  test("the tagged amounts include $16.47 and $4.75", () => {
    assert.ok(amounts.has("$16.47") && amounts.has("$4.75"), [...amounts].join(", "));
  });

  test("the phone rows say the tag beside Archil's price and nowhere else", () => {
    for (const run of runs)
      for (const profile of profileIds) {
        const { costed, uncosted } = headlineRows(realistic, run, profile);
        const html = renderToStaticMarkup(<ProviderRows costed={costed} uncosted={uncosted} />);
        const items = html.split("<li").slice(1);
        for (const li of items) {
          const isArchil = li.includes(">Archil<");
          const hasCost = costed.some((r) => r.provider === "archil");
          assert.equal(li.includes(usageTag), isArchil && hasCost, `${run} ${profile}`);
        }
      }
  });

  test("the headline chart says the tag in its notes and its bar's accessible label", () => {
    const html = renderToStaticMarkup(<TaskCostHeadline track={tracks["same-spec"]} />);
    assert.ok(html.includes("$16.47") && html.includes(usageTag));
    assert.ok(html.includes(`aria-label="Archil: Per 1,000 completed $16.47 (${usageTag}), Completed`));
    // The compact chart's names are slanted, so the tag goes in the notes under it, not under the column.
    assert.match(html, /Archil(<\/[a-z]+>)+: usage cost, unsettled\./, "the note under the chart");
    assert.ok(!html.includes(`>${usageTag}</span>`), "no tag under a compact column");
  });
});

describe("item 2: the exports place Archil by its outbound IPs only", () => {
  const json = agentData();

  test("results.json: Archil has ranIn null with its outbound IP location", () => {
    for (const id of trackIds) {
      const p = json.tracks[id]?.providers.find((x) => x.id === "archil");
      assert.ok(p, `Archil on ${id}`);
      assert.equal(p.ranIn, null);
      assert.equal(p.outboundIpLocation, "Ashburn, US");
    }
  });

  test("results.md: Archil's Ran in cell names its outbound IP location", () => {
    const lines = agentMarkdown().split("\n");
    const rows = lines.flatMap((l, i) => (l.includes("| Ran in |") ? [lines.slice(i).find((r) => r.startsWith("| Archil |")) ?? ""] : []));
    assert.equal(rows.length, 2);
    for (const r of rows) assert.ok(r.includes("| Ashburn, US (outbound IP) |"), r);
  });
});

describe("item 3: Archil's own By location batches and SDK setup run", () => {
  test("the parsers read providerBatches and runId, and accept files without them", () => {
    assert.equal(regional.batchId, "sbx65-r1");
    assert.deepEqual(regional.providerBatches.archil, {
      commit: "1f1de78",
      batches: [
        { region: "eu", runs: batches.eu },
        { region: "us-east", runs: batches["us-east"] },
      ],
    });
    assert.deepEqual(Object.keys(regional.providerBatches), ["archil"]);
    assert.deepEqual(sdkSetupRuns, { archil: { runId: "sbx57-mwtux8wi", sdkCommit: "1f1de78", date: "Nov 23, 2026" } });
    assert.deepEqual(parseSdkSetupRuns({ beam: { sdkCommit: "69d48ed", date: "Nov 18, 2026" } }), {});
    assert.throws(() => parseSdkSetupRuns({ beam: { sdkCommit: "69d48ed", date: "Nov 18, 2026", runId: 7 } }));

    const base = {
      schemaVersion: 1,
      batchId: "b1",
      commit: "abcdef0",
      track: "default",
      window: { start: "2026-10-24T18:12:48.346Z", end: "2026-10-24T18:17:13.220Z" },
      regions: [{ id: "eu", label: "EU-Central", city: null, country: null, network: null, host: null, runs: 2 }],
      plannedRegions: [],
      metrics: [],
      rows: [],
      rtt: [],
    };
    assert.deepEqual(parseRegional(base).providerBatches, {});
    assert.throws(() => parseRegional({ ...base, providerBatches: { archil: { commit: "x", batches: { mars: ["a"] } } } }), /mars/);
    assert.throws(() => parseRegional({ ...base, providerBatches: { archil: { commit: "x", batches: { eu: [] } } } }), /at least one batch id/);
    assert.deepEqual(parseRegional({ ...base, providerBatches: { nobody: { commit: "x", batches: { eu: ["a"] } } } }).providerBatches, {});
  });

  test("By location says where Archil's rows come from, on every tab", () => {
    const html = renderToStaticMarkup(<ByLocation />).replaceAll("&#x27;", "'");
    assert.ok(html.includes(`'s rows come from its own batches (commit 1f1de78: EU-Central ${batches.eu.join(" and ")}; US-East ${batches["us-east"].join(" and ")}).`));
    // Other providers' rows come from more than one batch (Instabox's and boxd's are later), so no shared batch is claimed for them.
    assert.ok(!html.includes("Every other row comes from"));
    assert.equal(providerBatchesText(regional, "archil", "eu" as RegionId), `commit 1f1de78: EU-Central ${batches.eu.join(" and ")}`);
    assert.equal(providerBatchesText(regional, "e2b"), null);
  });

  test("results.json keys the provenance by provider, Archil only", () => {
    const json = agentData();
    assert.deepEqual(json.runProvenance, {
      archil: { byLocation: { commit: "1f1de78", batches }, sdkSetup: { runId: "sbx57-mwtux8wi", sdkCommit: "1f1de78", date: "Nov 23, 2026" } },
    });
    assert.ok(json.howToRead.includes("`runProvenance`, keyed by provider (Archil)"));
    // Baseten, Instabox and Beam have their own SDK setup commits, and Instabox and boxd later By location batches: no shared-run claim.
    assert.ok(!json.howToRead.includes("every other row comes from") && !json.howToRead.includes("every other figure comes from"));
    assert.ok(json.howToRead.includes("Other providers' run notes name their own runs."));
  });

  test("results.md lists Archil's own runs; llms.txt carries the same howToRead", () => {
    const md = agentMarkdown();
    assert.ok(md.includes("## Own runs for By location and SDK setup"));
    // The old shared-run claims were false: Instabox and boxd have later location batches, Baseten, Instabox and Beam their own SDK setup commits.
    assert.ok(!md.includes("By location rows come from batch") && !md.includes("SDK setup from the run at commit"));
    assert.ok(!md.includes("every other row comes from") && !md.includes("every other figure comes from"));
    assert.ok(md.includes("These providers' By location rows or SDK setup figures come from their own runs, named here:"));
    assert.ok(
      md.includes(
        `- Archil: By location from its own batches, commit 1f1de78: EU-Central ${batches.eu.join(" and ")}; US-East ${batches["us-east"].join(" and ")}. SDK setup from run sbx57-mwtux8wi (commit 1f1de78, Nov 23, 2026).`,
      ),
    );
    assert.equal(md.split("\n").filter((l) => l.startsWith("- ") && l.includes("By location from its own batches")).length, 1);
    assert.ok(llmsTxt().includes("`runProvenance`"));
  });
});
