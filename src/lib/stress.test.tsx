import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { StressSection, stressTabs } from "@/components/stress";
import { everyTab } from "@/lib/fixtures/every-tab";
import { tracks } from "@/lib/data";
import type { BurstSurvivalExport, CpuBurstExport, CpuSustainedExport, StressExport } from "@/lib/inputs";
import { hasStress, parseStress, survivalRanked } from "@/lib/stress";

// The stress section: what parses, what is charted and in which order, and that an empty export shows nothing. Run with `bun test`.

const none = { accountLimit: 0, clientNetwork: 0, provider: 0 };
const alloc = { requestedSize: "small", template: null };

const throughput = (p50: number | null, n = 5) => ({ n: p50 === null ? 0 : n, p50, p95: p50 === null ? null : p50 * 1.1, min: p50, max: p50 === null ? null : p50 * 1.15, ciLow: p50 === null ? null : p50 * 0.9, ciHigh: p50 === null ? null : p50 * 1.05 });

const sustained = (provider: string, single: number | null, all: number | null, failed = 0): CpuSustainedExport => ({
  provider,
  ...alloc,
  single: throughput(single),
  all: throughput(all),
  singleSeconds: { p50: 30, max: 31 },
  allSeconds: { p50: 30, max: 32 },
  consistency: { single: { p50: 0.97, min: 0.91 }, all: { p50: 0.95, min: 0.9 } },
  trend: { single: { p50: 0.99, min: 0.98 }, all: { p50: 0.88, min: 0.8 } },
  guestVcpus: [{ value: 4, count: 5 }],
  workers: [{ value: 4, count: 5 }],
  attempts: { successes: single === null && all === null ? 0 : 5, failures: { ...none, provider: failed }, blocked: 0, skipped: 0 },
});

const spread = (p50: number | null, maxOverMin: number | null) => ({ n: p50 === null ? 0 : 10, p50, p95: p50, min: p50, max: p50, mean: p50, maxOverMin, cv: p50 === null ? null : 0.02 });

const burst = (provider: string, p50: number | null, maxOverMin: number | null): CpuBurstExport => ({
  provider,
  ...alloc,
  work: { segments: 10, steps: 1000 },
  cohorts: 3,
  completeCohorts: 3,
  excluded: { lowOverlap: 1, invalidEvidence: 0 },
  incomplete: { cohorts: 0, members: 0 },
  members: { attempted: 30, ready: 30, completed: 30 },
  failures: none,
  perSandbox: { cohorts: 2, single: spread(p50, maxOverMin), all: spread(p50 === null ? null : p50 * 3.5, null) },
  withinCohortMaxOverMin: { p50: 1.05, max: 1.09 },
  dispatchSkewMs: { p50: 120, max: 300 },
  allCompleteS: { n: 3, p50: 41.5, max: 44 },
});

const survival = (
  provider: string,
  survived: number,
  attempted: number,
  rate: number | null,
  overrides: Partial<BurstSurvivalExport> = {},
): BurstSurvivalExport => {
  const lost = Math.max(0, attempted - survived);
  return {
    provider,
    ...alloc,
    windowS: 600,
    heartbeatS: 5,
    cohorts: 1,
    incomplete: { cohorts: 0, members: 0 },
    attempted,
    survived,
    createFailed: { total: 0, ...none },
    died: lost,
    unresponsive: 0,
    interrupted: 0,
    invalidEvidence: 0,
    invalidReasons: {},
    windowFailures: none,
    survivalRate: rate,
    ...overrides,
  };
};

const empty: StressExport = { observations: 0, runs: [], selectionRemoved: {}, cpuSustained: [], cpuBurst: [], burstSurvival: [] };

const fixture: StressExport = {
  observations: 420,
  runs: [
    { id: "stress-cpu-1", suite: "cpu-sustained", samples: 100 },
    { id: "stress-burst-1", suite: "cpu-burst", samples: 200 },
    { id: "stress-survival-1", suite: "survival", samples: 120 },
  ],
  selectionRemoved: { "superseded-cohort": 4 },
  cpuSustained: [sustained("e2b", 1_200_000, 4_000_000), sustained("daytona", 1_500_000, 5_200_000, 2), sustained("modal", null, null, 5), sustained("not-a-provider", 9e9, 9e9)],
  cpuBurst: [{ k: 10, providers: [burst("e2b", 900_000, 1.12), burst("daytona", 1_100_000, 1.4), burst("boat", null, null), burst("unknown-co", 9e9, 1)] }],
  burstSurvival: [
    {
      k: 10,
      providers: [
        survival("e2b", 4, 10, 0.4, { createFailed: { total: 1, ...none, provider: 1 }, died: 2, unresponsive: 3 }),
        survival("daytona", 10, 10, 1),
        survival("modal", 9, 10, 0.9),
        survival("boat", 0, 0, null, { cohorts: 0, incomplete: { cohorts: 1, members: 4 } }),
      ],
    },
  ],
};

