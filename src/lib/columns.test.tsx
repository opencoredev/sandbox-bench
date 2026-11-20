import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import type { ProviderId } from "@/lib/providers";

// What a click on a chart does: the bar opens a breakdown or a provider's page, and every name under a column opens its page. Run with `bun test`.

const column = (provider: ProviderId, trace?: Column["trace"]): Column => ({
  provider,
  segments: [{ value: provider === "e2b" ? 1 : 2, color: "red", fill: "solid" }],
  label: "1 s",
  detail: ["Median 1 s"],
  ...(trace ? { trace } : {}),
});

/** Every opening tag of an element, with its attributes. */
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]);
const bars = (html: string) => [...tags(html, "a"), ...tags(html, "div")].filter((t) => t.includes("chart-col"));

describe("full chart", () => {
  test("a bar with a trace opens its breakdown; its name under the chart links to the provider's page", () => {
    const html = renderToStaticMarkup(<Columns columns={[column("e2b", "cold"), column("daytona", "cold")]} label="Cold start" />);
    const traced = bars(html).filter((t) => t.includes('data-trace="cold:e2b"'));
    assert.ok(traced.length > 0 && traced.every((t) => t.startsWith("<div") && t.includes('role="button"')));
    const names = tags(html, "a").filter((t) => t.includes('href="/providers/e2b/"') && !t.includes("chart-col"));
    assert.ok(names.some((t) => t.includes(`aria-label="Open E2B&#x27;s page"`)), "the name is its own focusable link");
  });

  test("a bar without a trace opens the provider's page, and its name repeats the link for the pointer only", () => {
    const html = renderToStaticMarkup(<Columns columns={[column("e2b"), column("daytona")]} label="Bursts" />);
    const linked = bars(html).filter((t) => t.includes('href="/providers/daytona/"'));
    assert.ok(linked.length > 0 && linked.every((t) => t.startsWith("<a")));
    const names = tags(html, "a").filter((t) => t.includes('href="/providers/daytona/"') && !t.includes("chart-col"));
    assert.ok(names.length > 0 && names.every((t) => t.includes('aria-hidden="true"') && t.includes('tabindex="-1"')));
  });

  test("a provider with no page is never a link", () => {
    const html = renderToStaticMarkup(<Columns columns={[column("e2b"), column("vercel")]} label="Bursts" />);
    assert.ok(!html.includes("/providers/vercel/"));
    assert.ok(bars(html).some((t) => t.startsWith("<div") && t.includes('tabindex="0"')));
  });
});

describe("compact chart", () => {
  test("a headline chart's bars and names link to each page; the bar never opens a breakdown", () => {
    const html = renderToStaticMarkup(<Columns columns={[column("e2b", "cold"), column("daytona", "cold")]} label="Cold start" compact linked />);
    assert.ok(!html.includes(`data-trace="`));
    assert.ok(bars(html).some((t) => t.startsWith("<a") && t.includes('href="/providers/e2b/"')));
  });

  test("a compact chart that isn't a headline keeps its bars as focus stops, its names still link", () => {
    const html = renderToStaticMarkup(<Columns columns={[column("e2b"), column("daytona")]} label="Machine sizes" compact />);
    assert.ok(bars(html).every((t) => t.startsWith("<div")));
    assert.ok(tags(html, "a").some((t) => t.includes('href="/providers/e2b/"') && t.includes("aria-label")));
  });
});
