/**
 * Builds src/data/sustained-cpu.json, the 15-minute sustained CPU section, from
 * the harness's report (`bun src/cli.ts sustained-cpu` in sandbox-sdk, one
 * `sustained-cpu.json` per run). Never edit the JSON by hand: change the inputs
 * or the rules here and run this again.
 *
 *   bun scripts/sustained-cpu-site-data.ts \
 *     --report ~/agents/sustained-cpu-1125/sustained15m-20261125/sustained-cpu.json \
 *     --add ~/agents/sustained-cpu-1125/sustained15m-maritime-20261125/sustained-cpu.json \
 *     --add ~/agents/rerun-archil-20261126/sustained15m-archil-20261126/sustained-cpu.json \
 *     --not-run baseten="our API key was rejected" \
 *     --out src/data/sustained-cpu.json
 *
 * The published file is the Nov 25 run at sandbox-sdk 072122c (15 providers),
 * with Maritime added from its own run that day at 27f304a (the same runner
 * code), Archil added from its own run on Nov 26 at 28ac0a4, and Baseten marked
 * not run: our key was rejected before a sandbox started.
 *
 * What it changes on the way:
 * - The harness's points become the site's segments: a segment starts at its
 *   host offset (`wallOffsetS`, host seconds from the burn's start to the
 *   segment's end) less its verified burn time (`elapsedS`), and lasts that
 *   burn time. Only verified points are in the report, so each is checksumVerified.
 * - first3MinOps and last3MinOps are the site's own figures: the mean of the
 *   segments that start in minutes 0–3 and in minutes 12–15 (see windowMeans),
 *   and retention is their ratio. The harness's medians are left out.
 * - A run's durationS is its last segment's host offset, so a run that drifted
 *   past 15 minutes shows it.
 * - --add FILE appends the providers of a later one-provider run, each with
 *   that run's id, SDK commit and start as its `run`. A provider already in
 *   the main run stops it.
 * - --not-run provider="why" marks a run that never started for a reason on our
 *   side (a rejected key, our account's billing) as not run, with that why, so
 *   it never reads as the provider's failure. A run with any segment stops it.
 * - A run that stopped or failed gets a public reason from publicStopReason, never
 *   the harness's own text. A reason with no public wording, or one that reads as
 *   ours (a rejected key, our billing) without --not-run, stops it.
 * - Only the figures the page and the agent files use reach the site; the raw
 *   output, sandbox ids and the guest's Python path stay in the harness's report.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { SCHEMA, parseSustainedCpu, windowMeans } from "../src/lib/sustained-cpu";
import type { CpuSegment } from "../src/lib/sustained-cpu";
import { ourSide } from "./fairness-site-data";

type Json = Record<string, unknown>;

const isJson = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, what: string): Json => {
  if (!isJson(v)) throw new Error(`${what} must be an object`);
  return v;
};
const list = (v: unknown, what: string): readonly unknown[] => {
  if (!Array.isArray(v)) throw new Error(`${what} must be an array`);
  return v;
};
const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what} must be a number`);
  return v;
};

function args() {
  const out: { report?: string; out?: string; adds: string[]; notRun: Map<string, string> } = { adds: [], notRun: new Map() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--report") out.report = value;
    else if (flag === "--add") out.adds.push(value);
    else if (flag === "--out") out.out = value;
    else if (flag === "--not-run") {
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--not-run takes provider=why");
      out.notRun.set(value.slice(0, eq), value.slice(eq + 1));
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!out.report || !out.out) throw new Error('usage: --report FILE [--add FILE]... [--not-run provider="why"]... --out FILE');
  return { report: out.report, out: out.out, adds: out.adds, notRun: out.notRun };
}

const round = (v: number, places: number) => Number(v.toFixed(places));

/** One harness point to the site's segment. */
function segmentOf(v: unknown, index: number, what: string): CpuSegment & { checksumVerified: true } {
  const p = obj(v, what);
  if (p.segment !== index + 1) throw new Error(`${what}: segment ${String(p.segment)} where ${index + 1} was expected`);
  const elapsedS = num(p.elapsedS, `${what}.elapsedS`);
  return { index, startS: round(num(p.wallOffsetS, `${what}.wallOffsetS`) - elapsedS, 3), durationS: elapsedS, opsPerS: num(p.opsPerSec, `${what}.opsPerSec`), checksumVerified: true };
}

