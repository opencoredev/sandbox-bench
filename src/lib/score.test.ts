import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { tracks, trackIds } from "@/lib/data";
import type { Track } from "@/lib/data";
import { metricReadings, scoreCategories, trackScores } from "@/lib/score-categories";
import type { ScoreCategory } from "@/lib/score-categories";
import { rankScores, scoreReadings } from "@/lib/score";
import type { Score } from "@/lib/score";

const scoreOf = (scores: readonly Score[], provider: string) => scores.find((s) => s.provider === provider);

describe("scoreReadings", () => {
  test("lower is better: 100 × best ÷ value, rounded down", () => {
    const scores = scoreReadings({
      providers: ["e2b", "modal", "boat"],
      readings: [
        { provider: "e2b", value: 0.5 },
        { provider: "modal", value: 1 },
        { provider: "boat", value: 3 },
      ],
      better: "lower",
    });
    assert.deepEqual(scores, [
      { kind: "scored", provider: "e2b", score: 100, value: 0.5, best: true },
      { kind: "scored", provider: "modal", score: 50, value: 1, best: false },
      // 100 × 0.5 ÷ 3 = 16.67, rounded down.
      { kind: "scored", provider: "boat", score: 16, value: 3, best: false },
    ]);
  });

  test("higher is better: 100 × value ÷ best, so only the best scores 100", () => {
    const scores = scoreReadings({
      providers: ["e2b", "modal"],
      readings: [
        { provider: "e2b", value: 1 },
        { provider: "modal", value: 0.9991 },
      ],
      better: "higher",
    });
    assert.deepEqual(scores.map((s) => (s.kind === "scored" ? s.score : null)), [100, 99]);
  });

  test("an exact tie with float noise still scores 100", () => {
    const scores = scoreReadings({ providers: ["e2b", "modal"], readings: [{ provider: "e2b", value: 0.1 + 0.2 }, { provider: "modal", value: 0.3 }], better: "lower" });
    assert.deepEqual(scores.map((s) => (s.kind === "scored" ? s.score : null)), [100, 100]);
    assert.deepEqual(scoreReadings({ providers: ["e2b"], readings: [{ provider: "e2b", value: 0.7 }], better: "higher" }).map((s) => (s.kind === "scored" ? s.score : null)), [100]);
  });

  test("a provider with no reading is not measured, never 0", () => {
    const scores = scoreReadings({ providers: ["e2b", "beam"], readings: [{ provider: "e2b", value: 2 }], better: "lower" });
    assert.deepEqual(scoreOf(scores, "beam"), { kind: "not-measured", provider: "beam" });
    assert.ok(!scores.some((s) => s.kind === "scored" && s.provider === "beam"));
  });

  test("unusable readings (NaN, Infinity, negative) are not measured and don't set the best", () => {
    const scores = scoreReadings({
      providers: ["e2b", "modal", "boat", "beam"],
      readings: [
        { provider: "e2b", value: 2 },
        { provider: "modal", value: Number.NaN },
        { provider: "boat", value: -1 },
        { provider: "beam", value: Number.POSITIVE_INFINITY },
      ],
      better: "lower",
    });
    assert.deepEqual(scores.map((s) => s.kind), ["scored", "not-measured", "not-measured", "not-measured"]);
    assert.deepEqual(scoreOf(scores, "e2b"), { kind: "scored", provider: "e2b", score: 100, value: 2, best: true });
  });

  test("a category with no readings at all is not measured for everyone", () => {
    for (const better of ["lower", "higher"] as const) {
      const scores = scoreReadings({ providers: ["e2b", "modal"], readings: [], better });
      assert.deepEqual(scores, [{ kind: "not-measured", provider: "e2b" }, { kind: "not-measured", provider: "modal" }]);
    }
  });

  test("a best of 0 has no division by zero", () => {
    const lower = scoreReadings({ providers: ["e2b", "modal"], readings: [{ provider: "e2b", value: 0 }, { provider: "modal", value: 4 }], better: "lower" });
    assert.deepEqual(lower.map((s) => (s.kind === "scored" ? s.score : null)), [100, 0]);
    const higher = scoreReadings({ providers: ["e2b", "modal"], readings: [{ provider: "e2b", value: 0 }, { provider: "modal", value: 0 }], better: "higher" });
    assert.deepEqual(higher.map((s) => (s.kind === "scored" ? s.score : null)), [100, 100]);
  });

  test("a reading listed twice counts once, the first", () => {
    const scores = scoreReadings({ providers: ["e2b"], readings: [{ provider: "e2b", value: 1 }, { provider: "e2b", value: 9 }], better: "lower" });
    assert.deepEqual(scores, [{ kind: "scored", provider: "e2b", score: 100, value: 1, best: true }]);
  });

  test("readings for providers outside the list are ignored for scores but still can be the best", () => {
    // The best comes from every usable reading, as on the linked chart.
    const scores = scoreReadings({ providers: ["modal"], readings: [{ provider: "e2b", value: 1 }, { provider: "modal", value: 2 }], better: "lower" });
    assert.deepEqual(scores, [{ kind: "scored", provider: "modal", score: 50, value: 2, best: false }]);
  });
});

