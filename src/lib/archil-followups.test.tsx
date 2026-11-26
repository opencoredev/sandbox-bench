import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ByLocation } from "@/components/by-location";
import { Scatter, phoneNumbers } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
import type { ProviderId } from "@/lib/providers";

// Follow-ups on the Archil site branch: the By location note says how much is known about where
// Archil runs, and the cost scatter numbers its dots on phones. Run with `bun test`.

describe("item 2: By location says what is known about where Archil runs", () => {
  test("the overview and both caller tabs carry the qualified note", () => {
    const html = renderToStaticMarkup(<ByLocation />).replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");
    const note =
      "Boat (Northern France) runs its sandboxes in Europe; every other provider that reports where its sandboxes run has them in the US, each where its row says. Where Archil's sandboxes run isn't known; only its API region (aws-us-east-1) and outbound IPs (Amazon, Ashburn) are, both US-East.";
    // The overview, then the EU-Central and US-East tabs.
    assert.equal(html.split(note).length - 1, 3);
    assert.ok(!html.includes("the remaining providers run in the US"));
  });
});

describe("item 3: the cost scatter numbers its dots below 640 px", () => {
  const point = (provider: ProviderId, x: number, y: number): ScatterPoint => ({ provider, x, y, detail: [] });

  test("numbers run left to right with no gaps, and clear every dot and every other number in a tight cluster", () => {
    // Five dots a few px apart, like the lower-right cluster at 360 px, in plot px.
    const pts = [point("upstash-ephemeral", 110, 300), point("instabox", 122, 302), point("upstash", 134, 299), point("boat", 190, 290), point("e2b", 20, 40)];
    const at = (p: ScatterPoint) => ({ x: p.x, y: p.y });
    const nums = phoneNumbers({ points: pts, at });
    assert.deepEqual(
      pts.map((p) => nums.get(p.provider)?.n),
      [2, 3, 4, 5, 1],
    );
    const box = (p: ScatterPoint) => {
      const n = nums.get(p.provider);
      assert.ok(n);
      return { x: p.x + n.dx, y: p.y + n.dy, w: String(n.n).length * 6 + 2, h: 11 };
    };
    const hits = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
    for (const p of pts) {
      const b = box(p);
      for (const q of pts) {
        assert.ok(!hits(b, { x: q.x, y: q.y, w: 16, h: 16 }), `${p.provider}'s number over ${q.provider}'s dot`);
        if (q !== p) assert.ok(!hits(b, box(q)), `${p.provider}'s number over ${q.provider}'s`);
      }
    }
  });

  test("names stay beside the dots from 640 px up; numbers and the legend show below it", () => {
    const pts = [point("e2b", 15, 0.002), point("daytona", 12, 0.0016), point("boat", 40, 0.0005)];
    const html = renderToStaticMarkup(<Scatter points={pts} xTicks={[10, 20, 50]} yTicks={[0, 0.002, 0.004]} xTitle="x" yTitle="y" />);
    assert.equal(html.split("whitespace-nowrap text-neutral-8 max-sm:hidden").length - 1, pts.length);
    assert.equal(html.split("tabular-nums sm:hidden").length - 1, pts.length);
    const legend = html.slice(html.indexOf("<ol"));
    assert.ok(legend.includes("sm:hidden"));
    assert.equal(legend.split("<li").length - 1, pts.length);
  });
});
