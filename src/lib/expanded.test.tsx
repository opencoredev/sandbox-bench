import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import expandedFile from "@/data/expanded.json";
import { ExpandedBenchmarks } from "@/components/expanded-benchmarks";
import { expandedProviders, hasExpanded, ownRun, ownRunsText, parseExpanded } from "@/lib/expanded";
import { agentData, agentMarkdown } from "@/lib/agent-data";
import { formatShort, formatValue, unitName } from "@/lib/format";

// The expanded benchmarks: parsing the sweep's export, ordering best first, units, and showing nothing until there are results. Run with `bun test`.

const categories = ["cpu", "agent-tasks", "agent-loops", "filesystem", "builds", "runtime"];

const emptyExport = { version: 1, scenarioCount: 0, categories, metrics: [] };

const value = (provider: string, median: number, n = 5) => ({ provider, n, median, min: median * 0.9, max: median * 1.2 });

const metric = (id: string, category: string, unit: string, better: "lower" | "higher", values: readonly ReturnType<typeof value>[]) => ({
  id,
  category,
  label: `Test ${id}`,
  description: `What ${id} does.`,
  unit,
  better,
  values,
});

const fixture = {
  version: 1,
  scenarioCount: 4,
  categories,
  generatedAt: "2026-11-21T10:00:00Z",
  runId: "expanded-2026-11-21T09-00-00-000Z",
  runs: 5,
  metrics: [
    metric("npm-build", "builds", "s", "lower", [value("e2b", 30), value("daytona", 12), value("modal", 20), value("not-a-provider", 1)]),
    metric("fs-create", "filesystem", "files/s", "higher", [value("e2b", 4_000), value("daytona", 12_500), value("modal", 9_000)]),
    metric("sqlite", "runtime", "queries/s", "higher", [value("daytona", 52_000), value("e2b", 81_000)]),
    metric("spawn", "runtime", "spawns/s", "higher", [value("modal", 640), value("e2b", 900)]),
  ],
};

/** Bar providers in order; each chart draws twice (phones and wide screens), so repeats are dropped. */
const order = (html: string) => [...new Set([...html.matchAll(/aria-label="([^":&]+): Median/g)].flatMap((m) => (m[1] ? [m[1]] : [])))];

describe("parse", () => {
  test("an empty export parses and has nothing to show", () => {
    const e = parseExpanded(emptyExport);
    assert.equal(e.scenarioCount, 0);
    assert.deepEqual(e.groups.map((g) => g.label), ["CPU", "Agent tasks", "Agent loops", "Filesystem", "Builds", "Runtime"]);
    assert.equal(hasExpanded(e), false);
    assert.deepEqual([e.generatedAt, e.runId, e.runs], [null, null, null]);
  });

  test("the checked-in expanded.json parses cleanly with all 24 scenarios", () => {
    const e = parseExpanded(expandedFile);
    assert.equal(e.scenarioCount, 24);
    assert.equal(hasExpanded(e), true);
    assert.equal(e.groups.every((g) => g.metrics.length === 4), true);
    assert.ok(expandedProviders(e).length >= 10);
  });

  test("metrics with no values are not results", () => {
    assert.equal(hasExpanded(parseExpanded({ ...fixture, metrics: [metric("x", "cpu", "ops/s", "higher", [])] })), false);
    assert.equal(hasExpanded(parseExpanded({ ...fixture, metrics: [metric("x", "cpu", "ops/s", "higher", [value("unknown-co", 5)])] })), false, "only unknown providers");
  });

  test("sorts best first for lower and higher, drops unknown providers and keeps the run metadata", () => {
    const e = parseExpanded(fixture);
    const byId = new Map(e.groups.flatMap((g) => g.metrics).map((m) => [m.id, m]));
    assert.deepEqual(byId.get("npm-build")?.values.map((v) => v.provider), ["daytona", "modal", "e2b"]);
    assert.deepEqual(byId.get("fs-create")?.values.map((v) => v.provider), ["daytona", "modal", "e2b"]);
    assert.deepEqual(byId.get("sqlite")?.values.map((v) => v.provider), ["e2b", "daytona"]);
    assert.deepEqual(expandedProviders(e), ["e2b", "daytona", "modal"]);
    assert.deepEqual([e.generatedAt, e.runId, e.runs], [fixture.generatedAt, fixture.runId, 5]);
    assert.deepEqual(e.groups.find((g) => g.category === "runtime")?.metrics.map((m) => m.id), ["sqlite", "spawn"]);
  });

  test("a malformed export stops the build", () => {
    assert.throws(() => parseExpanded({ ...fixture, version: 2 }), /version must be 1/);
    assert.throws(() => parseExpanded({ ...fixture, metrics: [metric("x", "gpu", "s", "lower", [])] }), /not a known category: gpu/);
    assert.throws(() => parseExpanded({ ...fixture, metrics: [metric("x", "cpu", "req/s", "lower", [])] }), /not a known unit: req\/s/);
    assert.throws(() => parseExpanded({ ...fixture, metrics: [metric("x", "cpu", "s", "lower", [{ provider: "e2b", n: 3, median: 5, min: 6, max: 7 }])] }), /out of order/);
    assert.throws(() => parseExpanded({ ...fixture, metrics: [metric("x", "cpu", "s", "lower", [value("e2b", 1), value("e2b", 2)])] }), /lists e2b twice/);
    assert.throws(() => parseExpanded({ ...fixture, metrics: [fixture.metrics[0], fixture.metrics[0]] }), /lists npm-build twice/);
    assert.throws(() => parseExpanded({ ...fixture, runs: "five" }), /runs must be a whole number/);
    assert.throws(() => parseExpanded({ ...fixture, generatedAt: "yesterday" }), /not a date/);
  });
});

