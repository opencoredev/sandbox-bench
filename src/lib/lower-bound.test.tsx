import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { CostPerTaskChart } from "@/components/cost";
import { agentMarkdown } from "@/lib/agent-data";
import { costPick, costStatus, costTag, hasLowerBounds, hourlyText, isEligible, perThousandText, pricedTasks, regionNote, wholeMachine } from "@/lib/cost";
import { parseProvider, readCostPerTask, trackIds, tracks } from "@/lib/data";
import { modalExport, onlyModalLowerBound, withModal } from "@/lib/fixtures/modal";
import { isProviderId, providerInfo, providerName } from "@/lib/providers";

// Lower bounds (Modal's default track) and region multipliers, from the SBX-103 export. Run with `bun test`.

describe("reader", () => {
  test("keeps bound and settled on cost per task", () => {
    const c = readCostPerTask(modalExport("lower"));
    assert.ok(c.kind !== "none");
    assert.equal(c.kind, "estimate");
    assert.equal(c.bound, "lower");
    assert.equal(c.settled, true);
  });

  test("keeps pricingBound, pricingRegion and regionMultiplier on the provider", () => {
    const [p] = parseProvider(modalExport("lower"));
    assert.ok(p);
    assert.equal(p.pricingBound, "lower");
    assert.equal(p.pricingRegion, "us-east");
    assert.equal(p.regionMultiplier, 1.75);
  });

  test("an export from before SBX-103 reads as no bound and no multiplier", () => {
    const { pricingBound: _b, pricingRegion: _r, regionMultiplier: _m, costPerTask, ...old } = modalExport("lower");
    const { bound: _cb, ...oldCost } = costPerTask ?? { usd: null, kind: "estimate", source: null, confidence: null, n: 0, settled: false };
    const [p] = parseProvider({ ...old, costPerTask: oldCost });
    assert.ok(p);
    assert.equal(p.pricingBound, null);
    assert.equal(p.pricingRegion, null);
    assert.equal(p.regionMultiplier, 1);
    const c = readCostPerTask({ ...old, costPerTask: oldCost });
    assert.ok(c.kind !== "none" && c.bound === null);
  });

  test("an unknown bound or a multiplier below 1 stops the build", () => {
    const row = modalExport("lower");
    const cost = row.costPerTask;
    assert.ok(cost);
    assert.throws(() => readCostPerTask({ ...row, costPerTask: { ...cost, bound: "upper" } }), /unknown price bound/);
    assert.throws(() => parseProvider({ ...modalExport("lower"), regionMultiplier: 0.5 }), /region multiplier/);
  });
});

