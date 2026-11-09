/**
 * Builds src/data/realistic.json, the site's realistic-workload results
 * (SBX-94, SBX-103), from the harness's `summary.json` files. Never edit the
 * JSON by hand: change the inputs and run this again.
 *
 *   bun scripts/realistic-site-data.ts \
 *     --summary ~/agents/realistic-workloads/provider-runs/sbx103-vercel/merged/summary.json \
 *     --parts scripts/realistic-parts/sbx103-vercel.json \
 *     --attempts ~/agents/realistic-workloads/provider-runs/sbx100-headline/attempts.jsonl \
 *     --manifest ~/agents/realistic-workloads/manifest.json
 *
 * Adding a provider run later (Modal, for example): add the provider to
 * scripts/realistic-coverage.json (headline, and idle or notTested with why),
 * then run the same command with one more `--summary`:
 *
 *     --summary ~/agents/realistic-workloads/provider-runs/sbx103-modal/summary.json
 *     --parts scripts/realistic-parts/sbx103-modal.json
 *
 * Each --parts file comes from scripts/realistic-estimated-parts.ts, run once
 * per summary against the harness checkout that built it (see its header).
 *
 * Options:
 * - `--summary <file>` (one or more, in order). A later summary replaces every
 *   row and held-open entry of each provider it contains, so a summary that
 *   repeats the earlier providers and one that has only the new provider both work.
 * - `--parts <file>` (required, one per summary): the output of
 *   scripts/realistic-estimated-parts.ts for that summary's runs. It marks the
 *   part of each cost that is our estimate (disk added at list price), and every
 *   recomputed total must match the summary's.
 * - `--attempts <file>` (optional, any number): the runs' `attempts.jsonl`. It
 *   adds why setup stopped (free disk against the disk the workload needs) to
 *   rows whose runs failed in preparation. The runs it finds must match the
 *   summary's count exactly, so a wrong file stops the script.
 * - `--manifest <file>` (optional): the frozen workload manifest, for each
 *   workload's repo, commit and reference footprint.
 * - `--coverage <file>`: what a complete data set holds, defaults to
 *   scripts/realistic-coverage.json: every provider, workload, track and idle
 *   variant, and the run count of each. The run count is the "5 runs" the
 *   pilot line prints, so the label can't drift from the data.
 * - `--out <file>`: defaults to src/data/realistic.json.
 *
 * Checks before writing: each summary is complete for every provider it has
 * (so a partial file can't replace good rows) and carries a pick for every
 * workload and track; the merged result is complete against the coverage;
 * every row parses into the site's schema
 * (src/lib/realistic.ts), the pick rule the site uses gives the same pick,
 * eligible set and lower unverified costs as each summary's own `picks`, and
 * every pick is "no certified winner" (the site has no interval data to show
 * a certified one). Any mismatch stops the script with the reason.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { SCHEMA, headlineRows, idleIds, parseCoverage, parseParts, parseRealistic, profileIds, providerGaps, runTracks, taskPick } from "@/lib/realistic";
import type { Coverage, HeldOpen, PrepareFailure, ProfileId, RealisticData, RealisticRow, RunTrack, Workload } from "@/lib/realistic";
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
/** One parts file's entries, by row key and by held-open key, each with the total it was computed for. */
export interface SummaryParts {
  rows: Map<string, { total: number | null; usd: number; labels: string[] }>;
  held: Map<string, { total: number | null; usd: number; labels: string[] }>;
}

const totalOf = (v: unknown) => (typeof v === "number" ? v : null);
const sameTotal = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9);

/**
 * The --parts files keyed by the SHA-256 of the summary.json each was
 * computed for (scripts/realistic-estimated-parts.ts records it). A summary
 * only ever reads its own file, so two summaries with equal totals can't swap
 * parts. A key twice in one file, or two different files for one summary, is refused.
 */
export function partsByDigest(files: readonly unknown[]): Map<string, SummaryParts> {
  const out = new Map<string, { parts: SummaryParts; text: string }>();
  for (const [i, f] of files.entries()) {
    const file = record(f, `parts file ${i}`);
    need(file.schema === "realistic-estimated-parts/2", `parts file ${i} isn't a realistic-estimated-parts/2 file; rerun scripts/realistic-estimated-parts.ts`);
    need(typeof file.summarySha256 === "string" && /^[0-9a-f]{64}$/.test(file.summarySha256), `parts file ${i} has no summarySha256`);
    const sha = String(file.summarySha256);
    const parts: SummaryParts = { rows: new Map(), held: new Map() };
    for (const r of list(file.rows, `parts file ${i}.rows`).map((x) => record(x, `parts file ${i} row`))) {
      need(!parts.rows.has(keyOf(r)), `parts file ${i} has ${keyOf(r)} twice`);
      parts.rows.set(keyOf(r), { total: totalOf(r.totalPerCompletedUSD), usd: Number(r.estimatedPerCompletedUSD), labels: list(r.estimatedLabels, "estimatedLabels").map(String) });
    }
    for (const h of list(file.heldOpen, `parts file ${i}.heldOpen`).map((x) => record(x, `parts file ${i} held`))) {
      const key = `${String(h.provider)}/${String(h.idle)}`;
      need(!parts.held.has(key), `parts file ${i} has held-open ${key} twice`);
      parts.held.set(key, { total: totalOf(h.medianTotalUSD), usd: Number(h.medianEstimatedUSD), labels: list(h.estimatedLabels, "estimatedLabels").map(String) });
    }
    const text = JSON.stringify(f);
    const seen = out.get(sha);
    need(seen === undefined || seen.text === text, `two different parts files claim summary ${sha.slice(0, 12)}; keep the one built from that summary`);
    out.set(sha, { parts, text });
  }
  return new Map([...out].map(([sha, v]) => [sha, v.parts]));
}

