import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import expandedFile from "@/data/expanded.json";
import { ExpandedBenchmarks } from "@/components/expanded-benchmarks";
import { Scatter } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
import { agentData } from "@/lib/agent-data";
import { pricedTasks, usageCostTag } from "@/lib/cost";
import { tracks } from "@/lib/data";
import { parseExpanded } from "@/lib/expanded";
import { hardware, hostedText } from "@/lib/hardware";
import { isProviderId, providerInfo } from "@/lib/providers";
import { providerFaqs } from "@/lib/seo/provider";

// Three gaps on the Archil site branch: the cost scatter says Archil's cost is a usage cost,
// unsettled; Archil's hardware answer says only what the evidence shows about where it runs;
// and the expanded chart gives the reason for Archil's stdout streaming rerun. Run with `bun test`.

const usageTag = "usage cost, unsettled";
const others = Object.keys(providerInfo)
  .filter(isProviderId)
  .filter((id) => id !== "archil");

describe("item 1: the cost scatter carries Archil's usage cost tag", () => {
  test("only Archil's quick-task cost has a tag on either track", () => {
    for (const t of Object.values(tracks)) {
      const tagged = pricedTasks(t).flatMap((p) => {
        const tag = usageCostTag(p.id, p.cost, p.status);
        return tag === null ? [] : [[p.id, tag]];
      });
      assert.deepEqual(tagged, [["archil", usageTag]], t.id);
    }
  });

  const points: ScatterPoint[] = [
    { provider: "e2b", x: 15, y: 0.002, detail: ["From its bill"] },
    { provider: "archil", x: 22, y: 0.00887, detail: ["From the usage cost"], tag: usageTag },
    { provider: "boat", x: 40, y: 0.0005, detail: [] },
  ];
  const render = (ps: readonly ScatterPoint[]) => renderToStaticMarkup(<Scatter points={ps} xTicks={[10, 20, 50]} yTicks={[0, 0.005, 0.01]} xTitle="x" yTitle="y" />);

  test("Archil's dot and the figure's summary say the tag beside its cost", () => {
    const html = render(points);
    assert.ok(html.includes(`aria-label="Archil: Cost per 1,000 tasks $8.87 (${usageTag}), 100 tool calls 22 s, From the usage cost"`));
    assert.ok(html.includes(`Archil: 22 s, $8.87 per 1,000 tasks (${usageTag})`));
  });

  test("the tag is the only difference: other dots and an untagged plot are as before", () => {
    const plain = render(points.map(({ tag: _tag, ...p }) => p));
    assert.ok(!plain.includes(usageTag));
    assert.equal(render(points).replaceAll(` (${usageTag})`, ""), plain);
    assert.ok(plain.includes(`aria-label="E2B: Cost per 1,000 tasks $2.00, 100 tool calls 15 s, From its bill"`));
  });
});

describe("item 2: Archil's hardware answer places it by outbound IPs and API region only", () => {
  const hardwareAnswer = (id: (typeof others)[number] | "archil") => providerFaqs(id).find((f) => f.question.startsWith("What hardware"))?.answer ?? "";

  test("Archil's answer says where traffic leaves and the API region, and that where the sandbox runs isn't known", () => {
    const a = hardwareAnswer("archil");
    assert.ok(a.includes(". Where its sandboxes run isn't known: outbound traffic leaves from Amazon IPs in Ashburn, Virginia, and the API region is aws-us-east-1. On the same"), a);
    assert.ok(!a.includes("Hosted on"));
    assert.ok(!/hosted on aws/i.test(a));
  });

  test("every other provider's answer still says where it is hosted, as before", () => {
    for (const id of others) {
      const h = hardware[id];
      if (!h) continue;
      assert.equal(hostedText({ id, h }), `Hosted on ${h.cloud}, ${h.region}.`);
      assert.ok(hardwareAnswer(id).includes(`Hosted on ${h.cloud}, ${h.region}.`), id);
    }
  });
});

describe("item 3: Archil's stdout streaming rerun gives its reason", () => {
  const reason = "rerun on SDK 1.3.1 after we fixed a bug in our Archil adapter";
  const withReason = parseExpanded(expandedFile);
  const runs = withReason.providerRuns.archil ?? [];

  test("only the rerun has a reason, and results.json writes it only there", () => {
    assert.deepEqual(
      runs.map((r) => [r.sdkCommit, r.reason]),
      [
        ["a9954ea", null],
        ["de32eb5", reason],
      ],
    );
    const exported = agentData().expandedBenchmarks?.providerRuns?.archil ?? [];
    assert.ok(!("reason" in (exported[0] ?? {})));
    assert.equal(exported[1] && "reason" in exported[1] ? exported[1].reason : null, reason);
  });

  test("the note puts the reason beside the run id, and Archil's stdout streaming card says it", () => {
    const html = renderToStaticMarkup(<ExpandedBenchmarks data={withReason} />);
    assert.ok(html.includes(`run expanded-2026-11-24T00-12-06-287Z (${reason}) on Nov 24 (UTC), commit de32eb5`));
    assert.match(html, /aria-label="Archil: Median [^"]*, Own run Nov 24 \(UTC\), commit de32eb5, Rerun on SDK 1\.3\.1 after we fixed a bug in our Archil adapter\."/);
    // Each column states its label twice (bar and name); only the stdout streaming card is from the rerun, and it always says why.
    const rerun = html.split("Own run Nov 24 (UTC), commit de32eb5").length - 1;
    assert.ok(rerun > 0);
    assert.equal(html.split("Own run Nov 24 (UTC), commit de32eb5, Rerun on SDK 1.3.1").length - 1, rerun);
    assert.ok(!html.includes("commit a9954ea, Rerun"));
  });

  test("without the reason, every card and note but those two reads the same", () => {
    const stripped = parseExpanded({
      ...expandedFile,
      providerRuns: { archil: expandedFile.providerRuns.archil.map(({ reason: _reason, ...r }) => r) },
    });
    const labels = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1] ?? "");
    const a = renderToStaticMarkup(<ExpandedBenchmarks data={withReason} />);
    const b = renderToStaticMarkup(<ExpandedBenchmarks data={stripped} />);
    const others = (ls: string[]) => ls.filter((l) => !l.includes("commit de32eb5"));
    assert.deepEqual(others(labels(a)), others(labels(b)));
    assert.ok(!b.includes(reason) && !b.includes("Rerun on SDK"));
  });
});