const publicReasons: readonly [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Segment (\d+) timed out$/, (m) => `segment ${m[1]} timed out`],
  [/^Segment (\d+): /, (m) => `segment ${m[1]}'s result didn't verify`],
  [/^No sandbox$/, () => "no sandbox was created"],
  [/^No python3 or python in the sandbox$/, () => "the sandbox had no Python"],
  [/^(?:Fingerprint|Writing the script) exited (\d+)/, (m) => `a setup command in the sandbox exited ${m[1]}`],
  [/^Run ended without a stop record/, () => "the run ended without a stop record"],
  [/^Stopped before the target$/, () => "it stopped before the last segment"],
  [/^Interrupted$/, () => "we interrupted the run"],
  [/\bHTTP (\d{3})\b/, (m) => `the provider's API returned HTTP ${m[1]}`],
  [/timed out|timeout/i, () => "a call to the provider timed out"],
];

/**
 * The site's wording for why a run stopped or failed, from the harness's stop reason, so its raw
 * text (provider error bodies, commands' stderr) never reaches the site. A reason that reads as
 * ours, or one with no wording here, stops the build: mark it --not-run, or add its wording. Its
 * errors name the provider and field only, never the raw text, which stays in the source report.
 */
export function publicStopReason(id: string, raw: string): string {
  if (ourSide(raw)) throw new Error(`${id}.stopReason reads as a problem on our side: mark it --not-run ${id}="why" (the raw reason is in the source report)`);
  for (const [pattern, text] of publicReasons) {
    const m = raw.match(pattern);
    if (m) return text(m);
  }
  throw new Error(`${id}.stopReason has no public wording: add one to publicReasons (the raw reason is in the source report)`);
}

/** One harness provider result to the site's provider, carrying `run` when it came from a later run. */
export function providerOf(v: unknown, run: Json | null, notRun: string | undefined): Json {
  const p = obj(v, "provider");
  const id = String(p.provider);
  const points = list(p.points, `${id}.points`);
  const segments = points.map((x, i) => segmentOf(x, i, `${id}.points[${i}]`));
  if (notRun !== undefined && segments.length > 0) throw new Error(`--not-run ${id}: it ran ${segments.length} segments`);
  const { first, last } = windowMeans(segments);
  const first3MinOps = first === null ? null : Math.round(first);
  const last3MinOps = last === null ? null : Math.round(last);
  return {
    provider: id,
    ...(run ? { run } : {}),
    status: notRun !== undefined ? "not-run" : p.status,
    stopReason: notRun ?? (p.status === "completed" ? p.stopReason : publicStopReason(id, String(p.stopReason))),
    guestVcpus: p.guestVcpus,
    durationS: segments.length === 0 ? 0 : num(obj(points.at(-1), `${id} last point`).wallOffsetS, `${id} last wallOffsetS`),
    segments,
    first3MinOps,
    last3MinOps,
    retention: first3MinOps !== null && last3MinOps !== null && first3MinOps > 0 ? round(last3MinOps / first3MinOps, 4) : null,
  };
}

function readReport(path: string): Json {
  const r = obj(JSON.parse(readFileSync(path, "utf8")), path);
  if (r.schema !== "sustained-cpu.v1") throw new Error(`${path}: schema must be sustained-cpu.v1, not ${String(r.schema)}`);
  return r;
}

function main() {
  const a = args();
  const base = readReport(a.report);
  const unknown = [...a.notRun.keys()].filter((id) => !list(base.providers, "providers").some((p) => obj(p, "provider").provider === id));
  if (unknown.length) throw new Error(`--not-run names providers not in the main run: ${unknown.join(", ")}`);
  const providers = list(base.providers, "providers").map((p) => providerOf(p, null, a.notRun.get(String(obj(p, "provider").provider))));
  for (const path of a.adds) {
    const later = readReport(path);
    for (const k of ["track", "targetDurationS", "segmentDurationS", "segmentsTarget"] as const)
      if (later[k] !== base[k]) throw new Error(`${path}: ${k} is ${String(later[k])}, the main run's is ${String(base[k])}`);
    const run = obj(later.run, `${path} run`);
    for (const p of list(later.providers, `${path} providers`)) {
      const id = obj(p, "provider").provider;
      if (providers.some((q) => q.provider === id)) throw new Error(`${path}: ${String(id)} is already in the main run`);
      providers.push(providerOf(p, { id: run.id, sdkCommit: run.sdkCommit, startedAt: run.startedAt }, undefined));
    }
  }
  const run = obj(base.run, "run");
  const file = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    track: base.track,
    targetDurationS: base.targetDurationS,
    segmentDurationS: base.segmentDurationS,
    segmentsTarget: base.segmentsTarget,
    run: { id: run.id, sdkCommit: run.sdkCommit, startedAt: run.startedAt },
    providers,
  };
  // The site's own parser, so this never writes a file the build would refuse.
  parseSustainedCpu(file);
  writeFileSync(a.out, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`Wrote ${a.out}: ${providers.length} providers\n`);
}

if (import.meta.main) main();