const partOf = (p: { usd: number; labels: string[] } | undefined) => (p && p.usd > 0 ? { usd: sig(p.usd), labels: p.labels } : null);

/**
 * The bound the harness puts on the whole-machine column ("lower" for Modal's
 * default track, which prices only its 0.125 CPU request). A summary made
 * before the harness wrote it has none, and that reads as exact.
 */
function wholeMachineBoundOf(r: Json, where: string) {
  const b = r.wholeMachineBound;
  if (b === undefined || b === null) return "exact";
  need(b === "exact" || b === "lower", `${where}.wholeMachineBound must be "exact" or "lower", not ${JSON.stringify(b)}`);
  return b;
}

function rowFrom(raw: unknown, where: string, prepare: PrepareFailure | null, parts: SummaryParts) {
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
    cost:
      usd === null || kind === null || kind === undefined
        ? null
        : {
            kind,
            usdPerCompleted: sig(usd),
            wholeMachineUsdPerCompleted: sig(numOrNull(r.wholeMachinePerCompletedUSD, `${where}.wholeMachinePerCompletedUSD`)),
            wholeMachineBound: wholeMachineBoundOf(r, where),
          },
    costNote: typeof r.costNote === "string" ? r.costNote : null,
    estimatedPart: estimatedFor(r, where, usd, parts),
    eligible: eligibility === "eligible",
    flags: flagsOf(eligibility),
  };
}

/**
 * A costed row's estimated part. Every costed row needs an entry whose
 * recomputed total matches the summary's, so the parts belong to the
 * published numbers; an estimate is all estimate and carries none.
 */
function estimatedFor(r: Json, where: string, usd: number | null, parts: SummaryParts) {
  const p = parts.rows.get(keyOf(r));
  need(p !== undefined, `${where}: no estimated-parts entry for ${keyOf(r)} in this summary's parts file`);
  need(p !== undefined && sameTotal(p.total, usd), `${where}: the parts file's total for ${keyOf(r)} doesn't match the summary`);
  // A row with no cost still needs its entry, with no total, so a missing or altered entry is caught too.
  if (usd === null) return null;
  return r.costKind === "estimate" ? null : partOf(p);
}