describe("lower-bound cost", () => {
  test("is its own status, never eligible, tagged lower bound", () => {
    const t = withModal("lower");
    const c = t.costs.modal;
    assert.ok(c && c.kind !== "none");
    const s = costStatus("modal", c);
    assert.equal(s.kind, "lowerBound");
    assert.ok(!isEligible(s));
    assert.equal(costTag("modal", c, s), "estimate, lower bound");
  });

  test("never becomes the pick, never counts as lower than the pick, and sorts after every exact cost", () => {
    const published = costPick(tracks["same-spec"]);
    const t = withModal("lower");
    const c = costPick(t);
    assert.equal(c.kind, "verified");
    assert.equal(published.kind, "verified");
    if (c.kind !== "verified" || published.kind !== "verified") return;
    assert.equal(c.pick.id, published.pick.id);
    // The fixture swaps the published (billed, eligible) Modal for a lower bound, so only Modal leaves the eligible set.
    assert.deepEqual(c.eligible, published.eligible.filter((id) => id !== "modal"));
    assert.ok(!c.lower.some((x) => x.id === "modal"));
    assert.equal(pricedTasks(t).at(-1)?.id, "modal");
  });

  test("an exact Modal estimate at the same amount would be listed as lower, so the bound is what keeps it out", () => {
    const c = costPick(withModal("exact"));
    assert.ok(c.kind === "verified" && c.lower.some((x) => x.id === "modal"));
  });

  test("with only lower bounds there is no pick and no lowest figure", () => {
    const c = costPick(onlyModalLowerBound());
    assert.deepEqual(c, { kind: "none", lowest: null });
  });

  test("prints as at least, or ≥ in tight cells", () => {
    const c = withModal("lower").costs.modal;
    assert.ok(c && c.kind !== "none");
    assert.match(perThousandText(c), /^at least \$/);
    assert.match(perThousandText(c, "tight"), /^≥ \$/);
  });

  test("the cost chart renders it with at least and ≥, and never as the pick", () => {
    const html = renderToStaticMarkup(<CostPerTaskChart track={withModal("lower")} />);
    assert.match(html, /at least \$/);
    assert.match(html, /≥ \$/);
    assert.match(html, /estimate, lower bound/i);
    assert.match(html, /never ranked or picked/);
    const pickLine = html.split("Lowest verified cost among eligible providers")[1]?.split("</p>")[0] ?? "";
    assert.ok(!pickLine.includes("Modal"));
    for (const line of html.split("Lower but not eligible:").slice(1)) assert.ok(!(line.split("</p>")[0] ?? "").includes("Modal"));
  });

  test("the cost chart without lower bounds says nothing about them", () => {
    const html = renderToStaticMarkup(<CostPerTaskChart track={tracks["same-spec"]} />);
    assert.ok(!/at least|lower bound|≥/i.test(html));
  });
});

describe("lower-bound hourly price and region multiplier", () => {
  test("the whole-machine price reads at least, and the region note names the multiplier", () => {
    const [p] = parseProvider(modalExport("lower"));
    assert.ok(p);
    const w = wholeMachine(p);
    assert.equal(w.kind, "hourly");
    if (w.kind !== "hourly") return;
    assert.match(hourlyText(w), /^at least \$0\.036 an hour$/);
    assert.equal(regionNote(p), "priced at Modal's us-east rate, 1.75× its base price");
  });

  test("only Modal, pinned to us-east, has a region note; no other provider has a multiplier", () => {
    for (const id of trackIds)
      for (const p of tracks[id].providers) assert.equal(regionNote(p), p.id === "modal" ? "priced at Modal's us-east rate, 1.75× its base price" : null);
  });
});

describe("published data", () => {
  test("the only lower bound is Modal's default-machine hourly price, and the agent files say so", () => {
    assert.equal(hasLowerBounds(trackIds.map((id) => tracks[id])), true);
    for (const id of trackIds)
      for (const p of tracks[id].providers) assert.equal(p.pricingBound === "lower", p.id === "modal" && id === "default", `${id} ${p.id}`);
    // Modal's costs per task are billed, so none of them is a lower bound.
    for (const id of trackIds) for (const [pid, c] of Object.entries(tracks[id].costs)) assert.ok(!(c && c.kind !== "none" && c.bound === "lower"), `${id} ${pid}`);
    assert.match(agentMarkdown(), /≥ \$0\.036/);
  });

  test("a registered provider with no data in either track is not named absent and gets no rows", () => {
    const withData = new Set(trackIds.flatMap((id) => tracks[id].providers.map((p) => p.id)));
    const missing = Object.keys(providerInfo).filter(isProviderId).filter((id) => !withData.has(id));
    for (const id of trackIds) {
      for (const pid of missing) {
        assert.ok(!tracks[id].absent.includes(pid));
        assert.ok(!tracks[id].providers.some((p) => p.id === pid));
      }
    }
    for (const pid of missing) assert.ok(!agentMarkdown().includes(providerName(pid)));
  });

  test("Vercel Sandbox, with data in both tracks, is a provider in each", () => {
    for (const id of trackIds) assert.ok(tracks[id].providers.some((p) => p.id === "vercel"));
  });
});
