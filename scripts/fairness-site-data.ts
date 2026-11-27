/**
 * Builds src/data/fairness.json, the like-for-like checks, from the harness's
 * reports (`bun bench fairness <check>` in sandbox-sdk, one `<check>.json` per
 * check). Never edit the JSON by hand: change the inputs or the rules here and
 * run this again.
 *
 *   bun scripts/fairness-site-data.ts \
 *     --report ~/agents/fairness-bench/runs/<run>/cpu-native/cpu-native.json \
 *     --report .../disk-real.json --report .../cpu-burst-10.json \
 *     --report .../memory-honesty.json --report .../security-probe.json \
 *     --report .../state-survival.json --report .../memory-pressure.json \
 *     --add ~/agents/fairness-bench/runs/maritime/<check>/<check>.json ... \
 *     --out src/data/fairness.json
 *
 * The published file: --report r4's security-probe, memory-honesty and
 * disk-real (sandbox-sdk c6163c6) and r6's cpu-native and cpu-burst-10
 * (072122c), then --add Maritime's own run of all five (Nov 24, 27f304a,
 * the same runner code as 072122c), then --add Archil's own run of all five
 * (Nov 26, 28ac0a4) from
 * ~/agents/rerun-archil-20261126/fairness/<check>/<check>.json, then --report
 * the full Nov 26 runs of state-survival (2b2acec) from
 * ~/agents/new-scenarios/full/state2/state-survival.json and memory-pressure
 * (33b875f) from ~/agents/new-scenarios/full/mem/memory-pressure.json, then
 * --add Archil's own run of both (Nov 26, 2b2acec) from
 * ~/agents/new-scenarios/full/state-archil/state-survival.json and
 * ~/agents/new-scenarios/full/mem-archil/memory-pressure.json, with
 * Baseten and Superserve not run, and Baseten, Superserve and Boat listed as
 * not run in the two new checks, whose reports don't include them:
 *
 *     --not-run baseten="our API key was rejected" \
 *     --not-run superserve="our account wasn't eligible for billing (HTTP 402)" \
 *     --not-run-in state-survival:baseten="our API key was rejected" \
 *     --not-run-in memory-pressure:baseten="our API key was rejected" \
 *     --not-run-in state-survival:superserve="our account wasn't eligible for billing (HTTP 402)" \
 *     --not-run-in memory-pressure:superserve="our account wasn't eligible for billing (HTTP 402)" \
 *     --not-run-in state-survival:boat="our Boat account was busy with another benchmark run" \
 *     --not-run-in memory-pressure:boat="our Boat account was busy with another benchmark run"
 *
 * What it changes on the way:
 * - Each provider keeps only the figures the page and the agent files use;
 *   the raw output stays in the harness's report.
 * - A sandbox ID, a directory under /home or a seed never reaches the site.
 * - Reasons have their whitespace collapsed and are cut to 240 characters.
 * - A disk result under gVisor (from the security probe's isolation) is not comparable: gVisor's
 *   own file layer handles direct I/O and sync, and its root overlay may be held in memory, so the
 *   guest cannot see past it. The reason is appended to the harness's own.
 * - Each provider's CPU architecture comes from the security probe's kernel line.
 * - A provider must appear once per report; a report from another track, or
 *   one with a provider the site doesn't know, stops the build.
 * - --add FILE appends the providers of a later run of one check, each with
 *   that run's id, SDK commit and start as its `run`, so the section can say
 *   it ran apart. A check with no --report, or a provider already in it, stops it.
 * - --not-run provider="why" marks that provider's entries that didn't complete
 *   as not run, with that why: they never started for a reason on our side (a
 *   rejected key, our account's billing), so they never read as the provider's
 *   failure. A completed entry for it, an entry whose report lists a created
 *   sandbox (or no sandboxes field), or none that failed, stops it, and so does
 *   a failure that reads as ours (see ourSide) without --not-run. These errors
 *   never echo the raw reason; it stays in the source report.
 * - --not-run-in check:provider="why" adds a not-run entry for a provider that
 *   has none in that check, with that why and the machine its other checks
 *   asked for, so a provider we didn't run there is listed, never missing. A
 *   provider already in the check, or one with no machine in any other check,
 *   stops it.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { checkIds, parseFairness, SCHEMA } from "../src/lib/fairness";
import type { CheckId } from "../src/lib/fairness";

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
const numOrNull = (v: unknown, what: string): number | null => (v === null ? null : num(v, what));

function args() {
  const reports: string[] = [];
  const adds: string[] = [];
  const notRun = new Map<string, string>();
  const notRunIn: { check: CheckId; provider: string; why: string }[] = [];
  let out: string | undefined;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--report") reports.push(value);
    else if (flag === "--add") adds.push(value);
    else if (flag === "--out") out = value;
    else if (flag === "--not-run") {
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--not-run takes provider=why");
      notRun.set(value.slice(0, eq), value.slice(eq + 1));
    } else if (flag === "--not-run-in") {
      const match = /^([a-z0-9-]+):([a-z0-9-]+)=(.+)$/.exec(value);
      const check = checkIds.find((id) => id === match?.[1]);
      if (!match || !check) throw new Error('--not-run-in takes check:provider="why" with a known check');
      notRunIn.push({ check, provider: match[2] ?? "", why: match[3] ?? "" });
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (reports.length === 0 || !out) throw new Error('usage: --report FILE [--report FILE]... [--add FILE]... [--not-run provider="why"]... [--not-run-in check:provider="why"]... --out FILE');
  return { reports, adds, notRun, notRunIn, out };
}

/**
 * Report text bound for the site, with anything private taken out: paths under a home directory or
 * /tmp, UUIDs, long hex or base64 IDs (sandbox, attempt and boot IDs), sandbox-style names, and
 * long numbers such as seeds. Then one line, at most 240 characters.
 */
