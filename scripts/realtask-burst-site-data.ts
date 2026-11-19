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
 *     --out src/data/realtask-burst.json
 *
 * What it changes on the way:
 * - Failure reasons become plain words: the harness's JSON detail is reduced to
 *   the step and the provider's own message.
 * - A provider with fewer than 8 of 10 tasks completed gets no change from
 *   alone: the median of so few says little.
 * - --hold-change provider="why" drops a provider's change and says why.
 * - --location replaces the harness's location, which names our own machine.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parseRealtaskBurst } from "../src/lib/realtask-burst";

type Json = Record<string, unknown>;

function args() {
  const out: { in?: string; out?: string; location?: string; hold: Map<string, string> } = { hold: new Map() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--in") out.in = value;
    else if (flag === "--out") out.out = value;
    else if (flag === "--location") out.location = value;
    else if (flag === "--hold-change") {
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--hold-change takes provider=why");
      out.hold.set(value.slice(0, eq), value.slice(eq + 1));
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!out.in || !out.out || !out.location) throw new Error("usage: --in FILE --out FILE --location PLACE [--hold-change provider=why]...");
  return { in: out.in, out: out.out, location: out.location, hold: out.hold };
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
  if (check) return `the test run failed (${check[1]}, Vue's timing-sensitive Suspense test)`;
  return `${stage}: ${firstSentence(reason)}`;
}

function main() {
  const a = args();
  const raw = JSON.parse(readFileSync(a.in, "utf8")) as Json & { providers: Json[] };
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
  const out = { ...raw, run: { ...(raw.run as Json), location: a.location }, providers };
  parseRealtaskBurst(out);
  writeFileSync(a.out, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${a.out}: ${providers.length} providers`);
}

if (import.meta.main) main();
