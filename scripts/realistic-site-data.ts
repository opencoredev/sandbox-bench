/**
 * Builds src/data/realistic.json, the site's realistic-workload results
 * (SBX-94, SBX-103), from the harness's `summary.json` files. Never edit the
 * JSON by hand: change the inputs and run this again.
 *
 *   bun scripts/realistic-site-data.ts \
 *     --summary ~/agents/realistic-workloads/provider-runs/sbx103-vercel/merged/summary.json \
 *     --attempts ~/agents/realistic-workloads/provider-runs/sbx100-headline/attempts.jsonl \
 *     --manifest ~/agents/realistic-workloads/manifest.json
 *
 * Adding a provider run later (Modal, for example) is one more `--summary`:
 *
 *     --summary ~/agents/realistic-workloads/provider-runs/sbx103-modal/summary.json
 *
 * Options:
 * - `--summary <file>` (one or more, in order). A later summary replaces every
 *   row and held-open entry of each provider it contains, so a summary that
 *   repeats the earlier providers and one that has only the new provider both work.
 * - `--attempts <file>` (optional, any number): the runs' `attempts.jsonl`. It
 *   adds why setup stopped (free disk against the disk the workload needs) to
 *   rows whose runs failed in preparation. The runs it finds must match the
 *   summary's count exactly, so a wrong file stops the script.
 * - `--manifest <file>` (optional): the frozen workload manifest, for each
 *   workload's repo, commit and reference footprint.
 * - `--out <file>`: defaults to src/data/realistic.json.
 *
 * Checks before writing: every row parses into the site's schema
 * (src/lib/realistic.ts), the pick rule the site uses gives the same pick,
 * eligible set and lower unverified costs as each summary's own `picks`, and
 * every pick is "no certified winner" (the site has no interval data to show
 * a certified one). Any mismatch stops the script with the reason.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { SCHEMA, headlineRows, idleIds, parseRealistic, profileIds, runTracks, taskPick } from "@/lib/realistic";
import type { HeldOpen, PrepareFailure, ProfileId, RealisticData, RealisticRow, RunTrack, Workload } from "@/lib/realistic";
import type { ProviderId } from "@/lib/providers";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const need = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};
const sig = (v: number | null) => (v === null ? null : Number(v.toPrecision(6)));
const numOrNull = (v: unknown, where: string): number | null => {
  if (v === null || v === undefined) return null;
  need(typeof v === "number" && Number.isFinite(v), `${where} must be a number or null`);
  return Number(v);
};
const list = (v: unknown, where: string): readonly unknown[] => {
  need(Array.isArray(v), `${where} must be an array`);
  return Array.isArray(v) ? v : [];
};
const record = (v: unknown, where: string): Json => {
  need(isObj(v), `${where} must be an object`);
  return isObj(v) ? v : {};
};

/** "sbx103-vercel/merged": the run folder a summary came from, without the home directory. */
export const sourceName = (path: string) => `${basename(dirname(dirname(path)))}/${basename(dirname(path))}`.replace(/^\.\//, "");

/** The harness's eligibility text as flags: "eligible", "n/a" and "" carry none. */
export function flagsOf(eligibility: string): string[] {
  if (eligibility === "eligible" || eligibility === "n/a" || eligibility.trim() === "") return [];
  return eligibility.split("; ").map((s) => s.trim()).filter(Boolean);
}

/** One summary row in the site's shape, before the parser checks it. */
function rowFrom(raw: unknown, where: string, prepare: PrepareFailure | null) {
  const r = record(raw, where);
  const eligibility = typeof r.eligibility === "string" ? r.eligibility : "";
  const usd = numOrNull(r.costPerCompletedUSD, `${where}.costPerCompletedUSD`);
  const kind = r.costKind;
  const reasons = Object.entries(record(r.reasons ?? {}, `${where}.reasons`)).map(([reason, runs]) => ({ reason, runs }));
  return {
    provider: r.provider,
    profile: r.profile,
    track: r.track,
    variant: r.variant,
    attempts: r.attempts,
    completed: r.completed,
    incomplete: r.incomplete,
    notRun: r.notRun,
    reasons,
    prepare,
    medianWallS: sig(numOrNull(r.medianWallS, `${where}.medianWallS`)),
    medianCpuS: sig(numOrNull(r.medianCpuS, `${where}.medianCpuS`)),
    cost: usd === null || kind === null || kind === undefined ? null : { kind, usdPerCompleted: sig(usd), wholeMachineUsdPerCompleted: sig(numOrNull(r.wholeMachinePerCompletedUSD, `${where}.wholeMachinePerCompletedUSD`)) },
    costNote: typeof r.costNote === "string" ? r.costNote : null,
    billingModel: r.billingModel ?? null,
    eligible: eligibility === "eligible",
    flags: flagsOf(eligibility),
  };
}

function heldFrom(raw: unknown, where: string) {
  const h = record(raw, where);
  return {
    provider: h.provider,
    idle: h.idle,
    runs: h.runs,
    completed: h.completed,
    costKind: h.costKind ?? null,
    medianCostUsd: sig(numOrNull(h.medianCostUSD, `${where}.medianCostUSD`)),
    changeVsZeroWait: sig(numOrNull(h.changeVsZeroWait, `${where}.changeVsZeroWait`)),
    status: h.status,
    medianWakeMs: numOrNull(h.medianWakeMs, `${where}.medianWakeMs`),
    transitions: h.transitions ?? [],
  };
}

const keyOf = (r: { readonly [k: string]: unknown }) => `${String(r.provider)}/${String(r.profile)}/${String(r.track)}/${String(r.variant)}`;

/**
 * Setup failures from attempts.jsonl lines, keyed like rows. Only an
 * "insufficient-disk" detail is read; attempts the summary dropped (superseded
 * by a rerun) are skipped.
 */
export function prepareFailures(lines: readonly string[], dropped: ReadonlySet<string>): Map<string, PrepareFailure> {
  const out = new Map<string, PrepareFailure>();
  for (const line of lines) {
    if (line.trim() === "") continue;
    const a: unknown = JSON.parse(line);
    if (!isObj(a) || !isObj(a.completion) || a.completion.reason !== "prepare-failed" || typeof a.completion.detail !== "string") continue;
    if (typeof a.attemptId === "string" && dropped.has(a.attemptId)) continue;
    let detail: unknown;
    try {
      detail = JSON.parse(a.completion.detail);
    } catch {
      continue;
    }
    if (!isObj(detail) || detail.kind !== "insufficient-disk" || typeof detail.freeGiB !== "number" || typeof detail.requiredGiB !== "number") continue;
    const key = keyOf({ provider: a.provider, profile: a.profile, track: a.track, variant: a.variant });
    const seen = out.get(key);
    out.set(key, {
      kind: "insufficient-disk",
      freeGiB: sig(Math.min(seen?.freeGiB ?? Number.POSITIVE_INFINITY, detail.freeGiB)) ?? detail.freeGiB,
      requiredGiB: detail.requiredGiB,
      runs: (seen?.runs ?? 0) + 1,
    });
  }
  return out;
}

/** Each workload's repo, commit and reference footprint from the manifest. */
export function workloadsFrom(manifest: unknown): Record<ProfileId, Workload> {
  const profiles = record(record(manifest, "manifest").profiles, "manifest.profiles");
  const one = (id: ProfileId): Workload => {
    const p = record(profiles[id], `manifest.profiles.${id}`);
    const runs = list(record(p.referenceFootprint, `manifest.profiles.${id}.referenceFootprint`).runs, `manifest.profiles.${id}.referenceFootprint.runs`).map((r, i) => record(r, `${id} reference run ${i}`));
    need(runs.length > 0, `manifest.profiles.${id} has no reference runs`);
    const cpu = runs.map((r) => Number(record(r.work, `${id} work`).cpuS));
    // The build is memory-heavy and sits at the 8 GiB cap with page cache, so its anonymous peak says more.
    const mem = runs.map((r) => Number(id === "build" ? r.anonPeakGiBSampled : r.memoryPeakGiB));
    need([...cpu, ...mem].every(Number.isFinite), `manifest.profiles.${id} reference runs need work.cpuS and memory peaks`);
    const checks = isObj(p.completionChecks) && isObj(p.completionChecks.afterPatchB) && isObj(p.completionChecks.afterPatchB.tests) ? p.completionChecks.afterPatchB.tests.passed : null;
    return {
      repo: String(p.repo),
      commit: String(p.commit),
      workCpuS: { min: Math.min(...cpu), max: Math.max(...cpu) },
      memoryGiB: { min: Math.min(...mem), max: Math.max(...mem) },
      tests: typeof checks === "number" ? checks : null,
    };
  };
  return { "fix-and-test": one("fix-and-test"), build: one("build") };
}

/** The summary's own picks against the site's rule on the same rows. Throws on the first difference. */
export function checkPicks(name: string, picks: readonly unknown[], data: RealisticData) {
  for (const raw of picks) {
    const p = record(raw, `${name} pick`);
    const where = `${name} pick ${String(p.profile)} / ${String(p.track)}`;
    need(p.verdict === "no-certified-winner", `${where}: verdict "${String(p.verdict)}" isn't supported; the site only shows "no certified winner" until it carries the interval data a certified pick needs`);
    need(profileIds.some((x) => x === p.profile) && runTracks.some((x) => x === p.track), `${where}: unknown profile or track`);
    const profile = profileIds.find((x) => x === p.profile);
    const track = runTracks.find((x) => x === p.track);
    if (!profile || !track) continue;
    const ours = taskPick(headlineRows(data, track, profile).costed);
    const eligible = list(p.eligible, `${where}.eligible`).map(String);
    const lower = list(p.lowerUnverified, `${where}.lowerUnverified`).map((l) => String(record(l, `${where}.lowerUnverified`).provider));
    switch (ours.kind) {
      case "verified":
        need(p.lowest === ours.pick.provider, `${where}: the summary's lowest eligible is ${String(p.lowest)}, the site's rule gives ${ours.pick.provider}`);
        need(eligible.join() === ours.eligible.join(), `${where}: eligible ${eligible.join()} vs the site's ${ours.eligible.join()}`);
        need(lower.join() === ours.lower.map((r) => r.provider).join(), `${where}: lower unverified ${lower.join()} vs the site's ${ours.lower.map((r) => r.provider).join()}`);
        break;
      case "none":
      case "empty":
        need(eligible.length === 0, `${where}: the summary has eligible ${eligible.join()}, the site's rule finds none`);
        break;
      default: {
        const _exhaustive: never = ours;
        return _exhaustive;
      }
    }
  }
}

export interface SummaryInput {
  name: string;
  raw: unknown;
}

/**
 * The site's data from summaries in order, a later one replacing each
 * provider it contains, with setup failures from attempts and footprints
 * from the manifest. Pure: the CLI below does the file reading.
 */
export function buildRealistic({ summaries, attempts = [], manifest = null, generatedAt }: { summaries: readonly SummaryInput[]; attempts?: readonly string[]; manifest?: unknown; generatedAt: string }): RealisticData {
  need(summaries.length > 0, "give at least one --summary");
  let rows: unknown[] = [];
  let held: unknown[] = [];
  let fx: Json | null = null;
  const sources: { name: string; generatedAt: string; providers: unknown[] }[] = [];
  for (const { name, raw } of summaries) {
    const s = record(raw, name);
    const dropped = new Set(list(s.dropped ?? [], `${name}.dropped`).flatMap((d) => (isObj(d) && typeof d.attemptId === "string" ? [d.attemptId] : [])));
    const setup = prepareFailures(attempts, dropped);
    const own = list(s.rows, `${name}.rows`).map((r, i) => {
      const row = record(r, `${name}.rows[${i}]`);
      const key = keyOf(row);
      const reasons = record(row.reasons ?? {}, `${name}.rows[${i}].reasons`);
      const prepared = setup.get(key) ?? null;
      const failedRuns = typeof reasons["prepare-failed"] === "number" ? reasons["prepare-failed"] : 0;
      // A setup detail is attached only where it accounts for every setup failure of that row.
      if (prepared) need(prepared.runs === failedRuns, `${name}: ${key} has ${failedRuns} setup failures but the attempts files show ${prepared.runs} out-of-disk ones; pass the attempts of the runs this summary merged`);
      return rowFrom(r, `${name}.rows[${i}]`, prepared && failedRuns > 0 ? prepared : null);
    });
    const ownHeld = list(s.heldOpen ?? [], `${name}.heldOpen`).map((h, i) => heldFrom(h, `${name}.heldOpen[${i}]`));
    const providers = [...new Set([...own, ...ownHeld].map((r) => r.provider))];
    // Check this summary's picks on its own rows before merging, so each file is checked against itself.
    checkPicks(name, list(s.picks ?? [], `${name}.picks`), parseRealistic(fileOf({ generatedAt, sources: [], fx: null, workloads: null, rows: own, heldOpen: ownHeld })));
    rows = [...rows.filter((r) => isObj(r) && !providers.includes(r.provider)), ...own];
    held = [...held.filter((h) => isObj(h) && !providers.includes(h.provider)), ...ownHeld];
    if (isObj(s.fx)) {
      need(fx === null || (fx.eurToUsd === s.fx.eurToUsd && fx.date === s.fx.date), `${name}: its EUR to USD rate differs from an earlier summary's; rerun the reports on one frozen rate`);
      fx = s.fx;
    }
    sources.push({ name, generatedAt: String(s.generatedAt ?? ""), providers });
  }
  const order = (r: unknown) => (isObj(r) ? `${String(r.variant)}/${String(r.profile)}/${String(r.track)}/${String(r.provider)}` : "");
  const heldOrder = (h: unknown) => (isObj(h) ? `${String(h.provider)}/${idleIds.findIndex((i) => i === h.idle)}` : "");
  return parseRealistic(
    fileOf({
      generatedAt,
      sources,
      fx: fx ? { eurToUsd: fx.eurToUsd, date: fx.date } : null,
      workloads: manifest === null ? null : workloadsFrom(manifest),
      rows: [...rows].sort((a, b) => order(a).localeCompare(order(b))),
      heldOpen: [...held].sort((a, b) => heldOrder(a).localeCompare(heldOrder(b))),
    }),
  );
}

function fileOf(parts: { generatedAt: string; sources: unknown; fx: unknown; workloads: unknown; rows: unknown; heldOpen: unknown }) {
  return { schema: SCHEMA, ...parts };
}

// Re-exported for tests that build fixtures in the site's types.
export type { HeldOpen, ProviderId, RealisticRow, RunTrack };

function main(argv: readonly string[]) {
  const take = (flag: string) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1] ?? ""] : []));
  const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
  const summaries = take("--summary").map((p) => ({ name: sourceName(resolve(p)), raw: readJson(p) }));
  const attempts = take("--attempts").flatMap((p) => readFileSync(p, "utf8").split("\n"));
  const [manifestPath] = take("--manifest");
  const [outPath = resolve(import.meta.dirname, "../src/data/realistic.json")] = take("--out");
  const data = buildRealistic({
    summaries,
    attempts,
    manifest: manifestPath ? readJson(manifestPath) : null,
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`);
  const providers = new Set(data.rows.map((r) => r.provider));
  process.stdout.write(`wrote ${outPath}: ${data.rows.length} rows, ${data.heldOpen.length} held-open entries, ${providers.size} providers (${[...providers].join(", ")}) from ${data.sources.map((s) => s.name).join(" + ")}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
