import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { PauseChart, PausePart } from "@/components/pause-chart";
import { agentData } from "@/lib/agent-data";
import { parseProvider, trackIds, tracks } from "@/lib/data";
import type { Metric, Track } from "@/lib/data";
import type { SiteProviderExport } from "@/lib/inputs";
import { pauseOf } from "@/lib/pause";

// A provider with no pause call (Baseten) must never be shown or ranked as a pause + resume total. Run with `bun test`.

const base = tracks["same-spec"];
function templateRow() {
  const found = base.providers.find((p) => p.pauseSplit !== null);
  if (!found) throw new Error("fixture needs a published provider with a pause split");
  return found;
}
const template = templateRow();

/** A standby export row shaped like the harness's, with a resume faster than every published one, so a misclassified row would rank first. */
function standbyExport(id: "baseten" | "freestyle"): SiteProviderExport {
  const { pricingBound: _b, pricingRegion: _r, regionMultiplier: _m, standbyResume: _s, ...rest } = template;
  return { ...rest, id, track: base.id, pauseSplit: null, standbyResume: { resume: 0.01, idleS: 30, medianGapS: 13, n: 100 } };
}

/** The published same-machine track with a Baseten standby row and its pause-resume value (resume alone). */
function withStandby(): Track {
  const row = standbyExport("baseten");
  const value = { provider: "baseten" as const, n: 100, p50: 0.01, p95: 0.02, ciLow: 0.009, ciHigh: 0.011, failures: 0, ourFailures: 0, limitFailures: 0 };
  const metric = (id: string): Metric => {
    const m = base.metric(id);
    return id === "pause-resume" ? { ...m, values: [...m.values.filter((v) => v.provider !== "baseten"), value] } : m;
  };
  return { ...base, providers: [...base.providers.filter((p) => p.id !== "baseten"), ...parseProvider(row)], metric };
}

const bars = (html: string) => [...html.matchAll(/aria-label="([^":]+):/g)].map((m) => m[1]);

describe("standby pause", () => {
  test("reads as standby: the resume alone, no pause", () => {
    const t = withStandby();
    const p = t.providers.find((x) => x.id === "baseten");
    assert.ok(p);
    const r = pauseOf(t, p);
    assert.equal(r.kind, "standby");
    assert.ok(r.kind === "standby" && r.resume === 0.01 && r.idleS === 30);
  });

  test("has no column on Pause + resume or Pause, and says why", () => {
    const t = withStandby();
    for (const html of [renderToStaticMarkup(<PauseChart track={t} />), renderToStaticMarkup(<PausePart track={t} part="pause" />)]) {
      assert.ok(!bars(html).includes("Baseten"), "Baseten drawn as a pause");
      assert.match(html, /no pause call/);
    }
  });

  test("is drawn on Resume, striped and marked, with what it measures", () => {
    const html = renderToStaticMarkup(<PausePart track={withStandby()} part="resume" />);
    assert.ok(bars(html).includes("Baseten"));
    assert.match(html, /first command after 30 s with no requests/);
  });

  test("a standby resume needs its note, and never comes with a pause split", () => {
    const [p] = parseProvider(standbyExport("freestyle"));
    assert.ok(p);
    assert.throws(() => pauseOf(base, p), /no autoStandby note/);
    assert.throws(() => parseProvider({ ...standbyExport("baseten"), pauseSplit: { pause: 1, resume: 1, n: 1 } }), /both a pause split and a standby resume/);
  });
});

describe("published data", () => {
  test("every standby provider's pause + resume is unranked in the agent files, with its resume in the note", () => {
    const data = agentData();
    for (const id of trackIds)
      for (const p of tracks[id].providers.filter((x) => x.standbyResume !== null)) {
        const r = data.tracks[id].metrics.find((m) => m.id === "pause-resume")?.results.find((x) => x.provider === p.id);
        assert.ok(r, `${id} ${p.id}`);
        assert.ok(r.status.startsWith("standby: "), r.status);
        assert.equal(r.median, null);
        assert.match(r.status, /first command after standby took/);
      }
  });
});