describe("parse", () => {
  test("no stress block, or one with nothing to chart, is null", () => {
    assert.equal(parseStress(undefined, "default"), null);
    assert.equal(parseStress(empty, "default"), null);
    assert.equal(parseStress({ ...empty, observations: 10, cpuSustained: [sustained("e2b", null, null, 3)] }, "default"), null, "only failures: nothing to chart");
    assert.equal(hasStress(null), false);
  });

  test("drops providers the site doesn't list and keeps one row per provider", () => {
    const s = parseStress(
      { ...fixture, cpuSustained: [...fixture.cpuSustained, { ...sustained("e2b", 2_000_000, 6_000_000), single: throughput(2_000_000, 50), requestedSize: "large" }] },
      "default",
    );
    assert.ok(s);
    assert.deepEqual(s.cpuSustained.rows.map((r) => r.provider), ["e2b", "daytona", "modal"]);
    assert.equal(s.cpuSustained.rows[0]?.requestedSize, "large", "the allocation with the most data wins");
    assert.deepEqual(s.cpuSustained.others, [{ provider: "e2b", count: 1 }]);
    assert.deepEqual(s.cpuBurst[0]?.rows.map((r) => r.provider), ["e2b", "daytona", "boat"]);
  });

  test("malformed shapes, non-finite/negative metrics and contradictory survival rates stop the build", () => {
    assert.throws(() => parseStress("bad", "default"), /must be an object/);
    assert.throws(() => parseStress({ ...fixture, cpuSustained: [sustained("e2b", Number.NaN, 100)] }, "default"), /p50 is NaN/);
    assert.throws(() => parseStress({ ...fixture, cpuSustained: [sustained("e2b", -10, 100)] }, "default"), /p50 is -10/);
    assert.throws(
      () => parseStress({ ...fixture, cpuSustained: [{ ...sustained("e2b", 1_000_000, 2_000_000), single: { ...throughput(1_000_000), p95: 0.0001 } }] }, "default"),
      /p50 1000000 > p95 0.0001/,
    );
    assert.throws(
      () => parseStress({ ...fixture, cpuBurst: [{ k: 10, providers: [{ ...burst("e2b", 900_000, 1.1), perSandbox: { cohorts: 1, single: { ...spread(900_000, 1.1), p95: 500_000 }, all: spread(2_000_000, null) } }] }] }, "default"),
      /p50 900000 > p95 500000/,
    );
    assert.throws(() => parseStress({ ...fixture, cpuBurst: [{ k: 10, providers: [burst("e2b", Number.POSITIVE_INFINITY, 1.1)] }] }, "default"), /p50 is Infinity/);
    assert.throws(() => parseStress({ ...fixture, burstSurvival: [{ k: 10, providers: [survival("e2b", 8, 10, 1.2)] }] }, "default"), /survival rate 1.2/);
    assert.throws(() => parseStress({ ...fixture, burstSurvival: [{ k: 10, providers: [survival("e2b", 8, 10, 0.5)] }] }, "default"), /expected 0.8/);
    assert.throws(() => parseStress({ ...fixture, burstSurvival: [{ k: 10, providers: [survival("e2b", 0, 10, null)] }] }, "default"), /expected 0 \(0\/10\)/);
    assert.throws(() => parseStress({ ...fixture, burstSurvival: [{ k: 10, providers: [survival("e2b", 5, 5, 1, { died: 999 })] }] }, "default"), /outcomes sum to 1004, expected attempted 5/);
    assert.throws(() => parseStress({ ...fixture, burstSurvival: [{ k: 10, providers: [survival("e2b", 11, 10, 1)] }] }, "default"), /survived 11 of 10/);
    assert.throws(() => parseStress({ ...fixture, cpuBurst: [{ k: 0, providers: [] }] }, "default"), /cohort size 0/);
  });

  test("survival ranks highest rate first, then more attempts, and leaves out providers without a rate", () => {
    const s = parseStress(fixture, "default");
    assert.ok(s);
    const rows = s.burstSurvival[0]?.rows ?? [];
    assert.deepEqual(survivalRanked(rows).map((x) => x.row.provider), ["daytona", "modal", "e2b"]);
    const tie = survivalRanked([{ ...rows[0]!, provider: "e2b", survivalRate: 1, attempted: 5 }, { ...rows[1]!, provider: "daytona", survivalRate: 1, attempted: 10 }]);
    assert.deepEqual(tie.map((x) => x.row.provider), ["daytona", "e2b"]);
  });

  test("the checked-in default track carries real stress data across all three suites", () => {
    const s = tracks.default.stress;
    assert.ok(s && hasStress(s));
    assert.ok(s.cpuSustained.rows.length >= 10);
    assert.ok(s.cpuBurst.length >= 1);
    assert.ok(s.burstSurvival.length >= 1);
  });
});

