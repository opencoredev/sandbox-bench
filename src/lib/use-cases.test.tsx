import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { UseCases } from "@/components/use-cases";
import { trackIds, tracks } from "@/lib/data";
import { completed } from "@/lib/fairness";
import { fairness } from "@/lib/fairness-data";
import type { Metric, Track } from "@/lib/data";
import { isExtraTier } from "@/lib/providers";
import { pickFor, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { chartHref, isTie, leadText, placeOf, useCaseList, useCasesData, useCasesFor, useCasesMarkdown, weakestOf, weakestText } from "@/lib/use-cases";

// The "Best for" picks: computed from the data, never set by hand. Run with `bun test`.

const useCase = (id: string) => {
  const u = useCaseList.find((x) => x.id === id);
  if (!u) throw new Error(`no use case ${id}`);
  return u;
};

/** The track with one metric replaced, or removed with null. */
const withMetric = (track: Track, id: string, metric: Metric | null): Track => {
  const findMetric = (m: string) => (m === id ? metric : track.findMetric(m));
  return { ...track, findMetric, metric: (m: string) => { const found = findMetric(m); if (!found) throw new Error(`Unknown metric ${m}`); return found; } };
};

describe("use cases on the published data", () => {
  for (const id of trackIds) {
    test(`${id}: every card has a pick, best first, on a first CPU tier`, () => {
      for (const r of useCasesFor(id)) {
        assert.ok(r.pick, `${r.useCase.id} has a pick`);
        assert.equal(r.ranked[0], r.pick);
        assert.ok(r.ranked.every((e) => !isExtraTier(e.provider)), `${r.useCase.id} ranks first tiers only`);
        const values = r.ranked.map((e) => e.value);
        const sorted = [...values].sort((a, b) => (r.useCase.better === "lower" ? a - b : b - a));
        assert.deepEqual(values, sorted, `${r.useCase.id} is best first`);
        assert.ok(r.reason?.includes(r.pick.display), `${r.useCase.id}'s reason quotes the pick's reading`);
        assert.ok(!r.skipped.some((s) => s.provider === r.pick?.provider), "a skipped provider is never the pick");
      }
    });

    test(`${id}: the cheapest card agrees with the cost chart's pick, in dollars per 1,000`, () => {
      const card = useCasesFor(id).find((r) => r.useCase.id === "cheapest-task");
      const chart = pickFor(realistic, runTrackOf[id], "fix-and-test");
      assert.equal(chart.kind, "picked");
      if (chart.kind !== "picked" || !card?.pick) return;
      assert.equal(card.pick.provider, chart.pick.provider);
      assert.equal(card.useCase.unit, "usd-per-1000-tasks");
      assert.ok(Math.abs(card.pick.value - chart.pick.cost.usdPerCompleted * 1000) < 1e-9);
      assert.equal(card.pick.display, `$${card.pick.value.toFixed(2)}`, "the value is the number the card prints");
    });

    test(`${id}: the cold start card picks the lowest measured median`, () => {
      const card = useCasesFor(id).find((r) => r.useCase.id === "cold-start");
      const best = tracks[id].metric("cold").values.filter((v) => v.p50 !== null && !isExtraTier(v.provider)).sort((a, b) => (a.p50 ?? 0) - (b.p50 ?? 0))[0];
      assert.equal(card?.pick?.provider, best?.provider);
    });
  }

  test("a measure that ran on one track shows that track's pick on both, linked to it", () => {
    const [same, other] = trackIds.map((id) => useCasesFor(id).find((r) => r.useCase.id === "long-running"));
    assert.equal(same?.from, "same-spec");
    assert.equal(other?.from, "same-spec");
    assert.equal(same?.pick?.provider, other?.pick?.provider);
    assert.ok(other && chartHref(other).startsWith("/#"), "links to the landing track");
  });

  test("a weakest spot from another track names that track", () => {
    const w = { useCase: "long-running", title: "Long-running tasks", rank: 15, of: 15, track: "same-spec" as const };
    assert.equal(weakestText(w, "same-spec"), "Long-running tasks, 15th of 15");
    assert.equal(weakestText(w, "default"), "Long-running tasks, 15th of 15 (on 4 vCPU, 8 GiB)");
  });

  test("default-track charts link with the track query, the landing track without", () => {
    const def = useCasesFor("default").find((r) => r.useCase.id === "cold-start");
    const same = useCasesFor("same-spec").find((r) => r.useCase.id === "cold-start");
    assert.equal(def && chartHref(def), "/?track=default#startup/cold");
    assert.equal(same && chartHref(same), "/#startup/cold");
  });

  test("the JSON lists every use case on both tracks with a unit, source, chart and ranks", () => {
    const d = useCasesData();
    assert.equal(d.schema, "use-cases.v1");
    for (const id of trackIds) {
      const cases = d.tracks[id]?.useCases ?? [];
      assert.equal(cases.length, useCaseList.length);
      for (const c of cases) {
        assert.ok(["s", "ops/s", "usd-per-1000-tasks"].includes(c.unit));
        assert.ok(c.source.startsWith("src/data/") && !c.source.includes("<track>"));
        assert.equal(c.ranked[0]?.rank, 1);
        assert.equal(c.pick?.provider, c.ranked[0]?.provider);
        if (c.tie === "shown") for (const t of c.tiedWith) assert.equal(c.ranked.find((e) => e.provider === t)?.rank, 1, "a printed tie shares first place");
        if (c.tie === "ci95") assert.deepEqual(c.ranked.map((e) => e.rank), c.ranked.map((_, i) => i + 1), "interval ties keep median positions");
      }
    }
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(d)));
  });

  test("the Markdown names every card on both tracks", () => {
    const md = useCasesMarkdown("##").join("\n");
    for (const u of useCaseList) assert.equal(md.split(`- ${u.title} (`).length - 1, trackIds.length);
  });

  test("the cards render every title, pick and the data link", () => {
    const html = renderToStaticMarkup(UseCases({ track: "same-spec" }));
    for (const r of useCasesFor("same-spec")) {
      assert.ok(html.includes(r.useCase.title), r.useCase.title);
      assert.ok(r.pick && html.includes(r.pick.display), `${r.useCase.id} pick`);
    }
    assert.ok(html.includes('href="use-cases.json"'));
  });
});

