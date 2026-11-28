import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { tracks, trackIds } from "@/lib/data";
import { headlineRows, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { isExtraTier } from "@/lib/providers";
import type { Track } from "@/lib/data";
import { metricReadings, scoreCategories, trackScores } from "@/lib/score-categories";
import type { ScoreCategory } from "@/lib/score-categories";
import { rankScores, scoreReadings } from "@/lib/score";
import type { Excluded, Reading, Score } from "@/lib/score";

/** Providers scored on a track: one row each, on the CPU tier a new account gets. */
const firsts = (track: Track) => track.providers.filter((p) => !isExtraTier(p.id));

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
  test("valued cells rank by the raw number too, cheapest first, then excluded and not measured in the given order", () => {
    const cells = [
      { kind: "not-measured", provider: "beam" },
      { kind: "valued", provider: "vercel", value: 0.043 },
      { kind: "excluded", provider: "boxd", why: "wrong size" },
      { kind: "valued", provider: "instabox", value: 0.00076 },
      { kind: "valued", provider: "e2b", value: 0.01 },
    ] as const;
    assert.deepEqual(rankScores(cells, "lower").map((s) => s.provider), ["instabox", "e2b", "vercel", "beam", "boxd"]);
    assert.deepEqual(rankScores(cells, "higher").map((s) => s.provider), ["vercel", "e2b", "instabox", "beam", "boxd"]);
  });

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
  test("five columns in order: Speed, Real tasks, Bursts, Reliability, Cost; Cost alone shows a value", () => {
    assert.deepEqual(scoreCategories.map((c) => c.label), ["Speed", "Real tasks", "Bursts", "Reliability", "Cost"]);
    assert.deepEqual(scoreCategories.map((c) => c.shows), ["score", "score", "score", "score", "value"]);
  });

  test("every category has a unique id and links to a section", () => {
    const ids = scoreCategories.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of scoreCategories) assert.ok(c.link.section.length > 0, c.id);
  });

  test("every track scores every provider in every scored category, 0 to 100, with one 100 or more per measured category", () => {
    for (const id of trackIds) {
      const track = tracks[id];
      for (const { category, scores } of trackScores(track)) {
        assert.equal(scores.length, firsts(track).length, `${id} ${category.id}`);
        if (category.shows === "value") {
          assert.ok(scores.every((s) => s.kind !== "scored"), `${id} ${category.id} shows values, not scores`);
          continue;
        }
        assert.ok(scores.every((s) => s.kind !== "valued"), `${id} ${category.id} shows scores, not values`);
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
      shows: "score",
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

  test("on Same machine, boxd's cost shows in dollars like its other scores, its machine size carried by the row's footnote", () => {
    const cost = trackScores(tracks["same-spec"]).find((c) => c.category.id === "cost");
    const boxd = cost?.scores.find((s) => s.provider === "boxd");
    assert.ok(boxd?.kind === "valued", `boxd is ${boxd?.kind ?? "missing"}`);
    assert.equal(boxd.display, "$5.50");
  });

  test("the Cost column keeps every cost the chart draws except rows with more than one failed run", () => {
    const cost: ScoreCategory | undefined = scoreCategories.find((c) => c.id === "cost");
    assert.ok(cost);
    for (const id of trackIds) {
      const { costed } = headlineRows(realistic, runTrackOf[id], "fix-and-test");
      const track: Track = tracks[id];
      const read: readonly Reading[] = cost.read(track);
      const excluded: readonly Excluded[] = cost.exclude?.(track) ?? [];
      for (const r of costed) {
        assert.equal(read.some((x) => x.provider === r.provider), r.incomplete <= 1, `${id} ${r.provider}`);
        assert.equal(excluded.some((x) => x.provider === r.provider), r.incomplete > 1, `${id} ${r.provider}`);
      }
    }
  });
});

describe("cost shows dollars, not a score", () => {
  const costOn = (id: keyof typeof tracks) => {
    const cost = trackScores(tracks[id]).find((c) => c.category.id === "cost");
    assert.ok(cost);
    return rankScores(cost.scores, cost.category.better);
  };
  const shown = (cells: ReturnType<typeof costOn>) => cells.map((s) => [s.provider, s.kind === "valued" ? s.display : s.kind]);

  test("Same machine: cheapest first in dollars per 1,000 tasks, every provider priced, boxd at $5.50 in fourth", () => {
    const cells = costOn("same-spec");
    assert.deepEqual(shown(cells).slice(0, 5), [["instabox", "$0.76"], ["boat", "$0.95"], ["maritime", "$2.13"], ["boxd", "$5.50"], ["buddy", "$5.76"]]);
    assert.deepEqual(shown(cells).find(([p]) => p === "e2b"), ["e2b", "$10.07"]);
    assert.deepEqual(shown(cells).at(-1), ["vercel", "$43.14"]);
    assert.equal(cells.length, firsts(tracks["same-spec"]).length);
    // Every provider is a dollar value, never a 0 to 100 score.
    assert.ok(cells.every((s) => s.kind === "valued" && s.display.startsWith("$")));
  });

  test("Default machines: providers without a counted run are not measured and rank after the valued ones", () => {
    const cells = costOn("default");
    const kinds = cells.map((s) => s.kind);
    const firstMissing = kinds.indexOf("not-measured");
    assert.ok(firstMissing > 0);
    assert.ok(kinds.slice(firstMissing).every((k) => k === "not-measured"));
    assert.equal(cells.find((s) => s.provider === "e2b")?.kind, "not-measured");
    assert.deepEqual(shown(cells)[0], ["instabox", "$0.81"]);
  });
});

describe("reliability", () => {
  const reliabilityOn = (id: keyof typeof tracks) => {
    const r = trackScores(tracks[id]).find((c) => c.category.id === "reliability");
    assert.ok(r);
    assert.equal(r.category.better, "higher");
    assert.deepEqual(r.category.link, { section: "real-tasks", tab: "fix-and-test" });
    return (provider: string) => {
      const s = r.scores.find((x) => x.provider === provider);
      return s?.kind === "scored" ? [s.score, s.display] : s?.kind;
    };
  };

  test("Same machine counts fix and test, build and fix and test 5 at once: 20 runs, fewer where the burst never ran", () => {
    const cell = reliabilityOn("same-spec");
    assert.deepEqual(cell("e2b"), [100, "20/20"]);
    assert.deepEqual(cell("upstash-ephemeral"), [90, "18/20"]);
    assert.deepEqual(cell("tenki"), [55, "11/20"]);
    // Daytona's quota couldn't fit the burst, so only its 10 started runs count, not 10 more failures.
    assert.deepEqual(cell("daytona"), [90, "9/10"]);
  });

  test("Default machines count only runs that started; a machine too small for both tasks is not measured", () => {
    const cell = reliabilityOn("default");
    assert.deepEqual(cell("vercel"), [90, "9/10"]);
    // Luxor's default machine ran fix and test but was too small for the build.
    assert.deepEqual(cell("tenki"), [100, "5/5"]);
    assert.equal(cell("e2b"), "not-measured");
    assert.equal(cell("beam"), "not-measured");
  });

  test("a reading's own display wins over the category's format, and never changes the score", () => {
    const providers = ["e2b", "modal"] as const;
    const [only] = trackScores(tracks["same-spec"], [
      { id: "x", label: "X", measure: "X", better: "higher", shows: "score", link: { section: "x", tab: null }, format: () => "formatted", read: () => [{ provider: providers[0], value: 1, display: "4/4" }, { provider: providers[1], value: 0.5 }] },
    ]);
    const e2b = only?.scores.find((s) => s.provider === "e2b");
    const modal = only?.scores.find((s) => s.provider === "modal");
    assert.ok(e2b?.kind === "scored" && e2b.display === "4/4" && e2b.score === 100);
    assert.ok(modal?.kind === "scored" && modal.display === "formatted" && modal.score === 50);
  });
});