export function scrub(text: string): string {
  return text
    .replace(/\/(?:home|Users|root|tmp)\/[^\s'",;)]*/g, "<path>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b(?:sb|vm|bx|m|sdk|sandbox)[-_][A-Za-z0-9_-]{6,}\b/g, "<id>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<id>")
    .replace(/\b[A-Za-z0-9]{20,}\b/g, "<id>")
    .replace(/\b\d{7,}\b/g, "<n>");
}

/** A reason on one line, scrubbed, at most 240 characters. */
export function plainReason(reason: string): string {
  const first = scrub(reason).replace(/\s+/g, " ").trim();
  return first.length > 240 ? `${first.slice(0, 239)}…` : first;
}

/**
 * Whether a harness failure reads as a problem on our side rather than the provider's: a key the
 * provider rejected (or none), our account's billing, or a provider the runner skipped. Such a run
 * must be published as not run, with --not-run.
 */
export const ourSide = (reason: string) => /credentials are missing or were rejected|\bHTTP 40[123]\b|billing_ineligible|^Skipped:/i.test(reason);

const round = (v: number, places: number) => Number(v.toFixed(places));

function cpuNative(r: Json) {
  const single = obj(r.single, "single");
  const allCore = obj(r.allCore, "allCore");
  const sustained = obj(r.sustained, "sustained");
  const singleOps = num(single.medianOps, "single.medianOps");
  const allCoreOps = num(allCore.medianOps, "allCore.medianOps");
  const first = num(sustained.first3MinOps, "sustained.first3MinOps");
  const last = num(sustained.last3MinOps, "sustained.last3MinOps");
  return {
    cpuModel: r.cpuModel ?? null,
    guestVcpus: r.guestVcpus ?? null,
    singleOps,
    allCoreOps,
    scaling: round(allCoreOps / (4 * singleOps), 4),
    first3MinOps: first,
    last3MinOps: last,
    retention: round(last / first, 4),
    sustained: list(sustained.segments, "sustained.segments").map((s, i) => {
      const x = obj(s, `sustained.segments[${i}]`);
      return { minute: num(x.minute, "minute"), opsPerS: num(x.opsPerSec, "opsPerSec") };
    }),
  };
}

/** Directories under a user's home are shown as `~`, so no account name reaches the site. */
const directory = (dir: string) => dir.replace(/^\/home\/[^/]+/, "~");

function diskReal(r: Json) {
  return {
    fsType: r.fsType,
    memoryBacked: r.memoryBacked,
    comparable: r.comparable,
    notComparableWhy: typeof r.notComparableWhy === "string" ? plainReason(directory(r.notComparableWhy)) : null,
    directory: directory(String(r.directory)),
    sizeMiB: r.sizeMiB,
    seqWriteMiBps: r.seqWriteMiBps,
    seqReadMiBps: r.seqReadMiBps,
    randWriteIops: r.randWriteIops,
    randWriteP99Us: r.randWriteP99Us,
    randReadIops: r.randReadIops,
    randReadP99Us: r.randReadP99Us,
    direct: { seqWrite: r.seqWriteDirect, seqRead: r.seqReadDirect, randWrite: r.randWriteDirect, randRead: r.randReadDirect },
  };
}

function cpuBurst(r: Json) {
  return {
    requested: r.requested,
    created: r.created,
    createErrors: list(r.createErrors, "createErrors").map((e) => {
      const x = obj(e, "createErrors[]");
      return { error: plainReason(String(x.error)), count: x.count };
    }),
    soloOps: r.soloOps,
    medianOps: r.medianOps,
    relativeToSolo: r.relativeToSolo,
    spread: r.spread,
    verified: r.verified,
    guaranteedOverlapS: r.guaranteedOverlapS,
    comparable: r.comparable,
    notComparableWhy: typeof r.notComparableWhy === "string" ? plainReason(r.notComparableWhy) : null,
    distinctBootIds: r.distinctBootIds,
  };
}

function memoryHonesty(r: Json) {
  const limits = obj(r.limits, "limits");
  const outcome = obj(r.outcome, "outcome");
  const kind = outcome.kind;
  return {
    visibleCpus: r.visibleCpus,
    usableCpus: r.usableCpus,
    quotaCpus: limits.quotaCpus,
    cpusOverReported: r.cpusOverReported,
    memTotalGiB: limits.memTotalGiB,
    memLimitGiB: limits.memLimitGiB,
    swapTotalGiB: limits.swapTotalGiB ?? 0,
    memoryMiB: r.memoryMiB,
    fileMiB: r.fileMiB,
    outcome:
      kind === "completed"
        ? {
            kind,
            fillGiBps: outcome.fillGiBps,
            verifyGiBps: outcome.verifyGiBps,
            fileMiBps: outcome.fileMiBps,
            swapUsedMiB: round(num(outcome.swapUsedKiB, "swapUsedKiB") / 1024, 1),
          }
        : kind === "file-failed"
          ? { kind, errno: outcome.errno, writtenMiB: outcome.writtenMiB, swapUsedMiB: round(num(outcome.swapUsedKiB, "swapUsedKiB") / 1024, 1) }
          : kind === "killed"
          ? { kind, lastPhase: outcome.lastPhase, exitCode: outcome.exitCode, oomKills: outcome.oomKills }
          : kind === "refused"
            ? { kind, errno: outcome.errno }
            : { kind, lastPhase: outcome.lastPhase },
  };
}

function stateSurvival(r: Json) {
  const restart = obj(r.restart, "restart");
  const s = obj(r.suspend, "suspend");
  return {
    restart: {
      medianMs: numOrNull(restart.medianMs, "restart.medianMs"),
      samplesMs: list(restart.samplesMs, "restart.samplesMs").map((v) => num(v, "restart.samplesMs[]")),
      failures: restart.failures,
      startsOnly: restart.startsOnly,
    },
    suspend:
      s.kind === "measured"
        ? {
            kind: s.kind,
            verdict: s.verdict,
            reason: typeof s.reason === "string" ? plainReason(s.reason) : null,
            holdMs: s.holdMs,
            pauseMs: s.pauseMs,
            resumeMs: s.resumeMs,
            firstCommandMs: s.firstCommandMs,
            servingMs: s.servingMs,
            serverRestarted: s.serverRestarted,
            coldServeMs: s.coldServeMs,
            bootSame: s.bootSame,
          }
        : s.kind === "failed"
          ? { kind: s.kind, stage: s.stage, error: plainReason(String(s.error)) }
          : { kind: s.kind },
  };
}

function memoryPressure(r: Json) {
  const outcome = obj(r.outcome, "outcome");
  const kind = outcome.kind;
  const limits = obj(r.limits, "limits");
  return {
    advertisedMiB: r.advertisedMiB,
    targetMiB: r.targetMiB,
    reached: r.reachedEvidence === "none" ? null : { evidence: r.reachedEvidence, mib: r.reachedMiB, fraction: r.reachedFraction },
    outcome: kind === "refused" || kind === "inconclusive" ? { kind, reason: plainReason(String(outcome.reason)) } : { kind },
    scope: r.scope,
    usableAfter: r.usableAfter,
    swapTotalGiB: limits.swapTotalGiB ?? null,
  };
}

function securityProbe(r: Json) {
  const isolation = obj(r.isolation, "isolation");
  const cpu = obj(r.cpu, "cpu");
  const vulnerabilities = list(r.vulnerabilities, "vulnerabilities").map((v) => obj(v, "vulnerabilities[]"));
  return {
    isolation: isolation.kind,
    evidence: isolation.evidence,
    insideVm: isolation.insideVm,
    kernel: r.kernel,
    cpu: { vendor: cpu.vendor, family: cpu.family, model: cpu.model, modelName: cpu.modelName, mhz: cpu.mhz },
    weakeningFlags: r.weakeningFlags,
    notableFlags: r.notableFlags,
    vulnerable: vulnerabilities.filter((v) => /^Vulnerable/i.test(String(v.status))).map((v) => ({ name: v.name, status: v.status })),
    vulnerabilityFiles: vulnerabilities.length,
    uid: r.uid,
    passwordlessSudo: r.passwordlessSudo,
    createS: r.createS,
    uptimeS: numOrNull(r.uptimeAtFirstCommandS, "uptimeAtFirstCommandS"),
    bootedBeforeCreateS: numOrNull(r.bootedBeforeCreateS, "bootedBeforeCreateS"),
  };
}

/** Every string inside a converted result, scrubbed: CPU names, evidence, directories, reasons. */
export function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (isJson(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)]));
  return value;
}

