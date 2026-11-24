import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { CostPerTaskChart, CostTable, costColumns } from "@/components/cost";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { isPriced, perThousandText, taskCostOf, usageCostField } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";
import { billingTag, estimatedPartText, holdTag, statusTag } from "@/lib/realistic";
import type { EstimatedPart } from "@/lib/realistic";
import { providerNotes } from "@/lib/seo/provider";

// Archil's quick-task cost is the usage cost its per-sandbox usage API reports, unsettled. Every
// label and export says so for Archil only; Daytona (also billed and unsettled) and Upstash Box
// (billed and settled) are pinned to read exactly as before. Run with `bun test`.

const usageTag = "usage cost, unsettled";
const others = ["daytona", "upstash"] as const satisfies readonly ProviderId[];

/** A provider's per-1,000 amount on a track, as the site prints it in tight cells. */
function tight(track: TrackId, id: ProviderId) {
  const c = taskCostOf(tracks[track], id);
  assert.ok(c && isPriced(c), `${id} has a cost on ${track}`);
  return perThousandText(c, "tight");
}

/** The table row (desktop) and list item (phone) of one provider in the cost table. */
function rowsFor(html: string, name: string) {
  const tr = html.split("<tr").find((r) => r.includes(name) && r.includes("<td")) ?? "";
  const li = html.split("<li").find((r) => r.includes(name)) ?? "";
  return { tr, li };
}

describe("item 1: the home page's cost bars and tables tag Archil's usage cost", () => {
  const amounts = { default: "$1.58", "same-spec": "$6.33" } as const satisfies Record<TrackId, string>;

  for (const id of trackIds) {
    test(`${id}: Archil's bar carries the tag, and no other bar does`, () => {
      const { columns } = costColumns(tracks[id]);
      const archil = columns.find((c) => c.provider === "archil");
      assert.equal(archil?.label, amounts[id]);
      assert.equal(archil?.tag, usageTag);
      for (const c of columns.filter((x) => x.provider !== "archil")) assert.equal(c.tag, undefined, `${c.provider} has no tag`);
      for (const o of others) assert.ok(!("tag" in (columns.find((c) => c.provider === o) ?? {})), `${o}'s column is unchanged`);
    });

    test(`${id}: Archil's table cell says usage cost, unsettled on desktop and phone`, () => {
      const html = renderToStaticMarkup(<CostTable track={tracks[id]} />);
      const { tr, li } = rowsFor(html, "Archil");
      assert.ok(tr.includes(amounts[id]) && tr.includes(usageTag), "desktop row");
      assert.ok(li.includes(amounts[id]) && li.includes(usageTag), "phone row");
    });

    test(`${id}: Daytona's and Upstash Box's cells are the bare amount, as before`, () => {
      const html = renderToStaticMarkup(<CostTable track={tracks[id]} />);
      for (const [o, name] of [["daytona", "Daytona"], ["upstash", "Upstash Box"]] as const) {
        const { tr, li } = rowsFor(html, name);
        assert.ok(tr.includes(`<td class="py-s pr-5 font-mono text-xs whitespace-nowrap tabular-nums">${tight(id, o)}</td>`), `${o} desktop`);
        assert.ok(li.includes(`<span class="font-mono text-xs tabular-nums">${tight(id, o)}</span>`), `${o} phone`);
        assert.ok(!tr.includes("usage cost") && !li.includes("usage cost"), `${o} has no usage-cost tag`);
      }
    });
  }

  test("the full cost chart shows the tag", () => {
    const html = renderToStaticMarkup(<CostPerTaskChart track={tracks.default} />);
    assert.ok(html.includes(usageTag));
  });
});

