/**
 * Builds src/data/realtask-burst.json, the "Real tasks at once" result, from
 * the harness's export (`bun src/cli.ts realistic burst-summary` on the
 * sandbox-sdk branch realtask-burst). Never edit the JSON by hand: change the
 * inputs or the rules here and run this again.
 *
 * The command that built the committed data:
 *
 *   bun scripts/realtask-burst-site-data.ts \
 *     --in ~/agents/realtask-burst/realtask-burst.json \
 *     --hold-change boat="Boat's two tasks alone took 168 and 203 s, about twice its usual time, and a repeat showed identical Boat machines varying up to 2x, so two tasks can't set its baseline" \
 *     --location "Florida, US" \
 *     --add ~/agents/realtask-burst/runs/rtb-maritime-1123/realtask-burst-maritime.json \
 *     --add ~/agents/realtask-burst/runs/rtb-styne-1123/realtask-burst-styne.json \
 *     --add ~/agents/realtask-burst/runs/rtb-buddy-1124/realtask-burst-buddy.json \
 *     --add ~/agents/realtask-burst/runs/rtb-microsandbox-1124/realtask-burst-microsandbox.json \
 *     --add ~/agents/realtask-burst/runs/rtb-microsandbox-1124/realtask-burst-microsandbox-shared.json \
 *     --add ~/agents/realtask-burst/runs/rtb-archil-1126/realtask-burst-archil.json \
 *     --out src/data/realtask-burst.json
 *
 * Maritime was added on 2026-11-24 from its own run (rtb-maritime-1123, started
 * 04:21 UTC on Nov 24, sandbox-sdk 619307b, the same plan), and Styne on
 * 2026-11-23 from its own run (rtb-styne-1123, sandbox-sdk cd2e6e1, the same
 * plan), each with --add; every other provider's entry is the Nov 19 run's,
 * unchanged. Microsandbox Standard and Shared were added on 2026-11-25 from
 * their own runs (rtb-msb-std-1124 and rtb-msb-shr-1124, sandbox-sdk afdf664,
 * the same plan with solo controls).
 *
 * Buddy was added on 2026-11-25 the same way, from its own run (rtb-buddy-1124,
 * started 07:41 UTC on Nov 25, the same plan, from a sandbox-sdk checkout at
 * 5afd423: harness commit 5afd423, SDK commit a5c99d2. The run file's
 * sdkCommit field records that checkout, 5afd423); every other
 * provider's entry, Maritime's included, is unchanged.
 *
 * Archil was added on 2026-11-26 the same way, from its own run
 * (rtb-archil-1126, started 20:23 UTC on Nov 26, sandbox-sdk 28ac0a4, the same
 * plan). It replaced Archil's first run (rtb-archil-1123, Nov 23, 1f1de78),
 * whose change was held because one of its two tasks alone spent 127 s on the
 * toolchain upload; in the rerun both solo uploads took under 4 s.
 *
 * What it changes on the way:
 * - Failure reasons become plain words: the harness's JSON detail is reduced to
 *   the step and the provider's own message.
 * - A provider with fewer than 8 of 10 tasks completed gets no change from
 *   alone: the median of so few says little.
 * - --hold-change provider="why" drops a provider's change and says why.
 * - --location replaces the harness's location, which names our own machine.
 * - --add FILE appends the providers of a later one-provider run, each with
 *   that run's id, SDK commit and start as its `run`, so the chart can say it
 *   ran apart from the main run. A provider already in the main run stops it.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parseRealtaskBurst } from "../src/lib/realtask-burst";

type Json = Record<string, unknown>;

function args() {
  const out: { in?: string; out?: string; location?: string; hold: Map<string, string>; add: string[] } = { hold: new Map(), add: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--in") out.in = value;
    else if (flag === "--out") out.out = value;
    else if (flag === "--location") out.location = value;
    else if (flag === "--add") out.add.push(value);
    else if (flag === "--hold-change") {
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--hold-change takes provider=why");
      out.hold.set(value.slice(0, eq), value.slice(eq + 1));
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!out.in || !out.out || !out.location) throw new Error("usage: --in FILE --out FILE --location PLACE [--hold-change provider=why]... [--add FILE]...");
  return { in: out.in, out: out.out, location: out.location, hold: out.hold, add: out.add };
}

const firstSentence = (s: string) => s.split(/(?<=[.;])\s/)[0]!.replace(/[.;]$/, "");

/** "prepare-failed: {...detail...}" or "check-failed: test-b: ..." to a few plain words. */
export function plainReason(stage: string, reason: string): string {
  const json = /^prepare-failed: (\{.*\})$/.exec(reason);
  if (json) {
    const d = JSON.parse(json[1]!) as Json;
    const step = d.role === "toolchain" ? "uploading the toolchain" : `preparing (${String(d.role ?? d.kind ?? "setup")})`;
    return typeof d.detail === "string" ? `${step}: ${firstSentence(d.detail)}` : step;
  }
  const check = /^check-failed: (test-[a-z]+)/.exec(reason);
  if (check) return `a test step failed (${check[1]})`;
  return `${stage}: ${firstSentence(reason)}`;
}

type Export = Json & { run: Json; providers: Json[] };

/** A later run's providers, each carrying that run's id, SDK commit and start. */
function added(main: Export, file: string): Json[] {
  const other = JSON.parse(readFileSync(file, "utf8")) as Export;
  for (const k of ["schema", "size", "rounds", "track", "profile"] as const)
    if (other[k] !== main[k]) throw new Error(`${file}: ${k} is ${String(other[k])}, the main run's is ${String(main[k])}`);
  const run = { id: other.run.id, sdkCommit: other.run.sdkCommit, startedAt: other.run.startedAt };
  return other.providers.map((p) => {
    if (main.providers.some((q) => q.provider === p.provider)) throw new Error(`${file}: ${String(p.provider)} is already in the main run`);
    return { ...p, run };
  });
}

function main() {
  const a = args();
  const base = JSON.parse(readFileSync(a.in, "utf8")) as Export;
  const raw = { ...base, providers: [...base.providers, ...a.add.flatMap((f) => added(base, f))] };
  const unknown = [...a.hold.keys()].filter((id) => !raw.providers.some((p) => p.provider === id));
  if (unknown.length) throw new Error(`--hold-change names providers not in the run: ${unknown.join(", ")}`);
  const fix = (tasks: Json[]) =>
    tasks.map((t) => {
      const f = t.failure as { stage: string; reason: string } | undefined | null;
      return f ? { ...t, failure: { stage: f.stage, reason: plainReason(f.stage, f.reason) } } : t;
    });
  const providers = raw.providers.map((p) => {
    if (p.status !== "ran") return p;
    const tasks = fix(p.tasks as Json[]);
    const solo = p.solo ? { ...(p.solo as Json), tasks: fix((p.solo as Json).tasks as Json[]) } : p.solo;
    const held = a.hold.get(p.provider as string);
    const few = (p.completed as number) < 8;
    const note = held ?? (few ? `only ${String(p.completed)} of ${String(p.attempts)} tasks finished, too few to compare with alone` : undefined);
    return { ...p, tasks, solo, ...(note ? { slowdown: null, slowdownWithoutUpload: null, changeNote: note } : {}) };
  });
  const out = { ...raw, run: { ...raw.run, location: a.location }, providers };
  parseRealtaskBurst(out);
  writeFileSync(a.out, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${a.out}: ${providers.length} providers`);
}

if (import.meta.main) main();