const convert: Record<CheckId, (r: Json) => Json> = {
  "cpu-native": cpuNative,
  "disk-real": diskReal,
  "cpu-burst-10": cpuBurst,
  "memory-honesty": memoryHonesty,
  "security-probe": securityProbe,
  "state-survival": stateSurvival,
  "memory-pressure": memoryPressure,
};

/**
 * One harness report (`fairness.v1`) to the site's check: run plus one entry per provider. A
 * provider in `notRun` that didn't complete is not run, with its why.
 */
export function checkFromReport(report: unknown, notRun: ReadonlyMap<string, string> = new Map()): { check: CheckId; data: Json } {
  const o = obj(report, "report");
  if (o.schema !== "fairness.v1") throw new Error(`report schema must be fairness.v1, not ${String(o.schema)}`);
  if (o.track !== "same-machine") throw new Error("report track must be same-machine");
  const check = checkIds.find((id) => id === o.check);
  if (!check) throw new Error(`unknown check ${String(o.check)}`);
  const run = obj(o.run, "run");
  const entries = list(o.providers, "providers").map((p) => {
    const e = obj(p, "providers[]");
    const status = e.status;
    const machine = e.machine;
    const why = notRun.get(String(e.provider));
    if (status === "completed") {
      if (why !== undefined) throw new Error(`--not-run ${String(e.provider)}: it completed ${check}`);
      return { provider: e.provider, machine, status, reason: null, result: scrubDeep(convert[check](obj(e.result, `${String(e.provider)} result`))) };
    }
    if (why !== undefined) {
      if (!Array.isArray(e.sandboxes)) throw new Error(`--not-run ${String(e.provider)}: ${check}.sandboxes is missing, so it can't show that no sandbox was created`);
      if (e.sandboxes.length > 0) throw new Error(`--not-run ${String(e.provider)}: ${check}.sandboxes lists ${e.sandboxes.length} created, so it ran`);
      return { provider: e.provider, machine, status: "not-run", reason: why, result: null };
    }
    const reason = String(e.reason ?? "No reason recorded");
    if (ourSide(reason)) throw new Error(`${String(e.provider)} in ${check}: its reason reads as a problem on our side; mark it --not-run ${String(e.provider)}="why" (the raw reason is in the source report)`);
    return { provider: e.provider, machine, status, reason: plainReason(reason), result: null };
  });
  return { check, data: { run: { id: run.id, sdkCommit: run.sdkCommit, startedAt: run.startedAt }, entries } };
}