describe("picks follow the data", () => {
  const track = tracks["same-spec"];
  const cold = track.metric("cold");

  test("a faster median elsewhere moves the pick", () => {
    const before = useCase("cold-start").read(track).entries[0]?.provider;
    const other = cold.values.find((v) => v.p50 !== null && v.provider !== before && !isExtraTier(v.provider))?.provider;
    assert.ok(before && other);
    const moved = { ...cold, values: cold.values.map((v) => (v.provider === other ? { ...v, p50: 0.001, ciLow: 0.00099, ciHigh: 0.00101 } : v)) };
    assert.equal(useCase("cold-start").read(withMetric(track, "cold", moved)).entries[0]?.provider, other);
  });

  test("a provider measured for the first time is ranked", () => {
    const [first] = cold.values.filter((v) => !isExtraTier(v.provider));
    assert.ok(first);
    const unmeasured = { ...cold, values: cold.values.map((v) => (v.provider === first.provider ? { ...v, n: 0, p50: null, p95: null, ciLow: null, ciHigh: null } : v)) };
    assert.ok(!useCase("cold-start").read(withMetric(track, "cold", unmeasured)).entries.some((e) => e.provider === first.provider), "no result, no entry");
    const measured = { ...cold, values: cold.values.map((v) => (v.provider === first.provider ? { ...v, n: 10, p50: 0.001, ciLow: 0.00099, ciHigh: 0.00101 } : v)) };
    assert.equal(useCase("cold-start").read(withMetric(track, "cold", measured)).entries[0]?.provider, first.provider);
  });

  test("resume readings survive a track without the pause + resume total", () => {
    const before = useCase("revival").read(track).entries.map((e) => e.provider);
    assert.ok(before.length > 0);
    assert.deepEqual(useCase("revival").read(withMetric(track, "pause-resume", null)).entries.map((e) => e.provider), before);
  });

  test("a track without the metric has no entries rather than an error", () => {
    assert.deepEqual(useCase("cold-start").read(withMetric(track, "cold", null)), { entries: [], skipped: [] });
    assert.deepEqual(useCase("cold-start").read(withMetric(track, "cold", { ...cold, values: [] })).entries, []);
  });
});

