import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import raw from "@/data/sustained-cpu.json";
import { SustainedCpuSection } from "@/components/sustained-cpu";
import { agentData, agentMarkdown, llmsTxt, sustainedCpuData, sustainedCpuLlms, sustainedCpuMarkdown } from "@/lib/agent-data";
import type { ProviderId } from "@/lib/providers";
import { hasSustainedCpu, minutesText, parseSustainedCpu, retentionText, sustainedRanked, windowMeans } from "@/lib/sustained-cpu";
import type { SustainedCpuData } from "@/lib/sustained-cpu";
import { sustainedCpu } from "@/lib/sustained-cpu-data";

// The sustained CPU file's parser, its ranking and the section it draws. Run with `bun test`.

type RawSegment = { index: number; startS: number; durationS: number; opsPerS: number; checksumVerified: boolean };

/** `count` 30-second segments, the rate each one gets from `rate(minute)`. */
const segments = (count: number, rate: (minute: number) => number): RawSegment[] =>
  Array.from({ length: count }, (_, i) => ({ index: i, startS: i * 30, durationS: 30, opsPerS: rate((i * 30) / 60), checksumVerified: true }));

/** A provider row whose means and retention are worked out from its segments, as the harness writes them. */
function run(provider: ProviderId, status: "completed" | "stopped-early" | "failed", segs: RawSegment[], stopReason: string | null = null) {
  const { first, last } = windowMeans(segs);
  const retention = first !== null && last !== null && first > 0 ? Number((last / first).toFixed(3)) : null;
  const end = segs.at(-1);
  return { provider, status, stopReason, guestVcpus: 4, durationS: end ? end.startS + end.durationS : 0, segments: segs, first3MinOps: first, last3MinOps: last, retention };
}

const BURST = 62_000_000;
/** A realistic file: a dedicated CPU that holds, a burstable one held to 16% after 10 minutes, one that stopped at 13.5 minutes, one at 8, and one that failed. */
const fixture = () => ({
  schema: "sustained-cpu.v1",
  generatedAt: "2026-11-24T06:00:00.000Z",
  track: "same-machine",
  targetDurationS: 900,
  segmentDurationS: 30,
  segmentsTarget: 30,
  run: { id: "sustained-2026-11-24", sdkCommit: "abc1234def", startedAt: "2026-11-24T02:00:00.000Z" },
  providers: [
    run("e2b", "completed", segments(30, (m) => 40_000_000 - m * 20_000)),
    run("styne", "completed", segments(30, (m) => (m < 10 ? BURST : BURST * 0.16))),
    run("daytona", "stopped-early", segments(27, () => 30_000_000), "the sandbox was stopped by its 13.5-minute idle timeout"),
    run("boxd", "stopped-early", segments(16, () => 35_000_000), "the provider deleted the sandbox at 8 minutes"),
    run("modal", "failed", [], "create returned HTTP 503"),
  ],
});

const parsed = () => parseSustainedCpu(fixture());

/** The fixture with one change, made by `edit` on a fresh copy. */
const withEdit = (edit: (f: ReturnType<typeof fixture>) => void) => {
  const f = fixture();
  edit(f);
  return f;
};

const providerAt = (f: ReturnType<typeof fixture>, id: ProviderId) => {
  const p = f.providers.find((x) => x.provider === id);
  assert.ok(p, id);
  return p;
};