/** The provider names of the bars, in order: each bar's aria-label starts with its provider. A chart draws twice (bars for phones, columns for wide screens), so repeats are dropped. */
const order = (html: string) => [...new Set([...html.matchAll(/aria-label="([^":&]+): (?:Median|Survival rate)/g)].flatMap((m) => (m[1] ? [m[1]] : [])))];

describe("section", () => {
  test("renders nothing without stress data", () => {
    assert.equal(renderToStaticMarkup(<StressSection stress={null} />), "");
    assert.equal(renderToStaticMarkup(<StressSection stress={parseStress(empty, "default")} />), "");
  });

  test("shows a tab per populated suite only", () => {
    const html = renderToStaticMarkup(<StressSection stress={parseStress({ ...fixture, cpuBurst: [], burstSurvival: [] }, "default")} />);
    assert.match(html, /Sustained CPU/);
    assert.doesNotMatch(html, /CPU under burst/);
    assert.doesNotMatch(html, /Burst survival/);
  });

  test("sustained CPU: highest first, with p50, p95, runs, consistency, trend, vCPU, workers and failed attempts on hover", () => {
    const html = everyTab(<StressSection stress={parseStress(fixture, "default")} />, stressTabs(parseStress(fixture, "default") ?? assert.fail("the fixture parses")));
    const single = html.slice(html.indexOf("Sustained CPU, single core"), html.indexOf("Sustained CPU, all cores"));
    assert.deepEqual(order(single), ["Daytona", "E2B"]);
    for (const text of ["Median 1.5M/s", "p95 1.7M/s", "Runs 5", "Min ÷ median segment 0.97 (min 0.91)", "Last ÷ first quarter 0.99", "vCPU 4", "Failed attempts 2"]) assert.ok(html.includes(text), `card has "${text}"`);
    assert.ok(html.includes("Workers 4"), "the all-cores card names the workers");
    assert.match(html, /No result for .*Modal/);
    assert.doesNotMatch(html, /not-a-provider/);
  });

  test("CPU under burst: per-sandbox median, highest first, tagged with the spread, cohort details on hover", () => {
    const html = everyTab(<StressSection stress={parseStress(fixture, "default")} />, stressTabs(parseStress(fixture, "default") ?? assert.fail("the fixture parses")));
    const burstHtml = html.slice(html.indexOf("CPU under burst, 10 at once"), html.indexOf("Burst survival, 10 at once"));
    assert.deepEqual(order(burstHtml), ["Daytona", "E2B"]);
    assert.ok(burstHtml.includes("1.12×") && burstHtml.includes("1.40×"), "tags show the fastest ÷ slowest spread");
    for (const text of ["Cohort size 10", "Complete cohorts 3 of 3", "Spread in a cohort 1.05×", "Widest cohort 1.09×", "Counted 2", "Dispatch skew 120 ms", "All complete 42 s", "Excluded cohorts 1"]) assert.ok(burstHtml.includes(text), `card has "${text}"`);
    assert.match(burstHtml, /No result for .*Boat/);
  });

  test("burst survival: highest rate first, tagged survived/attempted, on a 0 to 100% axis", () => {
    const html = everyTab(<StressSection stress={parseStress(fixture, "default")} />, stressTabs(parseStress(fixture, "default") ?? assert.fail("the fixture parses")));
    const survivalHtml = html.slice(html.indexOf("Burst survival, 10 at once"));
    assert.deepEqual(order(survivalHtml), ["Daytona", "Modal", "E2B"]);
    for (const text of ["100%", "90.0%", "40.0%", "10/10", "9/10", "4/10", "Window 600 s", "Heartbeat every 5 s", "Create failed 1", "Died 2", "Unresponsive 3", "Interrupted 0", "Invalid evidence 0"])
      assert.ok(survivalHtml.includes(text), `has "${text}"`);
    assert.ok(survivalHtml.includes("held for 600 s with a heartbeat every 5 s"));
    assert.match(survivalHtml, /No result for .*Boat/);
    assert.ok(survivalHtml.includes("1 incomplete cohort (4 members) started fewer than 10 sandboxes and was not pooled into the 10-way result"));
  });
});
