/**
 * Which part of each realistic cost is our estimate rather than the
 * provider's charge, computed with the harness's own cost code, so the site
 * can mark it. The harness's summary.json gives each total but not its parts:
 * where a provider's billing source leaves disk out (Upstash Box), the harness
 * adds disk at list price as an estimated part (bench/src/cost/columns.ts).
 *
 * Read-only: it imports the harness at --harness and reads the same run
 * folders and drop rules the summary was built from, then writes one JSON file
 * for scripts/realistic-site-data.ts (--parts). It stops unless every total it
 * computes matches the summary's, so the parts belong to the published numbers.
 *
 *   bun scripts/realistic-estimated-parts.ts \
 *     --harness ~/agents/sbx103/sandbox-sdk/bench \
 *     --summary ~/agents/realistic-workloads/provider-runs/sbx103-vercel/merged/summary.json \
 *     --run-dir <each --out the summary command read> ... \
 *     --out scripts/realistic-parts/sbx103-vercel.json
 *
 * The run folders are the summary command's inputs; for sbx103-vercel/merged
 * they are sbx100-headline, sbx100-boat, sbx100-daytona-makeup,
 * sbx99-held-open2, sbx99-held-open-boat, sbx103-vercel/headline and
 * sbx103-vercel/held-open. The drop rules come from summary.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export const PARTS_SCHEMA = "realistic-estimated-parts/1";

/** A cost part as the harness reports it. */
export interface Part {
  label: string;
  usd: number;
  estimated: boolean;
}

/** One attempt's reported cost, reduced to what this script needs. */
export type AttemptCost = { kind: "billed" | "metered" | "estimate"; usd: number; parts: readonly Part[] } | { kind: "nothing-created"; usd: 0 } | { kind: "unavailable" };

export interface PartsRow {
  provider: string;
  profile: string;
  track: string;
  variant: string;
  totalPerCompletedUSD: number | null;
  /** The estimated parts of a billed or metered cost, per completed task; an estimate is all estimate, so it carries none here. */
  estimatedPerCompletedUSD: number;
  estimatedLabels: string[];
}

export interface PartsHeld {
  provider: string;
  idle: string;
  /** Median over the runs of each run's estimated part, beside the harness's median total. */
  medianEstimatedUSD: number;
  estimatedLabels: string[];
}