describe("parse", () => {
  test("the published data parses with all 15 providers and an empty file draws nothing", () => {
    assert.equal(sustainedCpu.providers.length, 15);
    assert.equal(hasSustainedCpu(sustainedCpu), true);
    assert.equal(parseSustainedCpu(raw).run.id, "sustained15m-20261123");
    const { ranked, missing } = sustainedRanked(sustainedCpu);
    assert.equal(ranked.length, 13);
    assert.equal(ranked[0]?.provider, "instabox");
    assert.equal(ranked.at(-1)?.provider, "styne");
    assert.equal(Math.round((ranked.at(-1)?.retention ?? 0) * 100), 17);
    assert.deepEqual(missing.map((m) => m.provider).sort(), ["baseten", "superserve"]);
    const empty = parseSustainedCpu({ ...fixture(), providers: [] });
    assert.equal(hasSustainedCpu(empty), false);
    assert.equal(renderToStaticMarkup(<SustainedCpuSection data={empty} />), "");
  });

  test("a realistic file parses, with each status's fields", () => {
    const d = parsed();
    assert.equal(d.providers.length, 5);
    const styne = d.providers.find((p) => p.provider === "styne");
    assert.ok(styne?.status === "completed");
    assert.equal(styne.first3MinOps, BURST);
    assert.equal(styne.last3MinOps, BURST * 0.16);
    assert.equal(styne.retention, 0.16);
    assert.equal(styne.stopReason, null);
    const modal = d.providers.find((p) => p.provider === "modal");
    assert.ok(modal?.status === "failed");
    assert.equal(modal.stopReason, "create returned HTTP 503");
    assert.equal(modal.first3MinOps, null);
  });

  const rejects = (name: string, edit: (f: ReturnType<typeof fixture>) => void, message: RegExp) =>
    test(`rejects ${name}`, () => assert.throws(() => parseSustainedCpu(withEdit(edit)), message));

  rejects("another schema", (f) => (f.schema = "sustained-cpu.v2"), /schema must be sustained-cpu\.v1/);
  rejects("another track", (f) => (f.track = "default"), /track must be same-machine/);
  rejects("another run length", (f) => (f.targetDurationS = 600), /targetDurationS must be 900/);
  rejects("another segment length", (f) => (f.segmentDurationS = 60), /segmentDurationS must be 30/);
  rejects("an invalid generatedAt", (f) => (f.generatedAt = "yesterday"), /generatedAt must be a valid timestamp/);
  rejects("an invalid run start", (f) => (f.run.startedAt = "2026-13-45T99:00:00Z"), /run\.startedAt must be a valid timestamp/);
  rejects("an empty run id", (f) => (f.run.id = ""), /run\.id must be a non-empty string/);
  rejects("an unknown provider", (f) => ((f.providers[0] as { provider: string }).provider = "nope"), /not a known provider: nope/);
  rejects("a provider listed twice", (f) => f.providers.push(run("e2b", "completed", segments(30, () => 1))), /lists e2b twice/);
  rejects("an unknown status", (f) => ((f.providers[0] as { status: string }).status = "done"), /status must be one of completed, stopped-early, failed/);
  rejects("a retention that doesn't match its means", (f) => (providerAt(f, "styne").retention = 0.2), /providers\[1\]\.retention is 0\.2 but its segments give 0\.16/);
  rejects("a retention where a window is missing", (f) => (providerAt(f, "boxd").retention = 0.5), /providers\[3\]\.retention is 0\.5 but its segments give null/);
  rejects("a first-window mean that doesn't match its segments", (f) => (providerAt(f, "e2b").first3MinOps = 41_000_000), /first3MinOps is 41000000 but its segments give/);
  rejects("a last-window mean where no segment reached minute 12", (f) => (providerAt(f, "boxd").last3MinOps = 35_000_000), /providers\[3\]\.last3MinOps is 35000000 but its segments give null/);
  rejects("a negative rate", (f) => {
    const seg = providerAt(f, "e2b").segments[3];
    assert.ok(seg);
    seg.opsPerS = -1;
  }, /segments\[3\]\.opsPerS must be a finite number, 0 or more/);
  rejects("an infinite rate", (f) => {
    const seg = providerAt(f, "e2b").segments[3];
    assert.ok(seg);
    seg.opsPerS = Number.POSITIVE_INFINITY;
  }, /must be a finite number/);
  rejects("a segment that starts before the last one ended", (f) => {
    const seg = providerAt(f, "e2b").segments[5];
    assert.ok(seg);
    seg.startS = 100;
  }, /segments\[5\]\.startS is 100, before the previous segment ended at 150/);
  rejects("segments out of order", (f) => {
    const seg = providerAt(f, "e2b").segments[2];
    assert.ok(seg);
    seg.index = 7;
  }, /segments\[2\]\.index must be 2/);
  rejects("a segment whose checksum wasn't verified", (f) => {
    const seg = providerAt(f, "e2b").segments[0];
    assert.ok(seg);
    seg.checksumVerified = false;
  }, /checksumVerified must be true/);
  rejects("a completed run with too few segments", (f) => {
    const e2b = providerAt(f, "e2b");
    Object.assign(e2b, run("e2b", "completed", segments(29, () => 40_000_000)));
  }, /has 29 segments; a completed run has 30/);
  rejects("a completed run with a stop reason", (f) => (providerAt(f, "e2b").stopReason = "timeout"), /stopReason must be null on a completed run/);
  rejects("a stopped run without a stop reason", (f) => (providerAt(f, "boxd").stopReason = null), /stopReason must be a non-empty string/);
  rejects("a stopped-early run with no segments", (f) => Object.assign(providerAt(f, "boxd"), run("boxd", "stopped-early", [], "gone")), /a run with no segment failed/);
  rejects("a duration shorter than its segments", (f) => (providerAt(f, "e2b").durationS = 600), /durationS is 600, shorter than its segments, which end at 900/);
  rejects("a fractional vCPU count", (f) => (providerAt(f, "e2b").guestVcpus = 3.5), /guestVcpus must be a whole number above 0/);
  rejects("shortened 1-second segments", (f) => {
    const styne = providerAt(f, "styne");
    styne.segments = Array.from({ length: 30 }, (_, i) => ({ index: i, startS: i, durationS: 1, opsPerS: BURST, checksumVerified: true }));
    styne.durationS = 30;
  }, /segments\[0\]\.durationS is 1, shorter than a 30-second segment/);
  rejects("a missing field", (f) => delete (f.providers[0] as Partial<(typeof f.providers)[0]>).retention, /retention must be a finite number/);

  test("excludes segments starting at or after minute 15 from the minutes 12–15 window (Freestyle)", () => {
    const freestyle = sustainedCpu.providers.find((p) => p.provider === "freestyle");
    assert.ok(freestyle && freestyle.status === "completed");
    const lastSeg = freestyle.segments.at(-1);
    assert.ok(lastSeg && lastSeg.startS >= 900, "Freestyle's 30th segment starts past 900 s");
    const inWindow = freestyle.segments.filter((s) => s.startS >= 720 && s.startS < 900);
    const expectedMean = inWindow.reduce((sum, s) => sum + s.opsPerS, 0) / inWindow.length;
    assert.equal(Math.round(expectedMean), freestyle.last3MinOps);
    assert.ok(freestyle.last3MinOps > 40_100_000 && freestyle.last3MinOps < 40_300_000);
  });
});

