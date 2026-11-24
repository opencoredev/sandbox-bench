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
 *     --out src/data/fairness.json
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
  let out: string | undefined;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--report") reports.push(value);
    else if (flag === "--out") out = value;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (reports.length === 0 || !out) throw new Error("usage: --report FILE [--report FILE]... --out FILE");
  return { reports, out };
}

/** A reason on one line, at most 240 characters. */
export function plainReason(reason: string): string {
  const first = reason.replace(/\s+/g, " ").trim();
  return first.length > 240 ? `${first.slice(0, 239)}…` : first;
}

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
    notComparableWhy: r.notComparableWhy,
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
    notComparableWhy: r.notComparableWhy,
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

const convert: Record<CheckId, (r: Json) => Json> = {
  "cpu-native": cpuNative,
  "disk-real": diskReal,
  "cpu-burst-10": cpuBurst,
  "memory-honesty": memoryHonesty,
  "security-probe": securityProbe,
};

/** One harness report (`fairness.v1`) to the site's check: run plus one entry per provider. */
export function checkFromReport(report: unknown): { check: CheckId; data: Json } {
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
    if (status === "completed") return { provider: e.provider, machine, status, reason: null, result: convert[check](obj(e.result, `${String(e.provider)} result`)) };
    return { provider: e.provider, machine, status, reason: plainReason(String(e.reason ?? "No reason recorded")), result: null };
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
    r.notComparableWhy = `${before}${gvisorDiskWhy}`;
  }
}

function main() {
  const { reports, out } = args();
  const checks: Json = {};
  for (const path of reports) {
    const { check, data } = checkFromReport(JSON.parse(readFileSync(path, "utf8")));
    if (check in checks) throw new Error(`two reports for ${check}`);
    checks[check] = data;
  }
  markGvisorDisk(checks);
  const file = { schema: SCHEMA, generatedAt: new Date().toISOString(), track: "same-machine", arch: archFrom(checks), checks };
  // The site's own parser, so this never writes a file the build would refuse.
  parseFairness(file);
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`Wrote ${out}: ${Object.keys(checks).join(", ")}\n`);
}

if (import.meta.main) main();
