import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { UseCases } from "@/components/use-cases";
import { trackIds, tracks } from "@/lib/data";
import type { Metric, Track } from "@/lib/data";
import { isExtraTier } from "@/lib/providers";
import { pickFor, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { chartHref, isTie, margin, placeOf, useCaseList, useCasesData, useCasesFor, useCasesMarkdown, weakestOf } from "@/lib/use-cases";

// The "Best for" picks: computed from the data, never set by hand. Run with `bun test`.

const useCase = (id: string) => {
  const u = useCaseList.find((x) => x.id === id);
  if (!u) throw new Error(`no use case ${id}`);
  return u;
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

    test(`${id}: the cheapest card agrees with the cost chart's own pick`, () => {
      const card = useCasesFor(id).find((r) => r.useCase.id === "cheapest-task");
      const chart = pickFor(realistic, runTrackOf[id], "fix-and-test");
      assert.equal(chart.kind, "picked");
      if (chart.kind === "picked") assert.equal(card?.pick?.provider, chart.pick.provider);
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

  test("default-track charts link with the track query, the landing track without", () => {
    const def = useCasesFor("default").find((r) => r.useCase.id === "cold-start");
    const same = useCasesFor("same-spec").find((r) => r.useCase.id === "cold-start");
    assert.equal(def && chartHref(def), "/?track=default#startup/cold");
    assert.equal(same && chartHref(same), "/#startup/cold");
  });

  test("the JSON lists every use case on both tracks with a source, chart and ranks", () => {
    const d = useCasesData();
    assert.equal(d.schema, "use-cases.v1");
    for (const id of trackIds) {
      const cases = d.tracks[id]?.useCases ?? [];
      assert.equal(cases.length, useCaseList.length);
      for (const c of cases) {
        assert.ok(c.source.startsWith("src/data/") && !c.source.includes("<track>"));
        assert.equal(c.ranked[0]?.rank, 1);
        assert.equal(c.pick?.provider, c.ranked[0]?.provider);
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
  /** The track with one provider's cold start median moved. */
  const withCold = (track: Track, provider: string, p50: number): Track => {
    const cold = track.metric("cold");
    const moved: Metric = { ...cold, values: cold.values.map((v) => (v.provider === provider ? { ...v, p50, ciLow: p50 * 0.99, ciHigh: p50 * 1.01 } : v)) };
    const findMetric = (id: string) => (id === "cold" ? moved : track.findMetric(id));
    return { ...track, findMetric, metric: (id: string) => findMetric(id) ?? track.metric(id) };
  };

  test("a faster median elsewhere moves the pick", () => {
    const track = tracks["same-spec"];
    const before = useCase("cold-start").read(track).entries[0]?.provider;
    const other = track.metric("cold").values.find((v) => v.p50 !== null && v.provider !== before && !isExtraTier(v.provider))?.provider;
    assert.ok(before && other);
    assert.equal(useCase("cold-start").read(withCold(track, other, 0.001)).entries[0]?.provider, other);
  });
});

describe("rules", () => {
  const e = (value: number, display: string, ci95: readonly [number, number] | null = null) => ({ value, display, ci95 });

  test("ci95 ties need each median inside the other's interval", () => {
    assert.equal(isTie(e(1, "1.0 s", [0.9, 1.2]), e(1.1, "1.1 s", [1.0, 1.3]), "ci95"), true);
    assert.equal(isTie(e(1, "1.0 s", [0.9, 1.05]), e(1.1, "1.1 s", [0.95, 1.3]), "ci95"), false);
    assert.equal(isTie(e(1, "1.0 s"), e(1.04, "1.0 s"), "ci95"), true, "without intervals, the printed value decides");
  });

  test("shown ties need the same printed value", () => {
    assert.equal(isTie(e(0.111, "0.11 s"), e(0.114, "0.11 s"), "shown"), true);
    assert.equal(isTie(e(0.111, "0.11 s"), e(0.116, "0.12 s"), "shown"), false);
  });

  test("places are shared by equal printed values", () => {
    const entries = [
      { provider: "styne" as const, display: "0.11 s" },
      { provider: "boxd" as const, display: "0.11 s" },
      { provider: "e2b" as const, display: "0.50 s" },
    ];
    assert.equal(placeOf(entries, "boxd"), 1);
    assert.equal(placeOf(entries, "e2b"), 3);
    assert.equal(placeOf(entries, "modal"), null);
  });

  test("the weakest spot is the lowest rank over the number ranked", () => {
    assert.deepEqual(weakestOf([{ useCase: "a", title: "A", rank: 3, of: 4 }, { useCase: "b", title: "B", rank: 14, of: 15 }]), { useCase: "b", title: "B", rank: 14, of: 15 });
    assert.equal(weakestOf([]), null);
  });

  test("margins read as a multiple, or a percentage under 10%", () => {
    assert.equal(margin({ value: 0.2 }, { value: 0.38 }, "lower"), "1.9×");
    assert.equal(margin({ value: 0.81 }, { value: 0.88 }, "lower"), "9%");
    assert.equal(margin({ value: 85 }, { value: 76 }, "higher"), "1.1×");
  });
});
