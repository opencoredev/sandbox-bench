import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { ScoreColumn, ScoreRow } from "@/components/score-parts";
import { ScoreTable, defaultSort, nextSort } from "@/components/score-table";
import type { Sort } from "@/components/score-table";
import { scoreCategories } from "@/lib/score-categories";

// How the Scores table sorts: it opens on Real tasks, best first; a column title sorts by it, the same title again goes back to A to Z, and a Reset button back to Real tasks shows away from that order. Run with `bun test`.

const columns: ScoreColumn[] = scoreCategories.map(({ id, label, measure, better, shows, link }) => ({ id, label, measure, better, shows, link }));
const costIndex = columns.findIndex((c) => c.id === "cost");
const speedIndex = columns.findIndex((c) => c.id === "speed");
const realIndex = columns.findIndex((c) => c.id === "real-tasks");

// Vercel leads Real tasks but comes after boxd A to Z and on Cost, so each order is visible.
const rows: ScoreRow[] = [
  { provider: "vercel", mark: null, cells: columns.map((c) => (c.shows === "value" ? { kind: "valued", provider: "vercel", value: 43.14, display: "$43.14", tag: null } : { kind: "scored", provider: "vercel", score: 100, value: 1, best: true, display: "1.00 s" })) },
  { provider: "boxd", mark: 1, cells: columns.map((c) => (c.shows === "value" ? { kind: "valued", provider: "boxd", value: 5.5, display: "$5.50", tag: null } : { kind: "scored", provider: "boxd", score: 50, value: 2, best: false, display: "2.00 s" })) },
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
  test("defaultSort opens on Real tasks, and on A to Z where there is no such column", () => {
    assert.deepEqual(defaultSort(columns), { kind: "category", index: realIndex });
    assert.deepEqual(defaultSort(columns.filter((c) => c.id !== "real-tasks")), { kind: "name" });
  });

  test("by default: Real tasks best first, descending, no Reset button", () => {
    const html = render();
    assert.ok(headers(html)[0]?.includes('aria-sort="none"'));
    assert.ok(headers(html)[realIndex + 1]?.includes('aria-sort="descending"'));
    assert.ok(!html.includes("Reset"));
    assert.ok(html.indexOf("Vercel") < html.indexOf("boxd"), "Vercel's best real task time first");
  });

  test("Provider A to Z stays one click away, with a Reset back to Real tasks", () => {
    const html = render({ kind: "name" });
    assert.ok(headers(html)[0]?.includes('aria-sort="ascending"'));
    assert.ok(html.indexOf("boxd") < html.indexOf("Vercel"), "boxd before Vercel, A to Z");
    assert.ok(html.includes('aria-label="Reset sort to Real tasks, best first"'));
  });

  test("sorted by Cost: cheapest first, ascending with an up arrow, and a Reset button", () => {
    const html = render({ kind: "category", index: costIndex });
    const cost = headers(html)[costIndex + 1];
    assert.ok(cost?.includes('aria-sort="ascending"'), cost);
    assert.ok(headers(html)[0]?.includes('aria-sort="none"'));
    assert.ok(html.includes("lucide-arrow-up") && !html.includes("lucide-arrow-down"), "Cost sorts up, cheapest first");
    assert.ok(html.includes('aria-label="Reset sort to Real tasks, best first"'));
    assert.ok(html.indexOf("boxd") < html.indexOf("Vercel"), "boxd is cheaper");
    assert.ok(html.includes("$5.50"));
  });

  test("sorted by Speed: best score first, descending with a down arrow", () => {
    const html = render({ kind: "category", index: speedIndex });
    assert.ok(headers(html)[speedIndex + 1]?.includes('aria-sort="descending"'));
    assert.ok(html.includes("lucide-arrow-down") && !html.includes("lucide-arrow-up"));
    assert.ok(html.includes("Reset"));
  });
});