describe("rules", () => {
  test("ranked by minutes 12–15, highest first; a run that stopped before minute 12 or failed is listed with why", () => {
    const { ranked, missing } = sustainedRanked(parsed());
    assert.deepEqual(ranked.map((p) => p.provider), ["e2b", "daytona", "styne"]);
    assert.deepEqual(missing, [
      { provider: "boxd", why: "stopped at 8 min, before minute 12: the provider deleted the sandbox at 8 minutes" },
      { provider: "modal", why: "failed: create returned HTTP 503" },
    ]);
  });

  test("retention and minutes in words", () => {
    assert.equal(retentionText(0.16), "16%");
    assert.equal(retentionText(0.994), "99%");
    assert.equal(retentionText(1), "100%");
    assert.equal(minutesText(900), "15 min");
    assert.equal(minutesText(810), "13.5 min");
  });
});

describe("section", () => {
  const html = renderToStaticMarkup(<SustainedCpuSection data={parsed()} />);
  const text = html.replace(/<[^>]+>/g, "");

  test("two tabs: the run over 15 minutes and the steady state", () => {
    assert.match(html, /aria-label="Sustained CPU"/);
    assert.match(text, /Over 15 minutes/);
    assert.match(text, /Steady state, 12–15 min/);
  });

  test("the line chart draws one line per run with a segment, a dashed 10-minute marker and 0 to 15 minutes across", () => {
    const lines = [...html.matchAll(/<polyline\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(lines.length, 4, "Modal failed with no segment, so it has no line");
    const styne = lines.find((l) => l.includes(`stroke="oklch(0.72 0.18 304)"`));
    assert.ok(styne);
    const points = /points="([^"]+)"/.exec(styne)?.[1]?.split(" ") ?? [];
    assert.equal(points.length, 30);
    assert.ok(points.every((p) => /^[\d.]+,[\d.]+$/.test(p)), "no NaN in the line");
    assert.match(html, /border-dashed[^>]*>.*?10 min</);
    assert.match(text, /15 min/);
    assert.match(html, /viewBox="0 0 1 1"/);
  });

  test("the legend names every provider with a line and its retention, each a toggle", () => {
    const buttons = [...html.matchAll(/<button type="button" aria-pressed="false"[^>]*>(.*?)<\/button>/g)].map((m) => (m[1] ?? "").replace(/<[^>]+>/g, ""));
    assert.deepEqual(buttons, ["E2B99%", "Daytona100%", "Styne16%", "boxdstopped"]);
  });

  test("the steady-state columns rank by minutes 12–15 with retention tags, and the hover lines say each window", () => {
    assert.match(text, /39\.7M[\s\S]*30M[\s\S]*9\.9M/);
    for (const tag of ["99%", "100%", "16%"]) assert.ok(text.includes(tag), tag);
    for (const line of ["Minutes 12–15", "Minutes 0–3", "Retention", "Workers", "Visible vCPU", "Duration"]) assert.ok(html.includes(line), line);
    assert.ok(html.includes("Burstable shared CPU: up to 10 min full-speed burst credit, then held to 16% per vCPU."), "Styne's card states its CPU class");
  });

  test("runs off the chart are named under it, and the notes give the exact stop reasons", () => {
    assert.match(text, /No result for boxd and Modal\. Notes says why\./);
    assert.match(text, /No result for Modal\. Notes says why\./);
    assert.ok(text.includes("boxd: no result (stopped at 8 min, before minute 12: the provider deleted the sandbox at 8 minutes)."));
    assert.ok(text.includes("Modal: no result (failed: create returned HTTP 503)."));
    assert.ok(text.includes("Stopped at 13.5 min: the sandbox was stopped by its 13.5-minute idle timeout."), "Daytona is on the chart with its reason");
  });

  test("the notes explain the workload and why it runs 15 minutes", () => {
    assert.ok(text.includes("30 back-to-back 30-second segments of 32-bit LCG arithmetic with 4 workers per sandbox, 15 min of work in all, with each segment&#x27;s checksum verified"));
    assert.match(text, /4 vCPU and 8 GB/);
    assert.match(text, /boxd ran its nearest size, 4 vCPU and 16 GiB/);
    assert.match(text, /15 minutes runs past Styne&#x27;s 10-minute credit window/);
    assert.match(text, /SDK commit abc1234/);
  });
});

describe("exports", () => {
  test("published results.json, results.md and llms.txt include the 15-minute sustained CPU data", () => {
    assert.equal("sustainedCpu" in agentData(), true);
    assert.match(agentMarkdown(), /Sustained CPU over 15 minutes/);
    assert.match(llmsTxt(), /Sustained CPU over 15 minutes/);
  });

  test("results.json, results.md and llms.txt agree with the chart once it has data", () => {
    const d: SustainedCpuData = parsed();
    const json = sustainedCpuData(d);
    assert.deepEqual(json.ranked.map((r) => r.provider), ["e2b", "daytona", "styne"]);
    assert.equal(json.ranked[2]?.retention, 0.16);
    assert.equal(json.ranked[2]?.cpuCaveat?.short, "Burstable · 16% baseline");
    assert.deepEqual(json.noSteadyState.map((m) => m.provider), ["boxd", "modal"]);
    assert.equal(json.providers.find((p) => p.provider === "styne")?.segments.length, 30);
    const md = sustainedCpuMarkdown(d).join("\n");
    assert.match(md, /\| 3 \| Styne \| 62M\/s \| 9\.9M\/s \| 16% \| completed \|/);
    assert.match(md, /\| 2 \| Daytona \| .* \| stopped early: the sandbox was stopped by its 13\.5-minute idle timeout \|/);
    assert.match(md, /Modal: no minutes 12–15 figure \(failed: create returned HTTP 503\)\./);
    const llms = sustainedCpuLlms(d);
    assert.match(llms, /3\. Styne: 62M ops\/s in minutes 0–3, 9\.9M ops\/s in minutes 12–15, 16% retained \(Burstable · 16% baseline\)/);
  });
});
