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
 *     --merge ~/agents/realtask-burst/runs/rtb-archil-1123/realtask-burst-archil.json \
 *     --hold-change boat="Boat's two tasks alone took 168 and 203 s, about twice its usual time, and a repeat showed identical Boat machines varying up to 2x, so two tasks can't set its baseline" \
 *     --hold-change archil="One of Archil's two tasks alone spent 127 s uploading the toolchain from our machine, against 4 s for the other, so two tasks can't set its baseline; the other task alone took 63 s, about the same as each task at once" \
 *     --location "Florida, US" \
 *     --out src/data/realtask-burst.json
 *
 * What it changes on the way:
 * - Failure reasons become plain words: the harness's JSON detail is reduced to
 *   the step and the provider's own message.
 * - A provider with fewer than 8 of 10 tasks completed gets no change from
 *   alone: the median of so few says little.
 * - --merge FILE replaces providers present in FILE and attaches that file's
 *   run metadata (`run.id`, `sdkCommit`, `startedAt`) so the chart attributes
 *   the rerun accurately. --rename old=new maps a setup name to its site ID.
 * - --hold-change provider="why" drops a provider's change and says why.
 * - --location replaces the harness's location, which names our own machine.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { isIsoTimestamp, parseRealtaskBurst } from "../src/lib/realtask-burst";

type Json = Record<string, unknown>;

function args() {
  const out: { in?: string; out?: string; location?: string; merges: string[]; renames: Map<string, string>; hold: Map<string, string> } = { merges: [], renames: new Map(), hold: new Map() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--in") out.in = value;
    else if (flag === "--merge") out.merges.push(value);
    else if (flag === "--rename") {
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--rename takes old=new");
      out.renames.set(value.slice(0, eq), value.slice(eq + 1));
    } else if (flag === "--out") out.out = value;
    else if (flag === "--location") out.location = value;
    else if (flag === "--hold-change") {
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--hold-change takes provider=why");
      out.hold.set(value.slice(0, eq), value.slice(eq + 1));
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!out.in || !out.out || !out.location) throw new Error("usage: --in FILE [--merge FILE]... [--rename old=new]... --out FILE --location PLACE [--hold-change provider=why]...");
  return { in: out.in, out: out.out, location: out.location, merges: out.merges, renames: out.renames, hold: out.hold };
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

function main() {
  const a = args();
  const raw = JSON.parse(readFileSync(a.in, "utf8")) as Json & { run: Json; providers: Json[] };
  let mergedProviders = [...raw.providers];
  let endedAt = String(raw.run.endedAt ?? "");
  const reqStr = (v: unknown, label: string, file: string): string => {
    if (typeof v !== "string" || !v.trim()) throw new Error(`missing required ${label} in ${file}`);
    return v;
  };
  for (const mergePath of a.merges) {
    const extra = JSON.parse(readFileSync(mergePath, "utf8")) as Json & { run?: Json; providers: Json[] };
    if (!extra.run || typeof extra.run !== "object") throw new Error(`missing required run object in ${mergePath}`);
    const extraRun = {
      id: reqStr(extra.run.id, "run.id", mergePath),
      sdkCommit: reqStr(extra.run.sdkCommit, "run.sdkCommit", mergePath),
      startedAt: reqStr(extra.run.startedAt, "run.startedAt", mergePath),
    };
    if (!isIsoTimestamp(extraRun.startedAt)) throw new Error(`invalid run.startedAt in ${mergePath}: ${extraRun.startedAt}`);
    if (typeof extra.run.endedAt === "string" && extra.run.endedAt > endedAt) endedAt = extra.run.endedAt;
    for (const p of extra.providers) {
      const id = a.renames.get(String(p.provider)) ?? String(p.provider);
      const { burstRounds: _drop, ...rest } = p;
      const entry: Json = { ...rest, provider: id, ...(p.status === "ran" ? { run: extraRun } : {}) };
      const idx = mergedProviders.findIndex((x) => String(x.provider) === id);
      if (idx >= 0) mergedProviders[idx] = entry;
      else mergedProviders.push(entry);
    }
  }
  const unknown = [...a.hold.keys()].filter((id) => !mergedProviders.some((p) => p.provider === id));
  if (unknown.length) throw new Error(`--hold-change names providers not in the run: ${unknown.join(", ")}`);
  const fix = (tasks: Json[]) =>
    tasks.map((t) => {
      const f = t.failure as { stage: string; reason: string } | undefined | null;
      return f ? { ...t, failure: { stage: f.stage, reason: plainReason(f.stage, f.reason) } } : t;
    });
  const providers = mergedProviders.map((p) => {
    if (p.status !== "ran") return p;
    const tasks = fix(p.tasks as Json[]);
    const solo = p.solo ? { ...(p.solo as Json), tasks: fix((p.solo as Json).tasks as Json[]) } : p.solo;
    const held = a.hold.get(p.provider as string);
    const few = (p.completed as number) < 8;
    const note = held ?? (few ? `only ${String(p.completed)} of ${String(p.attempts)} tasks finished, too few to compare with alone` : undefined);
    return { ...p, tasks, solo, ...(note ? { slowdown: null, slowdownWithoutUpload: null, changeNote: note } : {}) };
  });
  const out = { ...raw, run: { ...raw.run, endedAt, location: a.location }, providers };
  parseRealtaskBurst(out);
  writeFileSync(a.out, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${a.out}: ${providers.length} providers`);
}

if (import.meta.main) main();
