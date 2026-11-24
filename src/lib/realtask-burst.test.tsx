import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RealtaskBurstChart } from "@/components/realtask-burst";
import { agentData, agentMarkdown } from "@/lib/agent-data";
import { burstTimes, parseRealtaskBurst } from "@/lib/realtask-burst";
import { realtaskBurst } from "@/lib/realtask-burst-data";
import { checkMergeSettings } from "../../scripts/realtask-burst-site-data";

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
    assert.match(text, /each on its own run day \(Nov 19; Daytona on Nov 23, run dv2-rtb\)/);
    assert.match(text, /\(SDK commit abcdef1; Daytona on Nov 23, run dv2-rtb, SDK 75a7dd2\)/);

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

describe("real tasks at once: run IDs and the export", () => {
  test("a chart with no provider of its own run keeps its run text, with no run ID", () => {
    const text = renderToStaticMarkup(<RealtaskBurstChart data={parseRealtaskBurst(fixture)} />).replace(/<[^>]+>/g, " ");
    assert.match(text, /all on Nov 19, so both numbers share the hour/);
    assert.match(text, /\(SDK commit abcdef1\)\. Few runs/);
    assert.doesNotMatch(text, /run rtb-test/);
  });

  test("the published chart names Archil's own run beside its date and commit", () => {
    const text = renderToStaticMarkup(<RealtaskBurstChart data={realtaskBurst} />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.match(text, /each on its own run day \(Nov 19; Archil on Nov 23, run rtb-archil-1123\)/);
    assert.match(text, /\(SDK commit c591984; Archil on Nov 23, run rtb-archil-1123, SDK 1f1de78\)/);
  });

  test("results.json carries every provider's result and run, and Archil's withheld ratio with its note", () => {
    const d = agentData().realTasksAtOnce;
    assert.equal(d.size, realtaskBurst.size);
    assert.equal(d.providers.length, realtaskBurst.providers.length);
    const archil = d.providers.find((p) => p.provider === "archil");
    assert.ok(archil && archil.status === "ran");
    const source = realtaskBurst.providers.find((p) => p.provider === "archil");
    assert.ok(source && source.status === "ran");
    assert.deepEqual(archil.change, { status: "withheld", why: source.changeNote });
    assert.deepEqual(archil.run, { id: "rtb-archil-1123", sdkCommit: "1f1de780ca8d334f3834ca388cf216ed515f254a", startedAt: "2026-11-23T22:59:54.953Z", own: true });
    assert.equal(archil.completed, source.completed);
    assert.equal(archil.attempts, source.attempts);
    for (const p of d.providers) {
      if (p.status !== "ran" || p.provider === "archil") continue;
      assert.equal(p.run.id, realtaskBurst.run.id, p.provider);
      assert.equal(p.run.own, false, p.provider);
    }
    const e2b = d.providers.find((p) => p.provider === "e2b");
    assert.ok(e2b && e2b.status === "ran");
    assert.deepEqual(e2b.change, { status: "measured", atOnceOverAlone: 0.922, withoutUpload: 0.906 });
    const daytona = d.providers.find((p) => p.provider === "daytona");
    assert.equal(daytona?.status, "not-run");
  });

  test("results.md has the table, with Archil's own run and its withheld ratio", () => {
    const md = agentMarkdown();
    assert.match(md, /# Real tasks at once \(same machine, fix and test, 5 at once\)/);
    assert.match(md, /\| Archil \| 67 s \| 10 of 10 \| 2 min 6 s \| withheld \| n\/a \| rtb-archil-1123 \(own run\), 2026-11-23, SDK 1f1de78 \|/);
    assert.match(md, /\| E2B \| 2 min 0 s \| 10 of 10 \| 2 min 10 s \| 0\.92× \| 0\.91× \| rtb1119-seq1, 2026-11-19, SDK c591984 \|/);
    assert.match(md, /Archil: ratio withheld\. One of Archil's two tasks alone spent 127 s uploading/);
  });
});

describe("--merge settings", () => {
  const base = { size: 5, rounds: 2, track: "same-machine", profile: "fix-and-test", run: { id: "base", mode: "one-provider-at-a-time", location: "here" } };
  const merge = (extra: Record<string, unknown>) => () => checkMergeSettings({ base, extra, file: "rerun.json" });

  test("a rerun with the base run's settings merges, whatever its location", () => {
    assert.doesNotThrow(merge({ ...base, run: { ...base.run, id: "rerun", location: "elsewhere" } }));
  });

  test("a rerun with another burst size, round count, track, profile or mode stops the merge, naming each difference", () => {
    assert.throws(merge({ ...base, size: 10 }), /--merge rerun.json doesn't match the --in run's settings: size is 10, the base run's is 5$/);
    assert.throws(merge({ ...base, rounds: 3 }), /rounds is 3, the base run's is 2/);
    assert.throws(merge({ ...base, track: "default" }), /track is "default", the base run's is "same-machine"/);
    assert.throws(merge({ ...base, profile: "build", size: 10 }), /size is 10, the base run's is 5; profile is "build", the base run's is "fix-and-test"/);
    assert.throws(merge({ ...base, run: { ...base.run, mode: "all-at-once" } }), /run.mode is "all-at-once", the base run's is "one-provider-at-a-time"/);
    assert.throws(merge({ ...base, run: { id: "rerun" } }), /run.mode is nothing/);
    const { profile: _profile, ...noProfile } = base;
    assert.throws(merge(noProfile), /profile is nothing, the base run's is "fix-and-test"/);
  });
});
