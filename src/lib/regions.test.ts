import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { deltaOf, formatDelta, parseRegional, standingOf } from "@/lib/regions";
import type { RegionCell, RegionMetric, RegionRow, RegionId } from "@/lib/regions";

// Edge cases for the regional export's parser and the comparisons built on it. Run with `bun test`.

const eu = "eu" as RegionId;
const usEast = "us-east" as RegionId;
const usWest = "us-west" as RegionId;

const cell = (p50: number): RegionCell => ({ n: 20, failures: 0, p50, p95: null });
const row = (cells: [RegionId, number][]): RegionRow => ({ provider: "e2b", metric: "m", cells: new Map(cells.map(([r, v]) => [r, cell(v)])) });
const latency: RegionMetric = { id: "m", label: "Cold start", unit: "s", better: "lower", sensitivity: "vantage" };
const throughput: RegionMetric = { id: "m", label: "Disk read", unit: "MB/s", better: "higher", sensitivity: "invariant" };

/** A minimal valid export; each test breaks one thing. */
const valid = () => ({
  schemaVersion: 1,
  batchId: "b1",
  commit: "abcdef0",
  track: "default",
  window: { start: "2026-10-24T18:12:48.346Z", end: "2026-10-24T18:17:13.220Z" },
  regions: [
    { id: "eu", label: "EU-Central", city: null, country: null, network: null, host: null, runs: 20 },
    { id: "us-east", label: "US-East", city: null, country: null, network: null, host: null, runs: 20 },
  ],
  plannedRegions: [{ id: "us-west", label: "US-West" }],
  rtt: [{ region: "eu", provider: "e2b", tcpMs: 12, firstByteMs: 40 }],
  metrics: [{ id: "cold", label: "Cold start", unit: "s", better: "lower", scale: 0.001, sensitivity: "vantage" }],
  rows: [{ provider: "e2b", metric: "cold", cells: { eu: { n: 20, failures: 0, p50: 500, p95: 700 } }, best: "eu", spread: null }],
});

type Export = ReturnType<typeof valid>;
const rejects = (change: (d: Export) => void, path: RegExp) => {
  const d = valid();
  change(d);
  assert.throws(() => parseRegional(d), path);
};

describe("parseRegional", () => {
  test("accepts a valid export and scales values", () => {
    const data = parseRegional(valid());
    assert.equal(data.rows[0]?.cells.get(eu)?.p50, 0.5);
  });
  test("rejects negative or fractional counts", () => {
    rejects((d) => { d.rows[0]!.cells.eu.n = -1; }, /rows\[0\]\.cells\.eu\.n/);
    rejects((d) => { d.rows[0]!.cells.eu.n = 2.5; }, /rows\[0\]\.cells\.eu\.n/);
    rejects((d) => { d.rows[0]!.cells.eu.n = 0; }, /rows\[0\]\.cells\.eu\.n should be a whole number, 1 or more/);
    rejects((d) => { d.rows[0]!.cells.eu.failures = -2; }, /rows\[0\]\.cells\.eu\.failures/);
    rejects((d) => { d.regions[0]!.runs = 1.5; }, /regions\[0\]\.runs/);
  });
  test("rejects a zero or negative scale", () => {
    rejects((d) => { d.metrics[0]!.scale = 0; }, /metrics\[0\]\.scale should be a number above 0/);
    rejects((d) => { d.metrics[0]!.scale = -1; }, /metrics\[0\]\.scale/);
  });
  test("rejects duplicate ids and rows", () => {
    rejects((d) => { d.regions[1]!.id = "eu"; }, /regions\[1\]\.id should be a region id not already used by regions\[0\]\.id/);
    rejects((d) => { d.plannedRegions[0]!.id = "eu"; }, /plannedRegions\[0\]\.id/);
    rejects((d) => { d.metrics.push({ ...d.metrics[0]! }); }, /metrics\[1\]\.id/);
    rejects((d) => { d.rows.push({ ...d.rows[0]! }); }, /rows\[1\] should be a provider and metric pair not already used by rows\[0\]/);
  });
  test("rejects round trips for unknown regions", () => {
    rejects((d) => { d.rtt[0]!.region = "us-west"; }, /rtt\[0\]\.region should be a region listed in regions/);
  });
  test("rejects invalid or unordered windows", () => {
    rejects((d) => { d.window.start = "not a date"; }, /window\.start should be an ISO timestamp/);
    rejects((d) => { d.window.end = ""; }, /window\.end/);
    rejects((d) => { d.window.end = "2026-10-23T00:00:00Z"; }, /window\.end should be at or after window\.start/);
  });
});

describe("standingOf", () => {
  test("one location: best is that location, spread unavailable", () => {
    const s = standingOf(row([[eu, 0.5]]), latency);
    assert.deepEqual(s?.fastest, [eu]);
    assert.equal(s?.cell.p50, 0.5);
    assert.equal(s?.spread, null);
    assert.equal(s?.locations, 1);
  });
  test("a trivial gap is a tie", () => {
    const s = standingOf(row([[usEast, 0.21125], [eu, 0.21]]), latency);
    assert.deepEqual(s?.fastest, [eu, usEast]);
  });
  test("a clear gap names one location and the spread", () => {
    const s = standingOf(row([[eu, 0.67], [usEast, 1.16]]), latency);
    assert.deepEqual(s?.fastest, [eu]);
    assert.ok(Math.abs((s?.spread ?? 0) - 1.16 / 0.67) < 1e-9);
  });
  test("higher is better picks the largest, tie only with the near one of three", () => {
    const s = standingOf(row([[eu, 100], [usEast, 98], [usWest, 50]]), throughput);
    assert.deepEqual(s?.fastest, [eu, usEast]);
    assert.equal(s?.spread, 2);
  });
  test("a zero worst throughput leaves the spread undefined", () => {
    const s = standingOf(row([[eu, 100], [usEast, 0]]), throughput);
    assert.equal(s?.spread, null);
  });
});

describe("deltaOf", () => {
  test("throughput against a zero baseline is an absolute difference, not 0%", () => {
    const d = deltaOf(throughput, cell(120), cell(0));
    assert.deepEqual(d, { kind: "absolute", value: 120, unit: "MB/s" });
    assert.equal(formatDelta(d), "+120 MB/s");
  });
  test("throughput against a non-zero baseline is a percentage", () => {
    assert.equal(formatDelta(deltaOf(throughput, cell(90), cell(100))), "−10%");
  });
  test("latency is a time difference", () => {
    assert.equal(formatDelta(deltaOf(latency, cell(0.5), cell(1.0))), "−500 ms");
  });
  test("a difference that rounds to zero has no sign", () => {
    assert.equal(formatDelta({ kind: "time", ms: -0.02 }), "±0.0 ms");
  });
});