/** Each provider's architecture from the security probe's kernel line ("Linux 6.1 x86_64"). */
export function archFrom(checks: Json): Json {
  const probe = checks["security-probe"];
  if (!isJson(probe)) return {};
  const out: Json = {};
  for (const e of list(probe.entries, "security-probe entries")) {
    const entry = obj(e, "entry");
    const result = entry.result;
    if (!isJson(result) || typeof result.kernel !== "string") continue;
    const machine = result.kernel.trim().split(/\s+/).at(-1);
    if (machine === "x86_64" || machine === "aarch64") out[String(entry.provider)] = machine;
  }
  return out;
}

export const gvisorDiskWhy = "the sandbox runs under gVisor, whose own file layer handles direct I/O and sync (and may keep its root overlay in memory), so the guest can't measure the disk beneath it";

/** Marks disk entries of gVisor providers not comparable, using the security probe's isolation. */
export function markGvisorDisk(checks: Json) {
  const probe = checks["security-probe"];
  const disk = checks["disk-real"];
  if (!isJson(probe) || !isJson(disk)) return;
  const gvisor = new Set(
    list(probe.entries, "security-probe entries").flatMap((e) => {
      const entry = obj(e, "entry");
      return isJson(entry.result) && entry.result.isolation === "gvisor" ? [String(entry.provider)] : [];
    }),
  );
  for (const e of list(disk.entries, "disk entries")) {
    const entry = obj(e, "entry");
    if (!gvisor.has(String(entry.provider)) || !isJson(entry.result)) continue;
    const r = entry.result;
    const before = typeof r.notComparableWhy === "string" ? `${r.notComparableWhy}; ` : "";
    r.comparable = false;
    r.notComparableWhy = plainReason(`${before}${gvisorDiskWhy}`);
  }
}