describe("item 2: results.json and results.md tell Archil's usage cost apart", () => {
  const providerOf = (track: TrackId, id: ProviderId) => {
    const p = agentData().tracks[track]?.providers.find((x) => x.id === id);
    assert.ok(p, `${id} on ${track}`);
    return p;
  };

  for (const id of trackIds) {
    test(`${id}: Archil's cost keeps kind billed and adds origin usage-api; others have no origin`, () => {
      const archil = providerOf(id, "archil").costPerTask;
      assert.equal(archil.kind, "billed");
      assert.ok("origin" in archil && archil.origin === "usage-api");
      for (const o of others) {
        const c = providerOf(id, o).costPerTask;
        assert.equal(c.kind, "billed");
        assert.ok(!("origin" in c), `${o} has no origin`);
        assert.deepEqual(Object.keys(c), ["kind", "perTaskUsd", "per1000TasksUsd", "confidence", "tasks", "source", "basis", "settled", "billingStatus", "billingVerified", "statusNote", "tag"]);
      }
      assert.equal(providerOf(id, "daytona").costPerTask.tag, "billed");
      assert.equal(providerOf(id, "upstash").costPerTask.tag, "billed");
    });
  }

  test("the reading notes define origin usage-api and name Archil", () => {
    const how = agentData().howToRead;
    assert.match(how, /`origin: "usage-api"` marks a usage cost \(Archil\): the amount the provider's per-sandbox usage API reports, not a charge from its bill\. Its `kind` stays `billed`/);
    assert.ok(llmsTxt().includes('`origin: "usage-api"` marks a usage cost (Archil)'));
  });

  test("results.md's Cost kind column says usage cost for Archil and billed for Daytona and Upstash Box", () => {
    // The "Machines and cost" table of each track: the lines after its header, up to the blank line.
    const tables = agentMarkdown()
      .split("| Provider | Asked for |")
      .slice(1)
      .map((t) => t.split("\n\n")[0]?.split("\n") ?? []);
    assert.equal(tables.length, trackIds.length);
    assert.ok(tables.every((t) => t[0]?.includes(" Cost kind |")));
    const kindOf = (name: string) => tables.flatMap((t) => t.filter((l) => l.startsWith(`| ${name} |`)).map((l) => l.split("|")[8]?.trim()));
    assert.deepEqual(kindOf("Archil"), ["usage cost", "usage cost"]);
    assert.deepEqual(kindOf("Daytona"), ["billed", "billed"]);
    assert.deepEqual(kindOf("Upstash Box"), ["billed", "billed"]);
  });
});

describe("item 3: Archil's unsettled note stays on Archil's page", () => {
  test("no export compares Archil's costs with Daytona's", () => {
    assert.ok(!llmsTxt().includes("as Daytona's are"));
    assert.ok(!agentMarkdown().includes("as Daytona's are"));
  });

  test("Daytona's notes carry no Archil sentence, and Archil's carry its metadata note", () => {
    assert.deepEqual(providerNotes("daytona").filter((s) => s.includes("Archil")), []);
    assert.ok(providerNotes("archil").some((s) => s.startsWith("Archil's costs are the usage cost its per-sandbox usage API reports, shown as unsettled: Archil drops")));
  });
});

describe("item 4: realistic cost labels say usage cost for Archil", () => {
  // A fixture: Archil's realistic rows land later, with the same usage source as its quick-task cost.
  const row = (provider: ProviderId, eligible: boolean, flags: string[], estimatedPart: EstimatedPart | null = null) => ({
    provider,
    cost: { kind: "billed" as const, usdPerCompleted: 0.01, wholeMachineUsdPerCompleted: null, wholeMachineBound: "exact" as const },
    eligible,
    flags,
    estimatedPart,
  });
  const disk: EstimatedPart = { usd: 0.001, labels: ["disk at list price"] };

  test("Archil's unsettled row, with and without an estimated disk part", () => {
    assert.equal(statusTag(row("archil", false, ["unsettled (5 attempts)"])), "usage cost, unsettled");
    assert.equal(billingTag(row("archil", false, ["unsettled (5 attempts)"])), "usage cost, unsettled");
    assert.equal(statusTag(row("archil", false, ["unsettled (5 attempts)"], disk)), "compute usage cost, unsettled; disk estimated");
    assert.equal(statusTag(row("archil", true, [], disk)), "compute verified (usage cost, settled); disk estimated");
    assert.equal(holdTag({ provider: "archil", costKind: "billed", statuses: ["unsettled"], estimatedPart: null }), "usage cost, unsettled");
    assert.equal(holdTag({ provider: "archil", costKind: "billed", statuses: ["unsettled"], estimatedPart: disk }), "compute usage cost, unsettled; disk estimated");
    assert.equal(
      estimatedPartText({ id: "archil", kind: "billed", part: disk, total: 0.01, unit: "per 1,000" }),
      "$1.00 per 1,000 of it (10.00%) is disk added at list price, an estimate; the rest is compute at the usage cost its usage API reports.",
    );
    assert.deepEqual(usageCostField("archil", { kind: "billed" }), { origin: "usage-api" });
  });

  test("Daytona and Upstash Box read billed, as before, on the same rows", () => {
    for (const o of others) {
      assert.equal(statusTag(row(o, false, ["unsettled (5 attempts)"])), "billed, unsettled");
      assert.equal(billingTag(row(o, true, [])), "billed, verified");
      assert.equal(statusTag(row(o, true, [], disk)), "compute verified (billed, settled); disk estimated");
      assert.equal(holdTag({ provider: o, costKind: "billed", statuses: ["unsettled"], estimatedPart: disk }), "compute billed, unsettled; disk estimated");
      assert.equal(
        estimatedPartText({ id: o, kind: "billed", part: disk, total: 0.01, unit: "per 1,000" }),
        "$1.00 per 1,000 of it (10.00%) is disk added at list price, an estimate; the rest is billed compute.",
      );
      assert.deepEqual(usageCostField(o, { kind: "billed" }), {});
    }
    // A metered or estimated Archil figure is not a usage cost: only its billed export is.
    assert.deepEqual(usageCostField("archil", { kind: "metered" }), {});
  });
});
