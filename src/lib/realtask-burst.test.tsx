import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RealtaskBurstChart } from "@/components/realtask-burst";
import { burstTimes, parseRealtaskBurst, slowdownText } from "@/lib/realtask-burst";

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

  test("slowdown reads as plain words", () => {
    assert.equal(slowdownText(1.02), "about the same as one at a time");
    assert.equal(slowdownText(1.5), "1.5× slower than one at a time");
    assert.equal(slowdownText(0.8), "1.3× faster than one at a time");
  });

  test("the chart names failures and providers with no result", () => {
    const text = renderToStaticMarkup(<RealtaskBurstChart data={parseRealtaskBurst(fixture)} />).replace(/<[^>]+>/g, " ");
    assert.match(text, /Fix and test, 2 at once/);
    assert.match(text, /No result for/);
    assert.match(text, /1 of 2 tasks failed \(tests timed out\)/);
    assert.match(text, /not run: the account allows 10 vCPU/);
  });
});