function heldFrom(raw: unknown, where: string, parts: SummaryParts) {
  const h = record(raw, where);
  const key = `${String(h.provider)}/${String(h.idle)}`;
  const p = parts.held.get(key);
  need(p !== undefined, `${where}: no estimated-parts entry for held-open ${key} in this summary's parts file`);
  need(p !== undefined && sameTotal(p.total, numOrNull(h.medianCostUSD, `${where}.medianCostUSD`)), `${where}: the parts file's median for held-open ${key} doesn't match the summary`);
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
    estimatedPart: h.costKind === "estimate" ? null : partOf(p),
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

/**
 * The summary's own picks against the site's rule on the same rows. Every
 * workload and track in the coverage needs one. Throws on the first gap or difference.
 */
export function checkPicks(name: string, picks: readonly unknown[], data: Pick<RealisticData, "rows">, coverage: Coverage) {
  for (const profile of coverage.headline.profiles)
    for (const track of coverage.headline.tracks)
      need(
        picks.some((p) => isObj(p) && p.profile === profile && p.track === track),
        `${name} has no pick for ${profile} / ${track}; a summary must carry every workload and track's pick`,
      );
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
  /** SHA-256 of the summary.json bytes, matched against each parts file's summarySha256. */
  sha256: string;
}

/**
 * The site's data from summaries in order, a later one replacing each
 * provider it contains, with setup failures from attempts and footprints
 * from the manifest. Pure: the CLI below does the file reading.
 */
export function buildRealistic({
  summaries,
  coverage: rawCoverage,
  attempts = [],
  parts: rawParts,
  manifest = null,
  generatedAt,
}: {
  summaries: readonly SummaryInput[];
  /** scripts/realistic-coverage.json: what a complete data set holds. */
  coverage: unknown;
  attempts?: readonly string[];
  /** scripts/realistic-estimated-parts.ts output for these summaries' runs; required, so no cost loses its estimated-part mark. */
  parts: readonly unknown[];
  manifest?: unknown;
  generatedAt: string;
}): RealisticData {
  need(summaries.length > 0, "give at least one --summary");
  const coverage = parseCoverage(rawCoverage, "coverage file");
  need(rawParts.length > 0, "give at least one --parts file from scripts/realistic-estimated-parts.ts");
  const partsFiles = partsByDigest(rawParts);
  let rows: unknown[] = [];
  let held: unknown[] = [];
  let fx: Json | null = null;
  const sources: { name: string; generatedAt: string; providers: unknown[] }[] = [];
  for (const { name, raw, sha256 } of summaries) {
    const s = record(raw, name);
    // Refuse a duplicate before anything is looked up, so the error names the duplicate.
    for (const [what, items, key] of [
      ["rows", list(s.rows ?? [], `${name}.rows`), (x: Json) => keyOf(x)],
      ["heldOpen", list(s.heldOpen ?? [], `${name}.heldOpen`), (x: Json) => `${String(x.provider)}/${String(x.idle)}`],
    ] as const) {
      const seen = new Set<string>();
      for (const item of items.filter(isObj)) {
        need(!seen.has(key(item)), `${name}: realistic data: ${what} has ${key(item)} twice`);
        seen.add(key(item));
      }
    }
    const parts = partsFiles.get(sha256);
    need(parts !== undefined, `${name}: no --parts file was built from this summary (sha256 ${sha256.slice(0, 12)}); run scripts/realistic-estimated-parts.ts on it`);
    if (!parts) continue;
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
      return rowFrom(r, `${name}.rows[${i}]`, prepared && failedRuns > 0 ? prepared : null, parts);
    });
    const ownHeld = list(s.heldOpen ?? [], `${name}.heldOpen`).map((h, i) => heldFrom(h, `${name}.heldOpen[${i}]`, parts));
    need(own.length > 0, `${name} has no rows`);
    // Each row and held-open entry once: a duplicate would win a lookup silently, so the summary is refused before any merge.
    const parsed = (() => {
      try {
        return parseParts(own, ownHeld);
      } catch (e) {
        throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    const providers = [...new Set([...parsed.rows, ...parsed.heldOpen].map((r) => r.provider))];
    // Every provider this summary would replace must be complete in it, so a partial file can't drop rows.
    for (const id of providers) {
      need(coverage.headline.providers.includes(id), `${name} has ${id}, which isn't in the coverage file; add it there first`);
      const gaps = providerGaps(coverage, id, parsed.rows, parsed.heldOpen);
      need(gaps.length === 0, `${name} is incomplete for ${id}, so nothing was replaced: ${gaps.join("; ")}`);
    }
    // Check this summary's picks on its own rows before merging, so each file is checked against itself.
    checkPicks(name, list(s.picks ?? [], `${name}.picks`), parsed, coverage);
    rows = [...rows.filter((r) => isObj(r) && !providers.some((id) => id === r.provider)), ...own];
    held = [...held.filter((h) => isObj(h) && !providers.some((id) => id === h.provider)), ...ownHeld];
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
      coverage,
      sources,
      fx: fx ? { eurToUsd: fx.eurToUsd, date: fx.date } : null,
      workloads: manifest === null ? null : workloadsFrom(manifest),
      rows: [...rows].sort((a, b) => order(a).localeCompare(order(b))),
      heldOpen: [...held].sort((a, b) => heldOrder(a).localeCompare(heldOrder(b))),
    }),
  );
}

function fileOf(parts: { generatedAt: string; coverage: Coverage; sources: unknown; fx: unknown; workloads: unknown; rows: unknown; heldOpen: unknown }) {
  return { schema: SCHEMA, ...parts };
}

// Re-exported for tests that build fixtures in the site's types.
export type { HeldOpen, ProviderId, RealisticRow, RunTrack };

function main(argv: readonly string[]) {
  const take = (flag: string) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1] ?? ""] : []));
  const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
  const summaries = take("--summary").map((p) => {
    const bytes = readFileSync(p);
    const raw: unknown = JSON.parse(bytes.toString("utf8"));
    return { name: sourceName(resolve(p)), raw, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const attempts = take("--attempts").flatMap((p) => readFileSync(p, "utf8").split("\n"));
  const parts = take("--parts").map(readJson);
  const [manifestPath] = take("--manifest");
  const [coveragePath = resolve(import.meta.dirname, "realistic-coverage.json")] = take("--coverage");
  const [outPath = resolve(import.meta.dirname, "../src/data/realistic.json")] = take("--out");
  const data = buildRealistic({
    summaries,
    coverage: readJson(coveragePath),
    attempts,
    parts,
    manifest: manifestPath ? readJson(manifestPath) : null,
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`);
  const providers = new Set(data.rows.map((r) => r.provider));
  process.stdout.write(`wrote ${outPath}: ${data.rows.length} rows, ${data.heldOpen.length} held-open entries, ${providers.size} providers (${[...providers].join(", ")}) from ${data.sources.map((s) => s.name).join(" + ")}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