describe("format", () => {
  test("files/s, queries/s, spawns/s and fractional small throughput rates", () => {
    assert.equal(formatValue(12_500, "files/s"), "12.5K files/s");
    assert.equal(formatValue(81_000, "queries/s"), "81K queries/s");
    assert.equal(formatValue(640, "spawns/s"), "640 spawns/s");
    assert.equal(formatValue(0.158664, "MB/s"), "0.16 MB/s");
    assert.equal(formatValue(1.808, "MB/s"), "1.8 MB/s");
    assert.equal(formatValue(46.7, "MB/s"), "47 MB/s");
    assert.equal(formatValue(2651, "MB/s"), "2.7 GB/s");
    assert.equal(formatShort(0.158664, "MB/s"), "0.16");
    assert.equal(formatShort(12_500, "files/s"), "12.5K");
    assert.equal(unitName["queries/s"], "queries per second");
    assert.equal(unitName["spawns/s"], "process spawns per second");
  });
});

describe("section", () => {
  test("renders nothing until a test has a result", () => {
    assert.equal(renderToStaticMarkup(<ExpandedBenchmarks data={parseExpanded(emptyExport)} />), "");
    assert.equal(renderToStaticMarkup(<ExpandedBenchmarks data={parseExpanded({ ...fixture, metrics: [metric("x", "cpu", "s", "lower", [])] })} />), "");
  });

  test("one tab per category, those without results disabled, each test best first with its unit and direction", () => {
    const html = renderToStaticMarkup(<ExpandedBenchmarks data={parseExpanded(fixture)} />);
    for (const label of ["CPU", "Agent tasks", "Agent loops", "Filesystem", "Builds", "Runtime"]) assert.ok(html.includes(`>${label}`), `tab ${label}`);
    assert.equal((html.match(/title="no results yet"/g) ?? []).length, 3, "CPU, Agent tasks and Agent loops have no results");
    const build = html.slice(html.indexOf("Test npm-build"));
    assert.deepEqual(order(build.slice(0, build.indexOf("Notes ("))), ["Daytona", "Modal", "E2B"]);
    assert.ok(html.includes("Median seconds · Lower is better"));
    assert.ok(html.includes("Median files per second · Higher is better"));
    assert.ok(html.includes("What fs-create does."));
    assert.doesNotMatch(html, /not-a-provider/);
  });

  test("hover cards give the median, range and verified runs; a provider missing from a test is named", () => {
    const html = renderToStaticMarkup(<ExpandedBenchmarks data={parseExpanded(fixture)} />);
    assert.ok(html.includes("Median 12.5K files/s"));
    assert.ok(html.includes("Range 11.3K files/s–15K files/s"));
    assert.ok(html.includes("Median 81K queries/s"));
    assert.ok(html.includes("Median 640 spawns/s"));
    assert.ok(html.includes("Verified runs 5"));
    const sqlite = html.slice(html.indexOf("Test sqlite"), html.indexOf("Test spawn"));
    assert.match(sqlite, /No result for .*Modal/);
    assert.ok(html.includes("fresh random seed"));
    assert.ok(html.includes("5 runs per provider and test"));
  });
});

// Modal's sqlite and spawn values come from its own two runs; everyone else's from the sweep's runId.
const withOwnRuns = {
  ...fixture,
  providerRuns: {
    modal: [
      { id: "modal-run-a", startedAt: "2026-11-23T22:57:38.230Z", sdkCommit: "aaaaaaa", metrics: ["npm-build", "fs-create"] },
      { id: "modal-run-b", startedAt: "2026-11-24T00:12:06.287Z", sdkCommit: "bbbbbbb", metrics: ["spawn"] },
    ],
    "not-a-provider": [{ id: "x", startedAt: "2026-11-24T00:00:00Z", sdkCommit: "c", metrics: ["spawn"] }],
  },
};

