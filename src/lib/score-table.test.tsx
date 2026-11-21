import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { ScoreColumn, ScoreRow } from "@/components/score-parts";
import { ScoreTable, nextSort } from "@/components/score-table";
import type { Sort } from "@/components/score-table";
import { scoreCategories } from "@/lib/score-categories";

// How the Scores table sorts: a column title sorts by it, the same title again goes back to A to Z, and a Reset button shows while a category sorts. Run with `bun test`.

const columns: ScoreColumn[] = scoreCategories.map(({ id, label, measure, better, shows, link }) => ({ id, label, measure, better, shows, link }));
const costIndex = columns.findIndex((c) => c.id === "cost");
const speedIndex = columns.findIndex((c) => c.id === "speed");

const rows: ScoreRow[] = [
  { provider: "vercel", mark: null, cells: columns.map((c) => (c.shows === "value" ? { kind: "valued", provider: "vercel", value: 43.14, display: "$43.14" } : { kind: "scored", provider: "vercel", score: 50, value: 2, best: false, display: "2.00 s" })) },
  { provider: "boxd", mark: 1, cells: columns.map((c) => (c.shows === "value" ? { kind: "valued", provider: "boxd", value: 5.5, display: "$5.50" } : { kind: "scored", provider: "boxd", score: 100, value: 1, best: true, display: "1.00 s" })) },
];

const render = (initialSort?: Sort) => renderToStaticMarkup(<ScoreTable columns={columns} rows={rows} label="Scores" initialSort={initialSort} />);
/** The opening tag of each column header. */
const headers = (html: string) => [...html.matchAll(/<th scope="col"[^>]*>/g)].map((m) => m[0]);

describe("nextSort", () => {
  test("a column title sorts by its category", () => {
    assert.deepEqual(nextSort({ kind: "name" }, costIndex), { kind: "category", index: costIndex });
  });

  test("the active column's title again turns sorting off, back to A to Z", () => {
    assert.deepEqual(nextSort({ kind: "category", index: costIndex }, costIndex), { kind: "name" });
  });

  test("another column's title switches to it", () => {
    assert.deepEqual(nextSort({ kind: "category", index: costIndex }, speedIndex), { kind: "category", index: speedIndex });
  });
});

describe("ScoreTable", () => {
  test("by default: Provider A to Z, ascending, no Reset button", () => {
    const html = render();
    assert.ok(headers(html)[0]?.includes('aria-sort="ascending"'));
    assert.ok(!html.includes("Reset"));
    assert.ok(html.indexOf("Vercel") > html.indexOf("boxd"), "boxd before Vercel, A to Z");
  });

  test("sorted by Cost: cheapest first, ascending with an up arrow, and a Reset button", () => {
    const html = render({ kind: "category", index: costIndex });
    const cost = headers(html)[costIndex + 1];
    assert.ok(cost?.includes('aria-sort="ascending"'), cost);
    assert.ok(headers(html)[0]?.includes('aria-sort="none"'));
    assert.ok(html.includes("lucide-arrow-up") && !html.includes("lucide-arrow-down"), "Cost sorts up, cheapest first");
    assert.ok(html.includes('aria-label="Reset sort to provider A to Z"'));
    assert.ok(html.includes("$5.50"));
  });

  test("sorted by Speed: best score first, descending with a down arrow", () => {
    const html = render({ kind: "category", index: speedIndex });
    assert.ok(headers(html)[speedIndex + 1]?.includes('aria-sort="descending"'));
    assert.ok(html.includes("lucide-arrow-down") && !html.includes("lucide-arrow-up"));
    assert.ok(html.includes("Reset"));
  });
});
