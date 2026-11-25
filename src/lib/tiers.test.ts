import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { relative } from "@/components/cpu-tiers";
import { agentData } from "@/lib/agent-data";
import { costPick } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";
import { alternativesTrack } from "@/lib/seo/alternatives";
import { providerTrack } from "@/lib/seo/provider";
import { rowFill } from "@/lib/marks";
import { cpuCaveat, cpuTiers, isExtraTier, isPreemptible, isProviderId, providerBrand, providerInfo, tierHourly, tierOf, tiersOf } from "@/lib/providers";
import { notCountedWhy } from "@/lib/realistic";
import { trackScores } from "@/lib/score-categories";

const value = (v: number) => ({ kind: "value" as const, value: v, text: String(v) });

describe("CPU tiers", () => {
  test("a provider's first tier is its own row; the rest are sibling rows of the same brand", () => {
    for (const [brand, tiers] of Object.entries(cpuTiers)) {
      const [first, ...rest] = tiers;
      assert.equal(first.id, brand, `${brand}'s first tier is its own row`);
      assert.equal(isExtraTier(first.id), false);
      for (const t of rest) {
        assert.equal(isExtraTier(t.id), true, `${t.id} is an extra tier`);
        assert.equal(providerBrand(t.id), brand, `${t.id} belongs to ${brand}`);
      }
      assert.ok(tiers.length <= 4, "at most four rows per provider");
    }
  });

  test("every row that names a brand and a CPU tier is in the tier registry", () => {
    const ids = Object.keys(providerInfo).filter(isProviderId);
    for (const id of ids.filter((x) => tierOf(x) !== undefined)) assert.ok(tiersOf(id).some((t) => t.id === id));
    assert.equal(tierOf("e2b"), undefined);
    assert.equal(isExtraTier("upstash-ephemeral"), false, "a separate product is not a CPU tier");
  });

  test("tiers keep the provider's colour and read apart by fill", () => {
    assert.equal(rowFill("beam", "solid"), "solid");
    assert.equal(rowFill("beam-shared", "solid"), "light");
    assert.equal(rowFill("beam-spot", "solid"), "hatched");
    assert.equal(rowFill("beam-shared", "striped"), "striped", "a striped part stays striped");
    assert.equal(rowFill("e2b", "solid"), "solid");
  });

  test("list price per hour on 4 vCPU and 8 GB matches Beam's published examples", () => {
    const m = { cpu: 4, memoryGiB: 8 };
    const [performance, shared, spot] = cpuTiers.beam;
    assert.equal(tierHourly(performance, m).toFixed(3), "0.280");
    assert.equal(tierHourly(shared, m).toFixed(3), "0.088");
    assert.equal(tierHourly(spot, m).toFixed(4), "0.0360");
  });

  test("a provider is picked on its first tier; spot says it can be stopped", () => {
    assert.equal(isPreemptible("beam-spot"), true);
    assert.equal(isPreemptible("beam-shared"), false);
    const row = { incomplete: 0, flags: [], track: "same-machine" as const, cost: null };
    assert.deepEqual(notCountedWhy({ ...row, provider: "beam" }), []);
    assert.match(notCountedWhy({ ...row, provider: "beam-shared" }).join(), /CPU tier/);
    assert.match(notCountedWhy({ ...row, provider: "beam-spot" }).join(), /stop it before the task ends/);
  });

  test("every tier that isn't dedicated carries a CPU caveat of its own class; a dedicated tier has none", () => {
    for (const t of Object.values(cpuTiers).flat()) {
      const caveat = cpuCaveat(t.id);
      if (t.cpu === "dedicated") assert.equal(caveat, null, t.id);
      else assert.equal(caveat?.cpu, t.cpu, t.id);
    }
    assert.deepEqual(cpuCaveat("styne"), { cpu: "burstable", short: "Burstable · 16% baseline", detail: "Burstable shared CPU: up to 10 min full-speed burst credit, then held to 16% per vCPU" });
    assert.equal(cpuCaveat("beam-spot")?.short, "Spot · preemptible");
    assert.equal(cpuCaveat("beam-shared")?.short, "Shared vCPU");
    assert.equal(cpuCaveat("e2b"), null);
  });

  test("relative wording against the first tier", () => {
    assert.equal(relative(value(10), value(10.3), "lower", false)?.text, "same");
    assert.equal(relative(value(10), value(24), "lower", false)?.text, "2.4× slower");
    assert.equal(relative(value(100), value(50), "higher", false)?.text, "2.0× slower");
    assert.equal(relative(value(10), value(5), "lower", false)?.text, "2.0× faster");
    assert.equal(relative(value(0.28), value(0.088), "lower", true)?.text, "69% less");
    assert.equal(relative(value(1), value(1.5), "lower", true)?.text, "1.5× more");
    assert.equal(relative({ kind: "none", why: "Not run yet" }, value(1), "lower", false), null);
    assert.equal(relative(value(10), value(5), "lower", false)?.tone, "better");
    assert.equal(relative(value(100), value(50), "higher", false)?.tone, "worse");
    assert.equal(relative(value(10), value(10.3), "lower", false)?.tone, "same");
    assert.equal(relative(value(100), value(104.9), "higher", false)?.tone, "same");
    assert.equal(relative(value(100), value(95.1), "higher", false)?.tone, "same", "5% either side of the first tier is the same");
  });
});

describe("CPU tiers on the published data", () => {
  test("no headline pick, rank or alternative names an extra tier", () => {
    const extras = Object.keys(providerInfo).filter(isProviderId).filter(isExtraTier);
    const names = extras.map((id) => providerInfo[id].name);
    for (const tid of trackIds) {
      const t = agentData().tracks[tid];
      for (const q of t.quickPicks) for (const n of names) assert.ok(!`${q.pick} ${q.runnerUp}`.includes(n), `${tid} ${q.need} names ${n}`);
      const c = costPick(tracks[tid]);
      if (c.kind === "picked") assert.ok(!isExtraTier(c.pick.id));
      const beam = providerTrack(tid, "beam");
      const firsts = t.providers.filter((p) => !isExtraTier(p.id)).length;
      if (beam) assert.equal(beam.providerCount, firsts);
      for (const a of alternativesTrack(tid, "e2b")?.alternatives ?? []) assert.ok(!isExtraTier(a.id), a.id);
      for (const { scores } of trackScores(tracks[tid])) for (const s of scores) assert.ok(!isExtraTier(s.provider), `${tid} scores ${s.provider}`);
    }
  });
});