describe("rules", () => {
  const e = (value: number, display: string, ci95: readonly [number, number] | null = null) => ({ value, display, ci95 });

  test("ci95 ties need each median inside the other's interval", () => {
    assert.equal(isTie(e(1, "1.0 s", [0.9, 1.2]), e(1.1, "1.1 s", [1.0, 1.3]), "ci95"), true);
    assert.equal(isTie(e(1, "1.0 s", [0.9, 1.05]), e(1.1, "1.1 s", [0.95, 1.3]), "ci95"), false);
    assert.equal(isTie(e(0.52, "0.52 s", [0.5, 0.521]), e(0.523, "0.52 s", [0.522, 0.53]), "ci95"), false, "the same printed value is not a tie when intervals exist");
    assert.equal(isTie(e(1, "1.0 s"), e(1.04, "1.0 s"), "ci95"), true, "without intervals, the printed value decides");
  });

  test("shown ties need the same printed value", () => {
    assert.equal(isTie(e(0.111, "0.11 s"), e(0.114, "0.11 s"), "shown"), true);
    assert.equal(isTie(e(0.111, "0.11 s"), e(0.116, "0.12 s"), "shown"), false);
  });

  test("places count the providers ahead that a reading doesn't tie with", () => {
    const entries = [
      { provider: "instabox" as const, ...e(0.11, "0.11 s", [0.1, 0.12]) },
      { provider: "boxd" as const, ...e(0.115, "0.12 s", [0.105, 0.13]) },
      { provider: "e2b" as const, ...e(0.5, "0.50 s", [0.48, 0.52]) },
    ];
    assert.equal(placeOf(entries, "boxd", "ci95"), 2, "interval ties keep the median position");
    assert.equal(placeOf(entries, "boxd", "shown"), 2);
    const printedTie = entries.map((x) => (x.provider === "boxd" ? { ...x, display: "0.11 s" } : x));
    assert.equal(placeOf(printedTie, "boxd", "shown"), 1, "equal printed values share a place");
    assert.equal(placeOf(entries, "e2b", "ci95"), 3);
    assert.equal(placeOf(entries, "modal", "ci95"), null);
  });

  test("the weakest spot is the lowest rank over the number ranked", () => {
    assert.deepEqual(
      weakestOf([{ useCase: "a", title: "A", rank: 3, of: 4, track: "default" }, { useCase: "b", title: "B", rank: 14, of: 15, track: "same-spec" }]),
      { useCase: "b", title: "B", rank: 14, of: 15, track: "same-spec" },
    );
    assert.equal(weakestOf([]), null);
  });

  test("leads read in the unit's own words, and never divide by zero", () => {
    assert.equal(leadText({ value: 0.2 }, { value: 0.38 }, "s"), "1.9× as long");
    assert.equal(leadText({ value: 0.81 }, { value: 0.88 }, "usd-per-1000-tasks"), "9% more");
    assert.equal(leadText({ value: 0.76 }, { value: 0.95 }, "usd-per-1000-tasks"), "1.3× the cost");
    assert.equal(leadText({ value: 85 }, { value: 76 }, "ops/s"), "11% lower");
    assert.equal(leadText({ value: 0 }, { value: 0.38 }, "s"), null);
    assert.equal(leadText({ value: 1 }, { value: 1.0001 }, "s"), "under 1% longer");
  });
});

describe("revival: restart speed beside the resume pick", () => {
  test("ranks the state-survival restart medians, lowest first, on the same machine on both tracks", () => {
    const timed = completed(fairness.stateSurvival)
      .filter((e) => !isExtraTier(e.provider) && e.result.restart.medianMs !== null)
      .sort((a, b) => (a.result.restart.medianMs ?? 0) - (b.result.restart.medianMs ?? 0));
    assert.ok(timed.length > 0, "the published file has restart timings");
    for (const id of trackIds) {
      const card = useCasesFor(id).find((r) => r.useCase.id === "revival");
      const second = card?.second;
      assert.ok(second, "the revival card has a second measure");
      assert.equal(second.from, "same-spec");
      assert.equal(second.measure.unit, "ms");
      assert.equal(second.pick?.provider, timed[0]?.provider);
      assert.equal(second.pick?.value, timed[0]?.result.restart.medianMs);
      const values = second.ranked.map((e) => e.value);
      assert.deepEqual(values, [...values].sort((a, b) => a - b));
      assert.equal(card.pick, card.ranked[0], "the resume pick is unchanged by the second measure");
      assert.doesNotMatch(card.useCase.gap ?? "", /isn't measured yet/);
    }
    assert.ok(useCaseList.filter((u) => u.second).every((u) => u.id === "revival"), "only the revival card has a second measure");
  });

  test("the card, the JSON and the Markdown show restart speed", () => {
    const html = renderToStaticMarkup(<UseCases track="same-spec" />);
    assert.match(html, /Restart speed/);
    assert.match(html, /A killed server started again, until it answers/);
    const json = useCasesData().tracks["same-spec"].useCases.find((u) => u.id === "revival");
    assert.equal(json?.second?.unit, "ms");
    assert.equal(json?.second?.chart, "/#like-for-like/restart");
    assert.equal(json?.second?.ranked[0]?.rank, 1);
    assert.match(useCasesMarkdown("#").join("\n"), /Restart speed \(A killed server started again, until it answers\): \S/);
    assert.equal(leadText({ value: 59.1 }, { value: 86.8 }, "ms"), "1.5× as long");
  });
});