export interface PartsFile {
  schema: typeof PARTS_SCHEMA;
  harness: { commit: string };
  rows: PartsRow[];
  heldOpen: PartsHeld[];
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

const estimatedOf = (c: AttemptCost) => (c.kind === "billed" || c.kind === "metered" ? c.parts.filter((p) => p.estimated) : []);

/**
 * Per group of attempts (the harness's own grouping: headline, or the idle
 * slot), the total and its estimated part per completed task, in the
 * harness's arithmetic: every counted attempt's cost over completed attempts.
 */
export function partsFor(groups: ReadonlyMap<string, { counted: readonly AttemptCost[]; completed: number }>): PartsRow[] {
  return [...groups].map(([key, g]) => {
    const [variant = "", profile = "", track = "", provider = ""] = key.split("|");
    const priced = g.counted.every((c) => c.kind !== "unavailable");
    const total = priced && g.completed > 0 ? g.counted.reduce((s, c) => s + (c.kind === "unavailable" ? 0 : c.usd), 0) / g.completed : null;
    const est = g.counted.flatMap(estimatedOf);
    const estimated = g.completed > 0 ? est.reduce((s, p) => s + p.usd, 0) / g.completed : 0;
    return { provider, profile, track, variant, totalPerCompletedUSD: total, estimatedPerCompletedUSD: estimated, estimatedLabels: [...new Set(est.filter((p) => p.usd > 0).map((p) => p.label))] };
  });
}

/** Stops unless every total matches the summary's to a millionth of a cent. */
export function checkAgainstSummary(rows: readonly PartsRow[], summaryRows: readonly { provider: string; profile: string; track: string; variant: string; costPerCompletedUSD: number | null }[]) {
  for (const s of summaryRows) {
    const r = rows.find((x) => x.provider === s.provider && x.profile === s.profile && x.track === s.track && x.variant === s.variant);
    if (!r) throw new Error(`no attempts for ${s.provider} ${s.profile} / ${s.track} / ${s.variant}; pass every run folder the summary read`);
    const a = r.totalPerCompletedUSD;
    const b = s.costPerCompletedUSD;
    if ((a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > 1e-9))
      throw new Error(`${s.provider} ${s.profile} / ${s.track} / ${s.variant}: recomputed total ${a} doesn't match the summary's ${b}; use the harness commit and run folders the summary was built from`);
  }
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

async function main(argv: readonly string[]) {
  const take = (flag: string) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1] ?? ""] : []));
  const [harness] = take("--harness");
  const [summaryPath] = take("--summary");
  const [out] = take("--out");
  const dirs = take("--run-dir");
  if (!harness || !summaryPath || !out || dirs.length === 0) throw new Error("needs --harness, --summary, --out and at least one --run-dir");
  const h = resolve(harness);
  const { attemptRecordSchema } = await import(join(h, "src/realistic/record.ts"));
  const { attemptBillingSchema, costedAttempts } = await import(join(h, "src/cost/attempt-input.ts"));
  const { billingRule } = await import(join(h, "src/cost/billing-rules.ts"));
  const { reportedCost } = await import(join(h, "src/cost/columns.ts"));

  const summary: unknown = JSON.parse(readFileSync(summaryPath, "utf8"));
  if (!isObj(summary) || !Array.isArray(summary.rows) || !isObj(summary.fx)) throw new Error("summary.json needs rows and fx");
  const drops = (Array.isArray(summary.dropRules) ? summary.dropRules : []).filter(isObj);
  const lines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "").map((l): unknown => JSON.parse(l)) : []);
  const records = dirs.flatMap((d) => lines(join(d, "attempts.jsonl")).map((r) => attemptRecordSchema.parse(r)));
  const bills = dirs.flatMap((d) => lines(join(d, "billing.jsonl")).map((b) => attemptBillingSchema.parse(b)));
  const dropped = (r: { provider: string; runId: string; track: string }) => drops.some((d) => d.provider === r.provider && d.runId === r.runId && (d.track === undefined || d.track === r.track));
  const kept = records.filter((r: { provider: string; runId: string; track: string }) => !dropped(r));
  const ids = new Set(kept.map((r: { attemptId: string }) => r.attemptId));
  const attempts: { record: { variant: string; slot: { id: string }; profile: string; track: string; provider: string }; outcome: string }[] = costedAttempts(
    kept,
    bills.filter((b: { attemptId: string }) => ids.has(b.attemptId)),
  );

  const fx = summary.fx;
  const groups = new Map<string, { counted: AttemptCost[]; completed: number }>();
  const held = new Map<string, AttemptCost[]>();
  for (const a of attempts) {
    const variant = a.record.variant === "headline" ? "headline" : a.record.slot.id;
    const rule = billingRule(a.record.provider, null);
    if (!rule) continue;
    const key = [variant, a.record.profile, a.record.track, a.record.provider].join("|");
    const g = groups.get(key) ?? { counted: [], completed: 0 };
    if (a.outcome !== "not-run") {
      const cost: AttemptCost = reportedCost({ attempt: a, rule, fx });
      g.counted.push(cost);
      if (a.outcome === "completed") g.completed += 1;
      if (variant !== "headline") held.set(`${a.record.provider}|${variant}`, [...(held.get(`${a.record.provider}|${variant}`) ?? []), cost]);
    }
    groups.set(key, g);
  }
  const rows = partsFor(groups);
  checkAgainstSummary(
    rows,
    summary.rows.filter(isObj).map((r) => ({ provider: String(r.provider), profile: String(r.profile), track: String(r.track), variant: String(r.variant), costPerCompletedUSD: typeof r.costPerCompletedUSD === "number" ? r.costPerCompletedUSD : null })),
  );
  const heldOpen: PartsHeld[] = [...held].map(([key, costs]) => {
    const [provider = "", idle = ""] = key.split("|");
    const est = costs.map((c) => estimatedOf(c).reduce((s, p) => s + p.usd, 0));
    return { provider, idle, medianEstimatedUSD: median(est), estimatedLabels: [...new Set(costs.flatMap(estimatedOf).filter((p) => p.usd > 0).map((p) => p.label))] };
  });
  const commit = execFileSync("git", ["-C", h, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const file: PartsFile = { schema: PARTS_SCHEMA, harness: { commit }, rows, heldOpen };
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  const withParts = rows.filter((r) => r.estimatedPerCompletedUSD > 0);
  process.stdout.write(`wrote ${out}: ${rows.length} groups, totals match the summary; estimated parts in ${withParts.map((r) => `${r.provider} ${r.profile}/${r.track}/${r.variant}`).join(", ") || "none"}\n`);
}

if (import.meta.main) await main(process.argv.slice(2));
