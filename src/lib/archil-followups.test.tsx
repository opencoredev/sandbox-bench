import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ByLocation } from "@/components/by-location";
import { failureLine } from "@/components/failure-list";
import { Reliability } from "@/components/reliability";
import { Scatter, phoneNumbers } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { trackIds, tracks } from "@/lib/data";
import { archilUnconfirmedCause, failureNote, noteSentence } from "@/lib/failure-notes";
import { isProviderId, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { providerFaqs, providerNotes, providerTrack } from "@/lib/seo/provider";

// Three follow-ups on the Archil site branch: Archil's outcome_unknown failure stays counted with
// a note that its cause is unconfirmed, the By location note says how much is known about where
// Archil runs, and the cost scatter numbers its dots on phones. Run with `bun test`.

const reason = "Process termination could not be confirmed. (outcome_unknown)";
const ids = Object.keys(providerInfo).filter(isProviderId);
const others = ids.filter((id) => id !== "archil");
const sentence = noteSentence(archilUnconfirmedCause);

/** The failure line both pages printed before the note existed. */
const oldLine = (failures: readonly { reason: string; count: number }[], unit: { one: string; many: string }, none: string) =>
  failures.length === 0 ? none : failures.map((f) => `${f.reason} (${f.count} ${f.count === 1 ? unit.one : unit.many})`).join("; ");

describe("item 1: Archil's unconfirmed failure stays counted, with a note", () => {
  test("the note is Archil's outcome_unknown failure's alone", () => {
    assert.equal(sentence, "Cause unconfirmed: the same error came from a bug in our SDK's Archil adapter, fixed in SDK 1.3.1, so this failure may be ours.");
    assert.equal(failureNote({ provider: "archil", reason }), archilUnconfirmedCause);
    assert.equal(failureNote({ provider: "archil", reason: "Archil guest operation timed out starting. (timeout)" }), null);
    assert.equal(failureNote({ provider: "e2b", reason }), null);
    const noted = trackIds.flatMap((id) => tracks[id].providers.flatMap((p) => p.failureReasons.filter((f) => failureNote({ provider: p.id, reason: f.reason })).map((f) => ({ id, p: p.id, f }))));
    assert.deepEqual(
      noted.map((n) => [n.id, n.p, n.f.count, n.f.tests]),
      [["same-spec", "archil", 1, ["Dev server ready"]]],
    );
  });

  test("Archil's count and success rate are unchanged by the note", () => {
    const t = providerTrack("same-spec", "archil");
    assert.ok(t);
    assert.equal(t.failures.length, 2);
    assert.equal(t.failures.reduce((sum, f) => sum + f.count, 0), 2);
    assert.equal(t.reliability.attempts - t.reliability.succeeded, 2);
  });

  test("the provider and compare pages' failure line: the note beside Archil's failure, every other line as before", () => {
    const units = [
      { unit: { one: "failure", many: "failures" }, none: "None." },
      { unit: { one: "test", many: "tests" }, none: "none." },
    ];
    for (const { unit, none } of units)
      for (const id of trackIds)
        for (const p of tracks[id].providers) {
          const html = renderToStaticMarkup(<>{failureLine({ provider: p.id, failures: p.failureReasons, unit, none })}</>);
          if (p.id === "archil" && id === "same-spec") {
            assert.ok(html.includes(`${reason} (1 ${unit.one}; <span class="text-neutral-7">${archilUnconfirmedCause.replaceAll("'", "&#x27;")}</span>)`), html);
            assert.ok(html.includes(`Archil guest operation timed out starting. (timeout) (1 ${unit.one})`), html);
          } else {
            assert.equal(html, renderToStaticMarkup(<>{oldLine(p.failureReasons, unit, none)}</>), `${p.id} on ${id}`);
          }
        }
  });

  test("the FAQ says it for Archil; no other provider's reliability answer changes", () => {
    const archil = providerFaqs("archil")[4]?.answer ?? "";
    assert.ok(archil.includes(`Process termination could not be confirmed. (outcome_unknown) (1 failure; ${archilUnconfirmedCause})`), archil);
    for (const id of others) {
      const answer = providerFaqs(id)[4]?.answer ?? "";
      assert.ok(!answer.includes("unconfirmed"), `${id}: ${answer}`);
      for (const track of trackIds) {
        const t = providerTrack(track, id);
        if (!t || t.failures.length === 0) continue;
        const list = t.failures.map((f) => `${f.reason.replace(/\.$/, "")} (${f.count} ${f.count === 1 ? "failure" : "failures"})`).join("; ");
        assert.ok(answer.includes(list), `${id} on ${track}`);
      }
    }
  });

  test("the home failure table notes it under Archil's row only", () => {
    const same = renderToStaticMarkup(<Reliability track={tracks["same-spec"]} />).replaceAll("&#x27;", "'");
    // Once in the phone list, once in the table.
    assert.equal(same.split(sentence).length - 1, 2);
    assert.equal(renderToStaticMarkup(<Reliability track={tracks.default} />).includes("unconfirmed"), false);
  });

  test("results.json adds the note to that failure only; every other failure exports as before", () => {
    const json = agentData();
    for (const id of trackIds)
      for (const p of json.tracks[id].providers) {
        const source = tracks[id].providers.find((x) => x.id === p.id)?.failureReasons;
        if (p.id === "archil" && id === "same-spec") {
          assert.deepEqual(p.failures, source?.map((f) => (f.reason === reason ? { ...f, note: sentence } : f)));
        } else {
          assert.deepEqual(p.failures, source, `${p.id} on ${id}`);
        }
      }
  });

  test("results.md says it inside the failure's parentheses; llms.txt and Archil's page notes carry the sentence", () => {
    const md = agentMarkdown();
    assert.ok(md.includes(`${reason}: 1 runs, 1 failed tests (provider-operation; Dev server ready; ${archilUnconfirmedCause}); Archil guest operation`), "results.md");
    // The note appears once; the failure rule also says a failure with an unconfirmed cause counts.
    assert.equal(md.split(archilUnconfirmedCause).length - 1, 1);
    const note = `Archil's one same-machine dev server failure, "Process termination could not be confirmed.", is still counted, but its cause is unconfirmed: the same error came from that bug in our Archil adapter, fixed in SDK 1.3.1, so this failure may be ours.`;
    assert.ok(llmsTxt().includes(note));
    assert.ok(providerNotes("archil").includes(note));
    for (const id of ["e2b", "daytona", "instabox"] as const) assert.ok(!providerNotes(id).some((s) => s.includes("unconfirmed")), id);
  });
});

describe("item 2: By location says what is known about where Archil runs", () => {
  test("the overview and both caller tabs carry the qualified note", () => {
    const html = renderToStaticMarkup(<ByLocation />).replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");
    const note =
      "Boat (Northern France) runs its sandboxes in Europe; the remaining providers run in the US, as far as each reports, each where its row says. For Archil, only its API region (aws-us-east-1) and outbound IPs (Amazon, Ashburn) are known, both US-East.";
    // The overview, then the EU-Central and US-East tabs.
    assert.equal(html.split(note).length - 1, 3);
    assert.ok(!html.includes("the remaining providers run in the US, each where its row says"));
  });
});

describe("item 3: the cost scatter numbers its dots below 1340 px", () => {
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

  test("names stay beside the dots from 1340 px up; numbers and the legend show below it", () => {
    const pts = [point("e2b", 15, 0.002), point("daytona", 12, 0.0016), point("boat", 40, 0.0005)];
    const html = renderToStaticMarkup(<Scatter points={pts} xTicks={[10, 20, 50]} yTicks={[0, 0.002, 0.004]} xTitle="x" yTitle="y" />);
    assert.equal(html.split("whitespace-nowrap text-neutral-8 max-[1340px]:hidden").length - 1, pts.length);
    assert.equal(html.split("tabular-nums min-[1340px]:hidden").length - 1, pts.length);
    assert.ok(!html.includes("sm:hidden"));
    const legend = html.slice(html.indexOf("<ol"));
    assert.ok(legend.includes("min-[1340px]:hidden"));
    assert.equal(legend.split("<li").length - 1, pts.length);
  });
});