describe("provider runs", () => {
  test("an export without providerRuns parses as before, every value from the sweep", () => {
    const e = parseExpanded(fixture);
    assert.deepEqual(e.providerRuns, {});
    assert.equal(ownRun(e, "e2b", "npm-build"), null);
    assert.equal(ownRunsText(e, e.groups.flatMap((g) => g.metrics), "e2b"), null);
  });

  test("each of a provider's values is attributed to the run that produced it; unknown providers are dropped", () => {
    const e = parseExpanded(withOwnRuns);
    assert.deepEqual(Object.keys(e.providerRuns), ["modal"]);
    assert.equal(ownRun(e, "modal", "npm-build")?.id, "modal-run-a");
    assert.equal(ownRun(e, "modal", "spawn")?.id, "modal-run-b");
    assert.equal(ownRun(e, "e2b", "spawn"), null, "a provider without its own runs stays on the sweep");
    const runtime = e.groups.find((g) => g.category === "runtime")?.metrics ?? [];
    assert.equal(ownRunsText(e, runtime, "modal"), "from its own run modal-run-b on Nov 24 (UTC), commit bbbbbbb, not expanded-2026-11-21T09-00-00-000Z");
    const all = e.groups.flatMap((g) => g.metrics);
    assert.equal(
      ownRunsText(e, all, "modal"),
      "from its own runs, not expanded-2026-11-21T09-00-00-000Z: Test spawn from run modal-run-b on Nov 24 (UTC), commit bbbbbbb; the rest from run modal-run-a on Nov 23 (UTC), commit aaaaaaa",
    );
  });

  test("a provider run that misses, repeats or invents a test stops the build", () => {
    const runs = (metrics: readonly string[][]) => ({
      ...fixture,
      providerRuns: { modal: metrics.map((m, i) => ({ id: `r${i}`, startedAt: "2026-11-23T00:00:00Z", sdkCommit: "c", metrics: m })) },
    });
    assert.throws(() => parseExpanded(runs([["npm-build", "fs-create"]])), /has a value in spawn but no run lists it/);
    assert.throws(() => parseExpanded(runs([["npm-build", "fs-create", "spawn"], ["spawn"]])), /lists spawn in more than one run/);
    assert.throws(() => parseExpanded(runs([["npm-build", "fs-create", "spawn", "gpu-test"]])), /lists gpu-test, which metrics does not have/);
    assert.throws(() => parseExpanded({ ...fixture, providerRuns: { modal: [{ id: "r", startedAt: "soon", sdkCommit: "c", metrics: ["spawn"] }] } }), /not a date/);
  });

  test("the chart names a provider's own runs in the notes and its hover cards, and leaves other providers alone", () => {
    const html = renderToStaticMarkup(<ExpandedBenchmarks data={parseExpanded(withOwnRuns)} />);
    assert.ok(html.includes("for every provider not named below"));
    assert.match(html, /: from its own run modal-run-b on Nov 24 \(UTC\), commit bbbbbbb, not expanded-2026-11-21T09-00-00-000Z\./);
    assert.match(html, /aria-label="Modal: Median [^"]*, Own run Nov 24 \(UTC\), commit bbbbbbb"/);
    assert.doesNotMatch(html, /aria-label="E2B: [^"]*Own run/);
    const plain = renderToStaticMarkup(<ExpandedBenchmarks data={parseExpanded(fixture)} />);
    assert.doesNotMatch(plain, /Own run|not named below/);
  });

  test("the checked-in data credits Archil's runs: 23 tests from Nov 23 and stdout streaming from the Nov 24 rerun", () => {
    const e = parseExpanded(expandedFile);
    const runs = e.providerRuns.archil ?? [];
    assert.deepEqual(runs.map((r) => [r.sdkCommit, r.metrics.length]), [["a9954ea", 23], ["de32eb5", 1]]);
    assert.equal(ownRun(e, "archil", "runtime-stdout-stream")?.sdkCommit, "de32eb5");
    const results = agentData().expandedBenchmarks;
    assert.ok(results, "results.json has expanded benchmarks");
    assert.deepEqual(Object.keys(results.providerRuns ?? {}), ["archil"]);
    const tests = results.categories.flatMap((c) => c.tests);
    const stream = tests.find((t) => t.id === "runtime-stdout-stream")?.values ?? [];
    assert.equal(stream.find((v) => v.provider === "archil")?.run?.sdkCommit, "de32eb5");
    assert.ok(stream.filter((v) => v.provider !== "archil").every((v) => v.run === undefined), "other providers carry no run field");
    assert.match(agentMarkdown(), /Archil: from its own runs, not expanded-cloud-2026-11-21: stdout streaming from run expanded-2026-11-24T00-12-06-287Z \(rerun on SDK 1\.3\.1 after we fixed a bug in our Archil adapter\) on Nov 24 \(UTC\), commit de32eb5/);
  });
});
