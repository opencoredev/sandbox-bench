import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RealtaskBurstChart } from "@/components/realtask-burst";
import { burstTimes, parseRealtaskBurst } from "@/lib/realtask-burst";

const task = (round: number, wallS: number | null, completed = true) => ({ round, wallS, completed, ...(completed ? {} : { failure: { stage: "work", reason: "tests timed out" } }) });

const fixture = {
  schema: 1,
  generatedAt: "2026-11-19T20:00:00Z",
  run: { id: "rtb-test", sdkCommit: "abcdef1234", startedAt: "2026-11-19T18:00:00Z", endedAt: "2026-11-19T19:00:00Z", location: "Florida, US" },
  size: 2,
  rounds: 1,
  track: "same-machine",
  profile: "fix-and-test",
  providers: [
    { provider: "modal", status: "ran", tasks: [task(1, 120), task(1, 130)], medianWallS: 125, completed: 2, attempts: 2, roundAllDoneS: [131], soloMedianWallS: 105, slowdown: 125 / 105 },
    { provider: "e2b", status: "ran", tasks: [task(1, 100), task(1, null, false)], medianWallS: 100, completed: 1, attempts: 2, roundAllDoneS: [400], soloMedianWallS: 112, slowdown: 100 / 112 },
    { provider: "boat", status: "ran", tasks: [task(1, null, false), task(1, null, false)], medianWallS: null, completed: 0, attempts: 2, roundAllDoneS: [], soloMedianWallS: 96, slowdown: null },
    { provider: "daytona", status: "not-run", reason: "the account allows 10 vCPU" },
  ],
};

describe("real tasks at once", () => {
  test("parses, orders fastest first and says why a provider has no time", () => {
    const data = parseRealtaskBurst(fixture);
    const { timed, missing } = burstTimes(data);
    assert.deepEqual(timed.map((p) => p.provider), ["e2b", "modal"]);
    assert.deepEqual(missing, [
      { id: "boat", why: "no task completed (0 of 2)" },
      { id: "daytona", why: "not run: the account allows 10 vCPU" },
    ]);
  });

  test("rejects counts that don't match the tasks", () => {
    const bad = structuredClone(fixture);
    bad.providers[0] = { ...bad.providers[0], completed: 1 } as (typeof bad.providers)[number];
    assert.throws(() => parseRealtaskBurst(bad), /completed/);
  });

  test("rejects a ratio its medians don't give, and ratios at or below 0", () => {
    const off = structuredClone(fixture);
    off.providers[0] = { ...off.providers[0], soloMedianWallS: 1 } as (typeof off.providers)[number];
    assert.throws(() => parseRealtaskBurst(off), /slowdown/);
    const zero: { providers: Record<string, unknown>[] } = structuredClone(fixture);
    zero.providers[0] = { ...zero.providers[0], slowdownWithoutUpload: 0 };
    assert.throws(() => parseRealtaskBurst(zero), /above 0/);
  });

  test("the chart names failures and providers with no result", () => {
    const text = renderToStaticMarkup(<RealtaskBurstChart data={parseRealtaskBurst(fixture)} />).replace(/<[^>]+>/g, " ");
    assert.match(text, /Fix and test, 2 at once/);
    assert.match(text, /No result for/);
    assert.match(text, /1 of 2 tasks failed \(tests timed out\)/);
    assert.match(text, /not run: the account allows 10 vCPU/);
    assert.match(text, /all on Nov 19/);
  });

  test("attributes per-provider reruns without saying all ran on the original day", () => {
    const rerun = structuredClone(fixture);
    rerun.providers[3] = {
      provider: "daytona",
      status: "ran",
      tasks: [task(1, 66), task(1, 68)],
      medianWallS: 67,
      completed: 2,
      attempts: 2,
      roundAllDoneS: [69],
      soloMedianWallS: 64,
      slowdown: 67 / 64,
      run: { id: "dv2-rtb", sdkCommit: "75a7dd2abcdef", startedAt: "2026-11-23T15:00:00Z" },
    } as (typeof rerun.providers)[number];
    const text = renderToStaticMarkup(<RealtaskBurstChart data={parseRealtaskBurst(rerun)} />).replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /all on Nov 19/);
    assert.match(text, /each on its own run day \(Nov 19; Daytona on Nov 23\)/);
    assert.match(text, /Daytona on Nov 23, SDK 75a7dd2/);

    for (const invalid of ["undefined", "0", "2026-02-30T15:00:00Z", "2026-11-23"]) {
      const badDate = structuredClone(rerun);
      (badDate.providers[3] as unknown as { run: { startedAt: string } }).run.startedAt = invalid;
      assert.throws(() => parseRealtaskBurst(badDate), /ISO-8601 timestamp/);
    }
    const earlyYear = structuredClone(rerun);
    (earlyYear.providers[3] as unknown as { run: { startedAt: string } }).run.startedAt = "0001-01-01T15:00:00Z";
    assert.equal(parseRealtaskBurst(earlyYear).providers[3]?.status, "ran");
  });
});