/** Lists a provider that has no entry in a check as not run there, with the machine its other checks asked for. */
export function addNotRun(checks: Json, at: { check: CheckId; provider: string; why: string }) {
  const into = checks[at.check];
  if (!isJson(into)) throw new Error(`--not-run-in ${at.check}:${at.provider}: no --report for ${at.check}`);
  const entries = list(into.entries, `${at.check} entries`).map((e) => obj(e, "entry"));
  if (entries.some((e) => e.provider === at.provider)) throw new Error(`--not-run-in ${at.check}:${at.provider}: ${at.provider} is already in ${at.check}`);
  const machine = Object.values(checks)
    .flatMap((c) => list(obj(c, "check").entries, "entries").map((e) => obj(e, "entry")))
    .find((e) => e.provider === at.provider)?.machine;
  if (machine === undefined) throw new Error(`--not-run-in ${at.check}:${at.provider}: no other check names its machine`);
  into.entries = [...entries, { provider: at.provider, machine, status: "not-run", reason: plainReason(at.why), result: null }];
}

/** Appends a later run's providers to a check already built, each carrying that run. */
export function addLaterRun(checks: Json, later: { check: CheckId; data: Json }, path: string) {
  const into = checks[later.check];
  if (!isJson(into)) throw new Error(`${path}: no --report for ${later.check} to add to`);
  const entries = list(into.entries, `${later.check} entries`);
  const have = new Set(entries.map((e) => obj(e, "entry").provider));
  const added = list(later.data.entries, `${path} entries`).map((e) => {
    const entry = obj(e, `${path} entry`);
    if (have.has(entry.provider)) throw new Error(`${path}: ${String(entry.provider)} is already in ${later.check}`);
    return { ...entry, run: later.data.run };
  });
  into.entries = [...entries, ...added];
}

function main() {
  const { reports, adds, notRun, notRunIn, out } = args();
  const checks: Json = {};
  for (const path of reports) {
    const { check, data } = checkFromReport(JSON.parse(readFileSync(path, "utf8")), notRun);
    if (check in checks) throw new Error(`two reports for ${check}`);
    checks[check] = data;
  }
  for (const path of adds) addLaterRun(checks, checkFromReport(JSON.parse(readFileSync(path, "utf8")), notRun), path);
  const marked = new Set(Object.values(checks).flatMap((c) => list(obj(c, "check").entries, "entries").map((e) => obj(e, "entry")).filter((e) => e.status === "not-run").map((e) => String(e.provider))));
  const unused = [...notRun.keys()].filter((id) => !marked.has(id));
  if (unused.length) throw new Error(`--not-run names providers with no entry that failed: ${unused.join(", ")}`);
  for (const at of notRunIn) addNotRun(checks, at);
  markGvisorDisk(checks);
  const file = { schema: SCHEMA, generatedAt: new Date().toISOString(), track: "same-machine", arch: archFrom(checks), checks };
  // The site's own parser, so this never writes a file the build would refuse.
  parseFairness(file);
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`Wrote ${out}: ${Object.keys(checks).join(", ")}\n`);
}

if (import.meta.main) main();
