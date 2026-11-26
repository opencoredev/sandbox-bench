import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import ProviderPage from "@/app/providers/[id]/page";
import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { CompactNotes } from "@/components/metric-chart";
import { RealtaskBurstChart } from "@/components/realtask-burst";
import { trackIds } from "@/lib/data";
import { realtaskBurst } from "@/lib/realtask-burst-data";
import { providerPages } from "@/lib/seo/pages";
import { providerTrack } from "@/lib/seo/provider";

// Three layout fixes on the Archil site branch: the compact cost charts move a column's tag
// under the chart on the wide view, Five at once says "ratio withheld" beside a bar whose ratio
// the data holds back, and Archil's page header names its location evidence. Run with `bun test`.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The two views of one rendered chart: bars (phones, narrow cards) and columns (wide). */
function views(html: string) {
  const at = html.indexOf('class="hidden @min-[566px]:block"');
  assert.ok(at > 0, "the chart has a wide view");
  return { bars: html.slice(0, at), wide: html.slice(at) };
}

/** Every rendered figure with this label, in page order. */
const figures = (html: string, label: string) =>
  html
    .split(`<figure aria-label="${label}"`)
    .slice(1)
    .map((rest) => rest.slice(0, rest.indexOf("</figure>")));

const page = async (id: string) =>
  renderToStaticMarkup(await ProviderPage({ params: Promise.resolve({ id }) }));

const tagSpan = (tag: string) => `text-balance text-neutral-7">${tag}</span>`;

describe("item 1: a compact chart's tag goes under the chart on the wide view", () => {
  const cols: Column[] = [
    {
      provider: "e2b",
      label: "$0.95",
      segments: [{ value: 0.95, color: "red", fill: "solid" }],
      detail: [["Per 1,000 tasks", "$0.95"]],
    },
    {
      provider: "archil",
      label: "$8.87",
      tag: "usage cost, unsettled",
      segments: [{ value: 8.87, color: "purple", fill: "solid" }],
      detail: [["Per 1,000 tasks", "$8.87 (usage cost, unsettled)"]],
    },
  ];
  const note = (
    <CompactNotes items={[{ mark: undefined, id: "archil", note: "usage cost, unsettled" }]} />
  );

  test("the column view drops the tag under the name and says it under the chart; the bar view keeps it beside the value", () => {
    const { bars, wide } = views(
      renderToStaticMarkup(<Columns columns={cols} label="Cost" compact linked tagNote={note} />),
    );
    assert.match(bars, />usage cost, unsettled</);
    assert.ok(!wide.includes(tagSpan("usage cost, unsettled")));
    assert.match(text(wide), /Archil: usage cost, unsettled\./);
  });

  test("without a tag note, every chart draws as before, tag under the name included", () => {
    const { wide } = views(
      renderToStaticMarkup(<Columns columns={cols} label="Cost" compact linked />),
    );
    assert.ok(wide.includes(tagSpan("usage cost, unsettled")));
    const plain = cols.slice(0, 1);
    assert.equal(
      renderToStaticMarkup(
        <Columns
          columns={plain}
          label="Cost"
          compact
          linked
          tagNote={<CompactNotes items={[]} />}
        />,
      ),
      renderToStaticMarkup(<Columns columns={plain} label="Cost" compact linked />),
    );
  });

  test("each bar's accessible label is the same with or without the note", () => {
    const labels = (html: string) => [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      labels(
        renderToStaticMarkup(<Columns columns={cols} label="Cost" compact linked tagNote={note} />),
      ),
      labels(renderToStaticMarkup(<Columns columns={cols} label="Cost" compact linked />)),
    );
  });

  test("every provider page's two compact cost charts: Archil's tag beside its bar on phones, a note under the columns on wide screens", async () => {
    for (const id of providerPages) {
      const html = await page(id);
      for (const label of [
        "Cost per 1,000 tasks by provider",
        "Fix and test: cost per 1,000 completed tasks by provider",
      ]) {
        const found = figures(html, label);
        assert.ok(found.length > 0, `${id}: ${label}`);
        for (const fig of found) {
          const { bars, wide } = views(fig);
          assert.ok(
            !wide.includes(tagSpan("usage cost, unsettled")),
            `${id}: ${label}, no tag under a slanted name`,
          );
          if (!text(bars).includes("usage cost, unsettled")) continue;
          assert.match(text(wide), /Archil: usage cost, unsettled\./, `${id}: ${label}`);
          // The note is Archil's alone: no other provider has a tag on these charts.
          assert.equal(text(wide).match(/: usage cost, unsettled\./g)?.length, 1);
          assert.match(fig, /aria-label="Archil: [^"]*unsettled/);
        }
      }
    }
  });
});

describe("item 2: Five at once withholds Archil's ratio with its reason, as it does Boat's", () => {
  const html = renderToStaticMarkup(<RealtaskBurstChart data={realtaskBurst} />);
  const ran = realtaskBurst.providers.flatMap((p) => (p.status === "ran" && p.medianWallS !== null ? [p] : []));

  test("Archil has no ratio, and its footnote gives the reason", () => {
    const archil = ran.find((p) => p.provider === "archil");
    assert.ok(archil);
    assert.equal(archil.slowdown, null);
    assert.ok(text(html).includes("One of Archil's two tasks alone spent 127 s uploading the toolchain from our machine, against 4 s for the other"));
  });

  test("every measured ratio still shows", () => {
    for (const p of ran.filter((x) => x.slowdown !== null)) assert.ok(html.includes(`>${p.slowdown?.toFixed(2)}×<`), p.provider);
  });
});

describe("item 3: the header names Archil's location evidence", () => {
  test("Archil: outbound IP location, never Ran in", async () => {
    for (const id of trackIds) {
      const t = providerTrack(id, "archil");
      assert.equal(t?.ranIn, null);
      assert.equal(t?.outboundIpLocation, "Ashburn, US");
    }
    const html = text(await page("archil"));
    assert.match(html, /Outbound IP locationAshburn, US/);
    assert.doesNotMatch(html, /Ran inAshburn/);
  });
});