describe("rankScores", () => {
  test("highest score first, ties broken by the raw number, not measured last", () => {
    const scores: Score[] = [
      { kind: "not-measured", provider: "beam" },
      { kind: "scored", provider: "e2b", score: 50, value: 2, best: false },
      { kind: "scored", provider: "modal", score: 100, value: 1, best: true },
      { kind: "scored", provider: "boat", score: 50, value: 1.99, best: false },
    ];
    assert.deepEqual(rankScores(scores, "lower").map((s) => s.provider), ["modal", "boat", "e2b", "beam"]);
  });
});

describe("score categories on the committed data", () => {
  test("every category has a unique id and links to a section", () => {
    const ids = scoreCategories.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of scoreCategories) assert.ok(c.link.section.length > 0, c.id);
  });

  test("every track scores every provider in every category, 0 to 100, with one 100 or more per measured category", () => {
    for (const id of trackIds) {
      const track = tracks[id];
      for (const { category, scores } of trackScores(track)) {
        assert.equal(scores.length, track.providers.length, `${id} ${category.id}`);
        const scored = scores.flatMap((s) => (s.kind === "scored" ? [s] : []));
        for (const s of scored) assert.ok(s.score >= 0 && s.score <= 100 && Number.isInteger(s.score), `${id} ${category.id} ${s.provider} ${s.score}`);
        if (scored.length > 0) assert.ok(scored.some((s) => s.score === 100 && s.best), `${id} ${category.id} has no best`);
      }
    }
  });

  test("a provider with no result in the linked chart is not measured: Beam has no burst of 10 on the same machine", () => {
    const bursts = trackScores(tracks["same-spec"]).find((c) => c.category.id === "bursts");
    assert.deepEqual(bursts?.scores.find((s) => s.provider === "beam"), { kind: "not-measured", provider: "beam" });
  });

  test("default machines too small for the real task are not measured in real tasks", () => {
    const real = trackScores(tracks.default).find((c) => c.category.id === "real-tasks");
    assert.equal(real?.scores.find((s) => s.provider === "e2b")?.kind, "not-measured");
  });

  test("a new category is one entry, and one whose metric isn't exported yet is not measured everywhere", () => {
    const cpuBurst: ScoreCategory = {
      id: "cpu-burst",
      label: "CPU burst",
      measure: "Not exported yet",
      better: "higher",
      link: { section: "machines", tab: null },
      read: metricReadings("cpu-burst-not-in-export"),
      format: String,
    };
    const track: Track = tracks["same-spec"];
    const [only] = trackScores(track, [cpuBurst]);
    assert.ok(only);
    assert.ok(only.scores.every((s) => s.kind === "not-measured"));
    // An exported metric works the same way with no other code.
    const cpu = trackScores(track, [{ ...cpuBurst, id: "cpu", read: metricReadings("cpu-single") }])[0];
    assert.ok(cpu?.scores.some((s) => s.kind === "scored"));
  });
});

describe("review fixes", () => {
  test("100 and best always agree: float noise is a tie, a real gap is at most 99", () => {
    const scores = scoreReadings({
      providers: ["e2b", "modal", "boat", "beam"],
      readings: [
        { provider: "e2b", value: 1 },
        { provider: "modal", value: 1.000000000001 },
        { provider: "boat", value: 1 },
        { provider: "beam", value: 1.001 },
      ],
      better: "lower",
    });
    assert.deepEqual(scoreOf(scores, "modal"), { kind: "scored", provider: "modal", score: 100, value: 1.000000000001, best: true });
    assert.deepEqual(scoreOf(scores, "beam"), { kind: "scored", provider: "beam", score: 99, value: 1.001, best: false });
    for (const s of scores) if (s.kind === "scored") assert.equal(s.score === 100, s.best);
    const boat = scoreOf(scores, "boat");
    assert.ok(boat?.kind === "scored" && boat.score === 100 && boat.best);
  });

  test("float error doesn't cost a point: 100 × 0.29 stays 29", () => {
    const scores = scoreReadings({ providers: ["e2b", "modal"], readings: [{ provider: "e2b", value: 29 }, { provider: "modal", value: 100 }], better: "lower" });
    const modal = scoreOf(scores, "modal");
    assert.ok(modal?.kind === "scored" && modal.score === 29);
  });

  test("an excluded reading never sets the best and ranks after scored ones", () => {
    const scores = scoreReadings({
      providers: ["e2b", "modal", "boat"],
      readings: [
        { provider: "e2b", value: 1 },
        { provider: "modal", value: 4 },
        { provider: "boat", value: 2 },
      ],
      excluded: [{ provider: "e2b", why: "wrong size" }],
      better: "lower",
    });
    assert.deepEqual(scoreOf(scores, "e2b"), { kind: "excluded", provider: "e2b", why: "wrong size" });
    const boat = scoreOf(scores, "boat");
    assert.ok(boat?.kind === "scored" && boat.score === 100 && boat.best);
    assert.deepEqual(rankScores(scores, "lower").map((s) => s.provider), ["boat", "modal", "e2b"]);
  });

  test("on Same machine, boxd's wrong-size cost is not counted", () => {
    const cost = trackScores(tracks["same-spec"]).find((c) => c.category.id === "cost");
    const boxd = cost?.scores.find((s) => s.provider === "boxd");
    assert.equal(boxd?.kind, "excluded");
  });
});
