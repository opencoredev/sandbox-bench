import { formatShort, formatValue } from "@/lib/format";
import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * Like-for-like checks: seven tests that run the same code, the same way, on
 * every provider's 4 vCPU, 8 GB sandbox, so a result reflects the machine and
 * not the image, a cache, burst credit or what the sandbox reports about
 * itself. They are not there to catch anyone out: each removes one difference
 * that made earlier numbers less comparable.
 *
 * - cpu-native: one static x86_64 binary with no runtime, so CPU numbers no
 *   longer depend on each image's Python (3.11 to 3.14 across providers).
 * - disk-real: a 2 GiB file written and read with direct I/O past the guest's
 *   page cache, and synced 4 KB random I/O, with the filesystem type named.
 * - cpu-burst-10: ten sandboxes at once on one account, all burning together
 *   for 2 minutes, against one alone a minute earlier.
 * - memory-honesty: the CPUs and memory a sandbox shows against what its
 *   limits give it, and 6 GiB dirtied while a 2 GiB file is written.
 * - security-probe: read-only facts from a fresh sandbox: isolation layer,
 *   kernel flags, CPU vulnerabilities as the kernel reports them, the CPU,
 *   the user, and how long the guest had been up.
 * - state-survival: a server and a worker started detached, then paused for
 *   60 s and resumed, to see whether their memory and the files survived;
 *   and how fast a killed server starts again in the same sandbox.
 * - memory-pressure: one process allocates up to 1.5 times the advertised
 *   memory, and what stopped it, how far it got and what else it took down.
 *
 * This is the site's model of `src/data/fairness.json`, built by
 * scripts/fairness-site-data.ts from the harness's reports (`bun bench
 * fairness <check>` in sandbox-sdk), its parser (a malformed file stops the
 * build) and the rules the section and the agent files share.
 */

export const SCHEMA = "fairness-site.v2";

export const checkIds = ["cpu-native", "disk-real", "cpu-burst-10", "memory-honesty", "security-probe", "state-survival", "memory-pressure"] as const;
export type CheckId = (typeof checkIds)[number];

export interface FairnessRun {
  id: string;
  sdkCommit: string;
  startedAt: string;
}

/** The size a provider's same-machine sandbox asks for; `sameSize` is false when it is not 4 vCPU, 8 GiB (boxd's 16 GiB). */
export interface Machine {
  cpu: number;
  memoryGiB: number;
  sameSize: boolean;
}

/**
 * A provider's entry in one check: a result when it completed, why not otherwise. `run` is null
 * when it ran in the check's run, or the provider's own later run when it was added from one.
 * "not-run" never started for a reason on our side (a rejected key, our account's billing), so it
 * never reads as the provider's failure.
 */
export type Entry<R> =
  | { provider: ProviderId; machine: Machine; run: FairnessRun | null; status: "completed"; reason: null; result: R }
  | { provider: ProviderId; machine: Machine; run: FairnessRun | null; status: "failed" | "skipped" | "not-run"; reason: string; result: null };

export interface CpuNativeResult {
  cpuModel: string | null;
  guestVcpus: number | null;
  /** Median ops/s of 3 ten-second segments with one worker. */
  singleOps: number;
  /** Median ops/s of 3 ten-second segments with four workers. */
  allCoreOps: number;
  /** allCoreOps over 4 × singleOps: 1 when four workers each run as fast as one alone. */
  scaling: number;
  /** Median of the first six measured 30-second windows. */
  first3MinOps: number;
  /** Median of the last six. */
  last3MinOps: number;
  /** last3MinOps over first3MinOps. */
  retention: number;
  sustained: readonly { minute: number; opsPerS: number }[];
}

export interface DiskResult {
  fsType: string;
  memoryBacked: boolean;
  /** Not memory-backed and every phase got O_DIRECT: the figures are the disk's. */
  comparable: boolean;
  notComparableWhy: string | null;
  directory: string;
  sizeMiB: number;
  seqWriteMiBps: number;
  seqReadMiBps: number;
  randWriteIops: number;
  randWriteP99Us: number;
  randReadIops: number;
  randReadP99Us: number;
  /** Whether each phase got O_DIRECT; false means the filesystem refused it and the phase ran buffered. */
  direct: { seqWrite: boolean; seqRead: boolean; randWrite: boolean; randRead: boolean };
}

export interface BurstResult {
  requested: number;
  created: number;
  createErrors: readonly { error: string; count: number }[];
  soloOps: number;
  medianOps: number;
  /** medianOps over soloOps: 1 means ten at once ran as fast as one alone. */
  relativeToSolo: number;
  /** Fastest over slowest sandbox in the cohort. */
  spread: number;
  verified: number;
  /** Seconds every burn provably ran at the same time. */
  guaranteedOverlapS: number;
  /** All ten created, every burn verified, and at least 75% of the burn time provably shared. */
  comparable: boolean;
  notComparableWhy: string | null;
  distinctBootIds: number;
}

export type MemoryOutcome =
  | { kind: "completed"; fillGiBps: number; verifyGiBps: number; fileMiBps: number; swapUsedMiB: number }
  | { kind: "file-failed"; errno: number | null; writtenMiB: number; swapUsedMiB: number }
  | { kind: "killed"; lastPhase: string | null; exitCode: number | null; oomKills: number | null }
  | { kind: "refused"; errno: number | null }
  | { kind: "sandbox-lost"; lastPhase: string | null };

export interface MemoryResult {
  /** What nproc tells build tools. */
  visibleCpus: number | null;
  /** The tighter of the cgroup quota and the CPUs the sandbox may run on. */
  usableCpus: number | null;
  quotaCpus: number | null;
  /** nproc shows more CPUs than the sandbox can use; null when either side is unreadable. */
  cpusOverReported: boolean | null;
  memTotalGiB: number | null;
  memLimitGiB: number | null;
  swapTotalGiB: number;
  memoryMiB: number;
  fileMiB: number;
  outcome: MemoryOutcome;
}

export const isolationKinds = ["gvisor", "firecracker", "microvm", "cloud-hypervisor", "qemu-kvm", "vm", "container", "unknown"] as const;
export type IsolationKind = (typeof isolationKinds)[number];

export interface SecurityResult {
  isolation: IsolationKind;
  evidence: readonly string[];
  /** A container whose CPU also reports a hypervisor runs inside a VM; null when not a container or unknown. */
  insideVm: boolean | null;
  kernel: string | null;
  cpu: { vendor: string | null; family: number | null; model: number | null; modelName: string | null; mhz: number | null };
  /** Kernel parameters on the command line that turn a mitigation off or memory hardening down. */
  weakeningFlags: readonly string[];
  /** Performance tuning on the command line, shown beside them. */
  notableFlags: readonly string[];
  /** The kernel's vulnerability files that start with "Vulnerable". */
  vulnerable: readonly { name: string; status: string }[];
  /** How many vulnerability files the kernel lists; 0 means none readable (gVisor shows none), not none vulnerable. */
  vulnerabilityFiles: number;
  uid: number | null;
  passwordlessSudo: boolean;
  createS: number;
  uptimeS: number | null;
  /** A lower bound on how long before the create the guest booted: above a few seconds, it came from a pool or snapshot. */
  bootedBeforeCreateS: number | null;
}

export const stateVerdicts = ["in-ram", "kept-running", "cold-restart", "files-lost", "inconclusive"] as const;
export type StateVerdict = (typeof stateVerdicts)[number];

export const pauseStages = ["pause", "resume", "first-command"] as const;

/**
 * What a pause, a 60-second hold and a resume did. "unsupported": our SDK adapter has no pause for
 * the provider. "failed": a step didn't complete, which settles nothing about what survives.
 */
export type SuspendOutcome =
  | { kind: "unsupported" }
  | { kind: "failed"; stage: (typeof pauseStages)[number]; error: string }
  | {
      kind: "measured";
      verdict: StateVerdict;
      /** Inconclusive: why the evidence wasn't enough for a verdict. Another verdict: a note on its evidence, or null. */
      reason: string | null;
      holdMs: number;
      pauseMs: number;
      resumeMs: number;
      /** From resume returning to the first command answering. */
      firstCommandMs: number;
      /** Observed: from resume returning to the original server answering; null when it didn't. */
      servingMs: number | null;
      /** The server was confirmed gone, started again and answered. */
      serverRestarted: boolean;
      /** Composed, for a server started again: the first command plus its guest-timed restart. */
      coldServeMs: number | null;
      bootSame: boolean | null;
    };

export interface StateResult {
  /** A server killed with SIGKILL and started again, timed in the guest from the kill to the new one answering. */
  restart: {
    /** Median of `samplesMs`; null when no restart was timed. */
    medianMs: number | null;
    samplesMs: readonly number[];
    failures: number;
    /** Trials that found no previous server to kill: starts, not restarts, so not in the median. */
    startsOnly: number;
  };
  suspend: SuspendOutcome;
}

/**
 * What stopped the hog. Only a recorded exit status, a new boot ID or the provider's own lookup is
 * an outcome; "inconclusive" claims nothing about the provider.
 */
export type PressureOutcome =
  | { kind: "reached-target" }
  | { kind: "process-killed" }
  | { kind: "refused"; reason: string }
  | { kind: "sandbox-restarted" }
  | { kind: "sandbox-lost" }
  | { kind: "inconclusive"; reason: string };

export const pressureScopes = ["process", "collateral", "sandbox"] as const;

export interface PressureResult {
  /** The provider's same-machine memory. */
  advertisedMiB: number;
  /** 1.5 times `advertisedMiB`. */
  targetMiB: number;
  /**
   * The most the hog was seen holding: `log` is exact, from its whole log; `last-poll` is a lower
   * bound from the last progress seen. Null when nothing was observed.
   */
  reached: { evidence: "log" | "last-poll"; mib: number; fraction: number } | null;
  outcome: PressureOutcome;
  /** The hog alone, other processes too, or the whole sandbox; null when not determined. */
  scope: (typeof pressureScopes)[number] | null;
  /** A fresh allocation and a file write succeeded afterwards; null when not measured. */
  usableAfter: boolean | null;
  /** Swap the guest reported before the hog started; null when unreadable. */
  swapTotalGiB: number | null;
}

export interface CheckData<R> {
  run: FairnessRun;
  entries: readonly Entry<R>[];
}

export const arches = ["x86_64", "aarch64"] as const;
export type Arch = (typeof arches)[number];

export interface FairnessData {
  generatedAt: string;
  track: "same-machine";
  /** Each provider's CPU architecture, from the security probe's kernel; ARM providers run the aarch64 build of the same source. */
  arch: Partial<Record<ProviderId, Arch>>;
  cpuNative: CheckData<CpuNativeResult> | null;
  diskReal: CheckData<DiskResult> | null;
  cpuBurst: CheckData<BurstResult> | null;
  memoryHonesty: CheckData<MemoryResult> | null;
  securityProbe: CheckData<SecurityResult> | null;
  stateSurvival: CheckData<StateResult> | null;
  memoryPressure: CheckData<PressureResult> | null;
}

// ---------------------------------------------------------------------------
// The parser.

type Json = Record<string, unknown>;

const fail = (path: string, what: string): never => {
  throw new Error(`fairness.json: ${path} ${what}`);
};
const isJson = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Json => (isJson(v) ? v : fail(path, "must be an object"));
const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, "must be an array"));
const str = (v: unknown, path: string): string => (typeof v === "string" && v.length > 0 ? v : fail(path, "must be a non-empty string"));
const bool = (v: unknown, path: string): boolean => (typeof v === "boolean" ? v : fail(path, "must be true or false"));
const num = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(path, "must be a finite number"));
const nonNegative = (v: unknown, path: string): number => {
  const n = num(v, path);
  return n >= 0 ? n : fail(path, "must be 0 or more");
};
const positive = (v: unknown, path: string): number => {
  const n = num(v, path);
  return n > 0 ? n : fail(path, "must be above 0");
};
const whole = (v: unknown, path: string): number => (typeof v === "number" && Number.isInteger(v) ? v : fail(path, "must be a whole number"));
const wholeNonNegative = (v: unknown, path: string): number => {
  const n = whole(v, path);
  return n >= 0 ? n : fail(path, "must be 0 or more");
};
const orNull =
  <T>(read: (v: unknown, path: string) => T) =>
  (v: unknown, path: string): T | null =>
    v === null ? null : read(v, path);
const strings = (v: unknown, path: string): string[] => arr(v, path).map((s, i) => str(s, `${path}[${i}]`));

function iso(v: unknown, path: string): string {
  const s = str(v, path);
  return Number.isNaN(Date.parse(s)) ? fail(path, `must be a valid timestamp, not ${s}`) : s;
}

const oneOf = <T extends string>(values: readonly T[], v: unknown, path: string): T => {
  const found = values.find((x) => x === v);
  return found ?? fail(path, `must be one of ${values.join(", ")}`);
};

/** Ratios stored to 4 decimals may be off by half a unit in the last place. */
const RATIO_TOLERANCE = 0.00005 + 1e-9;

function agrees(stored: number, derived: number, path: string) {
  if (Math.abs(stored - derived) > RATIO_TOLERANCE) fail(path, `is ${stored} but its figures give ${derived.toFixed(4)}`);
}

function parseCpuNative(o: Json, path: string): CpuNativeResult {
  const singleOps = positive(o.singleOps, `${path}.singleOps`);
  const allCoreOps = positive(o.allCoreOps, `${path}.allCoreOps`);
  const scaling = positive(o.scaling, `${path}.scaling`);
  agrees(scaling, allCoreOps / (4 * singleOps), `${path}.scaling`);
  const first3MinOps = positive(o.first3MinOps, `${path}.first3MinOps`);
  const last3MinOps = nonNegative(o.last3MinOps, `${path}.last3MinOps`);
  const retention = nonNegative(o.retention, `${path}.retention`);
  agrees(retention, last3MinOps / first3MinOps, `${path}.retention`);
  const sustained = arr(o.sustained, `${path}.sustained`).map((s, i) => {
    const p = obj(s, `${path}.sustained[${i}]`);
    return { minute: positive(p.minute, `${path}.sustained[${i}].minute`), opsPerS: nonNegative(p.opsPerS, `${path}.sustained[${i}].opsPerS`) };
  });
  if (sustained.length !== 30) fail(`${path}.sustained`, `has ${sustained.length} segments; a completed run has 30`);
  // The first and last 3 minutes are medians of the first and last six windows.
  const medianOf = (xs: readonly number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  };
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6);
  if (!near(first3MinOps, medianOf(sustained.slice(0, 6).map((x) => x.opsPerS)))) fail(`${path}.first3MinOps`, "is not the median of the first six windows");
  if (!near(last3MinOps, medianOf(sustained.slice(-6).map((x) => x.opsPerS)))) fail(`${path}.last3MinOps`, "is not the median of the last six windows");
  sustained.forEach((s, i) => {
    // Windows of about 30 s: the k-th ends near minute k / 2.
    const gap = s.minute - (sustained[i - 1]?.minute ?? 0);
    if (gap < 0.4 || gap > 0.6) fail(`${path}.sustained[${i}].minute`, `is ${s.minute}, not about 30 s after the window before`);
    // Deadlines are absolute, so window k ends near minute k / 2: no drift past the 15 minutes.
    if (Math.abs(s.minute - (i + 1) / 2) > 0.05) fail(`${path}.sustained[${i}].minute`, `is ${s.minute}, not near its scheduled minute ${(i + 1) / 2}`);
  });
  return {
    cpuModel: orNull(str)(o.cpuModel, `${path}.cpuModel`),
    guestVcpus: orNull(positive)(o.guestVcpus, `${path}.guestVcpus`),
    singleOps,
    allCoreOps,
    scaling,
    first3MinOps,
    last3MinOps,
    retention,
    sustained,
  };
}

/** `comparable` and its reason, which must be null exactly when it is comparable. */
function comparability(o: Json, path: string) {
  const comparable = bool(o.comparable, `${path}.comparable`);
  const notComparableWhy = orNull(str)(o.notComparableWhy, `${path}.notComparableWhy`);
  if (comparable !== (notComparableWhy === null)) fail(`${path}.notComparableWhy`, "must be null exactly when comparable");
  return { comparable, notComparableWhy };
}

/** The file size the disk chart's labels name. */
export const DISK_SIZE_MIB = 2048;

function parseDisk(o: Json, path: string): DiskResult {
  const disk = parseDiskFigures(o, path);
  if (disk.sizeMiB !== DISK_SIZE_MIB) fail(`${path}.sizeMiB`, `is ${disk.sizeMiB}; the chart says ${DISK_SIZE_MIB} MiB`);
  if (disk.memoryBacked && disk.comparable) fail(`${path}.comparable`, "can't be true for a memory-backed filesystem");
  if (disk.comparable && !Object.values(disk.direct).every(Boolean)) fail(`${path}.comparable`, "can't be true when a phase ran without direct I/O");
  return disk;
}

function parseDiskFigures(o: Json, path: string): DiskResult {
  const direct = obj(o.direct, `${path}.direct`);
  return {
    fsType: str(o.fsType, `${path}.fsType`),
    memoryBacked: bool(o.memoryBacked, `${path}.memoryBacked`),
    ...comparability(o, path),
    directory: str(o.directory, `${path}.directory`),
    sizeMiB: positive(o.sizeMiB, `${path}.sizeMiB`),
    seqWriteMiBps: positive(o.seqWriteMiBps, `${path}.seqWriteMiBps`),
    seqReadMiBps: positive(o.seqReadMiBps, `${path}.seqReadMiBps`),
    randWriteIops: positive(o.randWriteIops, `${path}.randWriteIops`),
    randWriteP99Us: positive(o.randWriteP99Us, `${path}.randWriteP99Us`),
    randReadIops: positive(o.randReadIops, `${path}.randReadIops`),
    randReadP99Us: positive(o.randReadP99Us, `${path}.randReadP99Us`),
    direct: {
      seqWrite: bool(direct.seqWrite, `${path}.direct.seqWrite`),
      seqRead: bool(direct.seqRead, `${path}.direct.seqRead`),
      randWrite: bool(direct.randWrite, `${path}.direct.randWrite`),
      randRead: bool(direct.randRead, `${path}.direct.randRead`),
    },
  };
}

function parseBurst(o: Json, path: string): BurstResult {
  const requested = whole(o.requested, `${path}.requested`);
  const created = wholeNonNegative(o.created, `${path}.created`);
  const verified = wholeNonNegative(o.verified, `${path}.verified`);
  if (created > requested) fail(`${path}.created`, `is ${created}, more than the ${requested} requested`);
  if (verified < 2 || verified > created) fail(`${path}.verified`, `is ${verified}; a published cohort has 2 to ${created}`);
  if (requested !== 10) fail(`${path}.requested`, "must be 10, as the chart says");
  if (bool(o.comparable, `${path}.comparable`) && (created !== requested || verified !== created)) fail(`${path}.comparable`, "needs every sandbox created and verified");
  if (bool(o.comparable, `${path}.comparable`) && num(o.guaranteedOverlapS, `${path}.guaranteedOverlapS`) < 90) fail(`${path}.comparable`, "needs at least 90 of 120 seconds provably shared");
  if (num(o.guaranteedOverlapS, `${path}.guaranteedOverlapS`) > 120) fail(`${path}.guaranteedOverlapS`, "can't exceed the 120-second burn");
  const createErrors = arr(o.createErrors, `${path}.createErrors`).map((e, i) => {
    const x = obj(e, `${path}.createErrors[${i}]`);
    return { error: str(x.error, `${path}.createErrors[${i}].error`), count: whole(x.count, `${path}.createErrors[${i}].count`) };
  });
  const refused = createErrors.reduce((sum, e) => sum + e.count, 0);
  if (created + refused !== requested) fail(`${path}.createErrors`, `count ${refused} refused, but ${requested - created} creates failed`);
  const soloOps = positive(o.soloOps, `${path}.soloOps`);
  const medianOps = positive(o.medianOps, `${path}.medianOps`);
  const relativeToSolo = positive(o.relativeToSolo, `${path}.relativeToSolo`);
  agrees(relativeToSolo, medianOps / soloOps, `${path}.relativeToSolo`);
  const spread = num(o.spread, `${path}.spread`);
  if (spread < 1) fail(`${path}.spread`, "is fastest over slowest, so 1 or more");
  return {
    requested,
    created,
    createErrors,
    soloOps,
    medianOps,
    relativeToSolo,
    spread,
    verified,
    guaranteedOverlapS: num(o.guaranteedOverlapS, `${path}.guaranteedOverlapS`),
    ...comparability(o, path),
    distinctBootIds: wholeNonNegative(o.distinctBootIds, `${path}.distinctBootIds`),
  };
}

function parseMemoryOutcome(v: unknown, path: string): MemoryOutcome {
  const o = obj(v, path);
  const kind = oneOf(["completed", "file-failed", "killed", "refused", "sandbox-lost"] as const, o.kind, `${path}.kind`);
  switch (kind) {
    case "completed":
      return {
        kind,
        fillGiBps: positive(o.fillGiBps, `${path}.fillGiBps`),
        verifyGiBps: positive(o.verifyGiBps, `${path}.verifyGiBps`),
        fileMiBps: positive(o.fileMiBps, `${path}.fileMiBps`),
        swapUsedMiB: nonNegative(o.swapUsedMiB, `${path}.swapUsedMiB`),
      };
    case "file-failed":
      return {
        kind,
        errno: orNull(whole)(o.errno, `${path}.errno`),
        writtenMiB: wholeNonNegative(o.writtenMiB, `${path}.writtenMiB`),
        swapUsedMiB: nonNegative(o.swapUsedMiB, `${path}.swapUsedMiB`),
      };
    case "killed":
      return {
        kind,
        lastPhase: orNull(str)(o.lastPhase, `${path}.lastPhase`),
        exitCode: orNull(whole)(o.exitCode, `${path}.exitCode`),
        oomKills: orNull(wholeNonNegative)(o.oomKills, `${path}.oomKills`),
      };
    case "refused":
      return { kind, errno: orNull(whole)(o.errno, `${path}.errno`) };
    case "sandbox-lost":
      return { kind, lastPhase: orNull(str)(o.lastPhase, `${path}.lastPhase`) };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function parseMemory(o: Json, path: string): MemoryResult {
  const visibleCpus = orNull(positive)(o.visibleCpus, `${path}.visibleCpus`);
  const usableCpus = orNull(positive)(o.usableCpus, `${path}.usableCpus`);
  const cpusOverReported = orNull(bool)(o.cpusOverReported, `${path}.cpusOverReported`);
  const derived = visibleCpus === null || usableCpus === null ? null : visibleCpus > Math.ceil(usableCpus);
  if (cpusOverReported !== derived) fail(`${path}.cpusOverReported`, `must be ${String(derived)} for ${String(visibleCpus)} visible and ${String(usableCpus)} usable`);
  return {
    visibleCpus,
    usableCpus,
    quotaCpus: orNull(positive)(o.quotaCpus, `${path}.quotaCpus`),
    cpusOverReported,
    memTotalGiB: orNull(positive)(o.memTotalGiB, `${path}.memTotalGiB`),
    memLimitGiB: orNull(positive)(o.memLimitGiB, `${path}.memLimitGiB`),
    swapTotalGiB: nonNegative(o.swapTotalGiB, `${path}.swapTotalGiB`),
    memoryMiB: o.memoryMiB === 6144 ? 6144 : fail(`${path}.memoryMiB`, "must be 6144, as the chart says"),
    fileMiB: o.fileMiB === 2048 ? 2048 : fail(`${path}.fileMiB`, "must be 2048, as the chart says"),
    outcome: parseMemoryOutcome(o.outcome, `${path}.outcome`),
  };
}

function parseSecurity(o: Json, path: string): SecurityResult {
  const cpu = obj(o.cpu, `${path}.cpu`);
  const vulnerable = arr(o.vulnerable, `${path}.vulnerable`).map((v, i) => {
    const x = obj(v, `${path}.vulnerable[${i}]`);
    const status = str(x.status, `${path}.vulnerable[${i}].status`);
    if (!/^Vulnerable/i.test(status)) fail(`${path}.vulnerable[${i}].status`, "must start with Vulnerable");
    return { name: str(x.name, `${path}.vulnerable[${i}].name`), status };
  });
  return {
    isolation: oneOf(isolationKinds, o.isolation, `${path}.isolation`),
    evidence: strings(o.evidence, `${path}.evidence`),
    insideVm: orNull(bool)(o.insideVm, `${path}.insideVm`),
    kernel: orNull(str)(o.kernel, `${path}.kernel`),
    cpu: {
      vendor: orNull(str)(cpu.vendor, `${path}.cpu.vendor`),
      family: orNull(whole)(cpu.family, `${path}.cpu.family`),
      model: orNull(whole)(cpu.model, `${path}.cpu.model`),
      modelName: orNull(str)(cpu.modelName, `${path}.cpu.modelName`),
      mhz: orNull(positive)(cpu.mhz, `${path}.cpu.mhz`),
    },
    weakeningFlags: strings(o.weakeningFlags, `${path}.weakeningFlags`),
    notableFlags: strings(o.notableFlags, `${path}.notableFlags`),
    vulnerable,
    vulnerabilityFiles: wholeNonNegative(o.vulnerabilityFiles, `${path}.vulnerabilityFiles`),
    uid: orNull(wholeNonNegative)(o.uid, `${path}.uid`),
    passwordlessSudo: bool(o.passwordlessSudo, `${path}.passwordlessSudo`),
    createS: nonNegative(o.createS, `${path}.createS`),
    uptimeS: orNull(nonNegative)(o.uptimeS, `${path}.uptimeS`),
    bootedBeforeCreateS: orNull(num)(o.bootedBeforeCreateS, `${path}.bootedBeforeCreateS`),
  };
}

/**
 * A harness reason in reader's words: "no answer for 242146 ms" reads "the sandbox didn't answer for
 * about 4 min" (seconds under 90 s), and "the original processes kept their memory" names what was
 * checked: the server's memory digest and the worker's identity and heartbeat.
 */
export const readableReason = (reason: string) =>
  reason.replace(/\bthe original processes kept their memory\b/g, "the original server kept its memory and the same worker came back").replace(/\bno answer for (\d+) ms\b/g, (_, ms: string) => {
    const s = Number(ms) / 1000;
    return `the sandbox didn't answer for about ${s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`}`;
  });

/** The hold the page names: 60 seconds. */
export const HOLD_MS = 60_000;

function parseSuspend(v: unknown, path: string): SuspendOutcome {
  const o = obj(v, path);
  const kind = oneOf(["unsupported", "failed", "measured"] as const, o.kind, `${path}.kind`);
  switch (kind) {
    case "unsupported":
      return { kind };
    case "failed":
      return { kind, stage: oneOf(pauseStages, o.stage, `${path}.stage`), error: readableReason(str(o.error, `${path}.error`)) };
    case "measured": {
      const verdict = oneOf(stateVerdicts, o.verdict, `${path}.verdict`);
      const raw = orNull(str)(o.reason, `${path}.reason`);
      const reason = raw === null ? null : readableReason(raw);
      if (verdict === "inconclusive" && reason === null) fail(`${path}.reason`, "must say why the verdict is inconclusive");
      if (o.holdMs !== HOLD_MS) fail(`${path}.holdMs`, `must be ${HOLD_MS}, as the chart says`);
      const servingMs = orNull(nonNegative)(o.servingMs, `${path}.servingMs`);
      const coldServeMs = orNull(nonNegative)(o.coldServeMs, `${path}.coldServeMs`);
      const serverRestarted = bool(o.serverRestarted, `${path}.serverRestarted`);
      if (serverRestarted !== (coldServeMs !== null)) fail(`${path}.coldServeMs`, "must be set exactly when the server was started again");
      if (servingMs !== null && coldServeMs !== null) fail(`${path}.servingMs`, "can't be set beside coldServeMs: the original server answered or a new one did");
      return {
        kind,
        verdict,
        reason,
        holdMs: HOLD_MS,
        pauseMs: nonNegative(o.pauseMs, `${path}.pauseMs`),
        resumeMs: nonNegative(o.resumeMs, `${path}.resumeMs`),
        firstCommandMs: nonNegative(o.firstCommandMs, `${path}.firstCommandMs`),
        servingMs,
        serverRestarted,
        coldServeMs,
        bootSame: orNull(bool)(o.bootSame, `${path}.bootSame`),
      };
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

const medianOf = (xs: readonly number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

function parseState(o: Json, path: string): StateResult {
  const r = obj(o.restart, `${path}.restart`);
  const samplesMs = arr(r.samplesMs, `${path}.restart.samplesMs`).map((s, i) => positive(s, `${path}.restart.samplesMs[${i}]`));
  const medianMs = orNull(positive)(r.medianMs, `${path}.restart.medianMs`);
  if ((medianMs === null) !== (samplesMs.length === 0)) fail(`${path}.restart.medianMs`, "must be null exactly when no restart was timed");
  if (medianMs !== null && Math.abs(medianMs - medianOf(samplesMs)) > 0.05) fail(`${path}.restart.medianMs`, `is ${medianMs}, not the median of its samples`);
  return {
    restart: { medianMs, samplesMs, failures: wholeNonNegative(r.failures, `${path}.restart.failures`), startsOnly: wholeNonNegative(r.startsOnly, `${path}.restart.startsOnly`) },
    suspend: parseSuspend(o.suspend, `${path}.suspend`),
  };
}

/** The hog's target as a multiple of the advertised memory, as the chart says. */
export const OVERSHOOT = 1.5;

function parsePressureOutcome(v: unknown, path: string): PressureOutcome {
  const o = obj(v, path);
  const kind = oneOf(["reached-target", "process-killed", "refused", "sandbox-restarted", "sandbox-lost", "inconclusive"] as const, o.kind, `${path}.kind`);
  switch (kind) {
    case "reached-target":
    case "process-killed":
    case "sandbox-restarted":
    case "sandbox-lost":
      return { kind };
    case "refused":
    case "inconclusive":
      return { kind, reason: readableReason(str(o.reason, `${path}.reason`)) };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function parsePressure(o: Json, path: string): PressureResult {
  const advertisedMiB = positive(o.advertisedMiB, `${path}.advertisedMiB`);
  const targetMiB = positive(o.targetMiB, `${path}.targetMiB`);
  if (targetMiB !== advertisedMiB * OVERSHOOT) fail(`${path}.targetMiB`, `must be ${OVERSHOOT} × advertisedMiB, as the chart says`);
  const reached = o.reached === null ? null : obj(o.reached, `${path}.reached`);
  const outcome = parsePressureOutcome(o.outcome, `${path}.outcome`);
  const scope = o.scope === null ? null : oneOf(pressureScopes, o.scope, `${path}.scope`);
  if ((outcome.kind === "sandbox-lost" || outcome.kind === "sandbox-restarted") && scope !== "sandbox") fail(`${path}.scope`, `must be sandbox for ${outcome.kind}`);
  const parsedReached =
    reached === null
      ? null
      : {
          evidence: oneOf(["log", "last-poll"] as const, reached.evidence, `${path}.reached.evidence`),
          mib: nonNegative(reached.mib, `${path}.reached.mib`),
          fraction: nonNegative(reached.fraction, `${path}.reached.fraction`),
        };
  if (parsedReached && Math.abs(parsedReached.fraction - parsedReached.mib / advertisedMiB) > 0.0005 + 1e-9) fail(`${path}.reached.fraction`, `is ${parsedReached.fraction} but its figures give ${(parsedReached.mib / advertisedMiB).toFixed(3)}`);
  if (outcome.kind === "reached-target" && (parsedReached?.evidence !== "log" || parsedReached.mib < targetMiB)) fail(`${path}.reached`, "must log the whole target for reached-target");
  return {
    advertisedMiB,
    targetMiB,
    reached: parsedReached,
    outcome,
    scope,
    usableAfter: orNull(bool)(o.usableAfter, `${path}.usableAfter`),
    swapTotalGiB: orNull(nonNegative)(o.swapTotalGiB, `${path}.swapTotalGiB`),
  };
}

function parseEntry<R>(v: unknown, path: string, parseResult: (o: Json, path: string) => R): Entry<R> {
  const o = obj(v, path);
  const id = str(o.provider, `${path}.provider`);
  const provider = isProviderId(id) ? id : fail(`${path}.provider`, `is not a known provider: ${id}`);
  const status = oneOf(["completed", "failed", "skipped", "not-run"] as const, o.status, `${path}.status`);
  const m = obj(o.machine, `${path}.machine`);
  const machine = { cpu: positive(m.cpu, `${path}.machine.cpu`), memoryGiB: positive(m.memoryGiB, `${path}.machine.memoryGiB`), sameSize: bool(m.sameSize, `${path}.machine.sameSize`) };
  if (machine.sameSize !== (machine.cpu === 4 && machine.memoryGiB === 8)) fail(`${path}.machine.sameSize`, "must be true exactly for 4 vCPU, 8 GiB");
  const run = o.run === undefined ? null : parseRun(o.run, `${path}.run`);
  switch (status) {
    case "completed":
      if (o.reason !== null) fail(`${path}.reason`, "must be null on a completed entry");
      return { provider, machine, run, status, reason: null, result: parseResult(obj(o.result, `${path}.result`), `${path}.result`) };
    case "failed":
    case "skipped":
    case "not-run":
      if (o.result !== null) fail(`${path}.result`, `must be null on a ${status} entry`);
      return { provider, machine, run, status, reason: str(o.reason, `${path}.reason`), result: null };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function parseRun(v: unknown, path: string): FairnessRun {
  const run = obj(v, path);
  return { id: str(run.id, `${path}.id`), sdkCommit: str(run.sdkCommit, `${path}.sdkCommit`), startedAt: iso(run.startedAt, `${path}.startedAt`) };
}

function parseCheck<R>(v: unknown, path: string, parseResult: (o: Json, path: string) => R): CheckData<R> | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, path);
  const run = parseRun(o.run, `${path}.run`);
  const entries = arr(o.entries, `${path}.entries`).map((e, i) => parseEntry(e, `${path}.entries[${i}]`, parseResult));
  const seen = new Set<ProviderId>();
  for (const e of entries) {
    if (seen.has(e.provider)) fail(`${path}.entries`, `lists ${e.provider} twice`);
    seen.add(e.provider);
    if (e.run?.id === run.id) fail(`${path}.entries`, `${e.provider}'s run is the check's own; leave it out`);
  }
  return { run, entries };
}

/** Parses the file, so a malformed one stops the build instead of reaching the page. */
export function parseFairness(raw: unknown): FairnessData {
  const o = obj(raw, "root");
  if (o.schema !== SCHEMA) fail("schema", `must be ${SCHEMA}`);
  if (o.track !== "same-machine") fail("track", "must be same-machine");
  const checks = obj(o.checks, "checks");
  const archRaw = obj(o.arch, "arch");
  const arch: Partial<Record<ProviderId, Arch>> = {};
  for (const [id, value] of Object.entries(archRaw)) {
    if (!isProviderId(id)) fail("arch", `has an unknown provider ${id}`);
    else arch[id] = oneOf(arches, value, `arch.${id}`);
  }
  for (const key of Object.keys(checks)) if (!checkIds.some((id) => id === key)) fail("checks", `has an unknown check ${key}`);
  const data = {
    generatedAt: iso(o.generatedAt, "generatedAt"),
    track: "same-machine" as const,
    arch,
    cpuNative: parseCheck(checks["cpu-native"], "checks.cpu-native", parseCpuNative),
    diskReal: parseCheck(checks["disk-real"], "checks.disk-real", parseDisk),
    cpuBurst: parseCheck(checks["cpu-burst-10"], "checks.cpu-burst-10", parseBurst),
    memoryHonesty: parseCheck(checks["memory-honesty"], "checks.memory-honesty", parseMemory),
    securityProbe: parseCheck(checks["security-probe"], "checks.security-probe", parseSecurity),
    stateSurvival: parseCheck(checks["state-survival"], "checks.state-survival", parseState),
    memoryPressure: parseCheck(checks["memory-pressure"], "checks.memory-pressure", parsePressure),
  };
  // The hog's advertised memory is the size the provider's sandbox asked for.
  for (const e of completed(data.memoryPressure)) if (e.result.advertisedMiB !== e.machine.memoryGiB * 1024) fail(`checks.memory-pressure ${e.provider}`, `advertises ${e.result.advertisedMiB} MiB, not its machine's ${e.machine.memoryGiB} GiB`);
  // A disk under gVisor, by the security probe, can't be marked comparable.
  const gvisor = new Set(completed(data.securityProbe).filter((e) => e.result.isolation === "gvisor").map((e) => e.provider));
  for (const e of completed(data.diskReal)) if (gvisor.has(e.provider) && e.result.comparable) fail(`checks.disk-real ${e.provider}`, "runs under gVisor, so its disk can't be comparable");
  return data;
}

// ---------------------------------------------------------------------------
// Rules the section and the agent files share.

export type Completed<R> = Extract<Entry<R>, { status: "completed" }>;

export const completed = <R>(check: CheckData<R> | null): Completed<R>[] =>
  (check?.entries ?? []).flatMap((e) => (e.status === "completed" ? [e] : []));

export const notCompleted = <R>(check: CheckData<R> | null) =>
  (check?.entries ?? []).flatMap((e) => (e.status === "completed" ? [] : [{ provider: e.provider, status: e.status, why: e.reason }]));

/** Whether any check has an entry; the section shows nothing until one does. */
export const hasFairness = (d: FairnessData) =>
  [d.cpuNative, d.diskReal, d.cpuBurst, d.memoryHonesty, d.securityProbe, d.stateSurvival, d.memoryPressure].some((c) => c !== null && c.entries.length > 0);

/** How many providers each newer scenario covers: a pause tried, a pause our SDK adapter lacks, restart speed, memory pressure. */
export function newScenarioCoverage(d: FairnessData) {
  const state = completed(d.stateSurvival);
  const noPause = state.filter((e) => e.result.suspend.kind === "unsupported").length;
  return { pause: state.length - noPause, noPause, restart: state.length, memory: completed(d.memoryPressure).length };
}

/** The newer scenarios' coverage in words, from the data. */
export function newScenarioCoverageText(d: FairnessData) {
  const c = newScenarioCoverage(d);
  const noPause = c.noPause > 0 ? ` (our SDK adapter has no pause for ${c.noPause} more)` : "";
  return `the pause ran on ${c.pause} providers${noPause}, restart speed on ${c.restart} and memory pressure on ${c.memory}`;
}

/** Highest first by `value`, ties by provider id. */
export const rankBy = <R>(entries: readonly Completed<R>[], value: (r: R) => number) =>
  [...entries].sort((a, b) => value(b.result) - value(a.result) || a.provider.localeCompare(b.provider));

/** Lowest first by `value`, ties by provider id. */
/** Entries whose figures compare: completed, on a 4 vCPU, 8 GiB sandbox. */
export const sameSize = <R>(entries: readonly Completed<R>[]) => entries.filter((e) => e.machine.sameSize);

export const rankAscending = <R>(entries: readonly Completed<R>[], value: (r: R) => number) =>
  [...entries].sort((a, b) => value(a.result) - value(b.result) || a.provider.localeCompare(b.provider));

export const isolationLabel: Record<IsolationKind, string> = {
  gvisor: "gVisor",
  firecracker: "Firecracker microVM",
  microvm: "microVM",
  "cloud-hypervisor": "Cloud Hypervisor VM",
  "qemu-kvm": "QEMU/KVM VM",
  vm: "VM (hypervisor not named)",
  container: "Container",
  unknown: "Not identified",
};

/**
 * The last 3 minutes of the 15-minute burn over the short four-core runs before it: how much of its
 * opening speed a sandbox still had at the end. Unlike retention (last 3 ÷ first 3 minutes), it
 * still shows a drop that happened before minute 3.
 */
export const heldShare = (r: CpuNativeResult) => r.last3MinOps / r.allCoreOps;

/** "16%". */
export const percentText = (r: number) => `${Math.round(r * 100)}%`;

/** "45.2M ops/s". */
export const opsText = (v: number) => `${formatShort(v, "ops/s")} ops/s`;

/** "1,234 MB/s" (MiB/s, as the harness measures, labelled as the site labels throughput). */
export const mibpsText = (v: number) => `${Math.round(v).toLocaleString("en-US")} MiB/s`;

/** "12,345". */
export const iopsText = (v: number) => `${Math.round(v).toLocaleString("en-US")}`;

/** "1.2 GiB", "6 GiB". */
export const gibText = (v: number) => `${Number(v.toFixed(1))} GiB`;

/** The CPU in one short line: "AMD EPYC · family 25 model 33 · 3,394 MHz". */
export const cpuLine = (c: SecurityResult["cpu"]) =>
  [c.modelName ?? c.vendor ?? "CPU not named", c.family !== null && c.model !== null ? `family ${c.family} model ${c.model}` : null, c.mhz !== null ? `${Math.round(c.mhz).toLocaleString("en-US")} MHz` : null]
    .filter((x) => x !== null)
    .join(" · ");

/**
 * How long the guest had been up when it ran its first command, in plain words:
 * fresh boots read a few seconds; a long uptime means the sandbox came from a
 * pool or snapshot started earlier, which is how fast creates are made.
 */
export function uptimeText(r: SecurityResult): string {
  if (r.uptimeS === null || r.bootedBeforeCreateS === null) return "Uptime not readable";
  const up = r.uptimeS < 120 ? `${Number(r.uptimeS.toFixed(1))} s` : r.uptimeS < 7200 ? `${Math.round(r.uptimeS / 60)} min` : r.uptimeS < 172_800 ? `${Number((r.uptimeS / 3600).toFixed(1))} h` : `${Math.round(r.uptimeS / 86_400)} days`;
  // A container shares its host's kernel, so its uptime is the host's, not the sandbox's.
  if (r.isolation === "container") return `Shows the host's uptime (${up}): a container shares the host kernel`;
  // Uptime shorter than the create call itself: the kernel started after the create began.
  if (r.uptimeS < r.createS) return `Up ${up} at first command: booted during the create`;
  // The bound subtracts the whole wait for the first reply, so zero or less settles nothing.
  if (r.bootedBeforeCreateS <= 0) return `Up ${up} at first command: boot timing undetermined`;
  const b = r.bootedBeforeCreateS;
  const floor = (v: number, places: number) => Math.floor(v * 10 ** places) / 10 ** places;
  if (b <= 10) return `Up ${up} at first command, at least ${floor(b, 1)} s before the create began`;
  const before = b < 120 ? `${Math.floor(b)} s` : b < 7200 ? `${Math.floor(b / 60)} min` : `${floor(b / 3600, 1)} h`;
  return `Up ${up} at first command, at least ${before} before the create began: likely a pool or snapshot`;
}

/** The errnos a full or refusing disk returns, by name. */
const errnoNames: Record<number, string> = { 28: "no space left", 12: "out of memory", 5: "I/O error", 27: "file too large", 122: "quota exceeded" };
export const errnoText = (errno: number) => errnoNames[errno] ?? `errno ${errno}`;

const phaseText = (phase: string) => (phase === "filled" ? "filling memory" : phase === "file" || phase === "file-failed" ? "writing the file" : phase === "start" ? "starting" : phase);

/** The isolation layer in words: "Container in a VM", "microVM". */
export const isolationText = (r: SecurityResult) => `${isolationLabel[r.isolation]}${r.isolation === "container" && r.insideVm ? " in a VM" : ""}`;

/** Who commands run as: "root", "uid 1000, passwordless sudo". */
export const runsAsText = (r: SecurityResult) => (r.uid === null ? "not readable" : r.uid === 0 ? "root" : `uid ${r.uid}${r.passwordlessSudo ? ", passwordless sudo" : ""}`);

/** The kernel's vulnerability lines that start with Vulnerable, or why there are none to show. */
export const vulnerableText = (r: SecurityResult) =>
  r.vulnerabilityFiles === 0 ? "not listed by the kernel" : r.vulnerable.length === 0 ? `none of ${r.vulnerabilityFiles}` : r.vulnerable.map((v) => `${v.name}: ${v.status}`).join("; ");

/** The memory test in a few words. */
export function memoryOutcomeText(r: MemoryResult): string {
  const o = r.outcome;
  switch (o.kind) {
    case "completed":
      return `Held ${gibText(r.memoryMiB / 1024)} and wrote ${gibText(r.fileMiB / 1024)}${o.swapUsedMiB > 0 ? `, ${Math.round(o.swapUsedMiB)} MiB went to swap` : ""}`;
    case "file-failed":
      return `Held ${gibText(r.memoryMiB / 1024)}; the ${gibText(r.fileMiB / 1024)} file stopped at ${o.writtenMiB} MiB${o.errno !== null ? ` (${errnoText(o.errno)})` : ""}`;
    case "killed":
      return `Killed${o.lastPhase ? ` after ${phaseText(o.lastPhase)}` : ""}${o.oomKills ? " by the out-of-memory killer" : o.exitCode !== null ? ` (exit ${o.exitCode})` : ""}`;
    case "refused":
      return `Could not allocate ${gibText(r.memoryMiB / 1024)}`;
    case "sandbox-lost":
      return `The sandbox stopped answering${o.lastPhase ? ` after ${phaseText(o.lastPhase)}` : ""}`;
    default: {
      const _exhaustive: never = o;
      return _exhaustive;
    }
  }
}

/** "640 MiB" under a GiB, else "7.6 GiB". */
export const mibText = (mib: number) => (mib < 1024 ? `${Math.round(mib)} MiB` : gibText(mib / 1024));

/** "59.1 ms", "495 ms", "1.1 s", "18 s". */
export const msText = (ms: number) => (ms < 1000 ? formatValue(ms, "ms") : formatValue(ms / 1000, "s"));

/** No verdict, in words that never read as the provider's failure. */
const noVerdict = (why: string) => `No verdict: ${why}`;

const stageText: Record<(typeof pauseStages)[number], string> = { pause: "the pause", resume: "the resume", "first-command": "the first command after resume" };

/** What a pause and resume did, in a few words; a verdict's own note is shown beside it, not here. */
export function suspendText(r: StateResult): string {
  const s = r.suspend;
  switch (s.kind) {
    case "unsupported":
      return "Not tested: our SDK adapter has no pause for it";
    case "failed":
      return noVerdict(`${stageText[s.stage]} didn't complete (${s.error})`);
    case "measured":
      switch (s.verdict) {
        case "in-ram":
          return "Memory and processes intact, frozen during the pause";
        case "kept-running":
          return "Kept running through the pause, memory and processes intact";
        case "cold-restart":
          return s.bootSame === false ? "Booted again: files kept, running processes gone" : "Files kept, running processes gone";
        case "files-lost":
          return "Files lost";
        case "inconclusive":
          return noVerdict(s.reason ?? "the evidence didn't settle it");
        default: {
          const _exhaustive: never = s.verdict;
          return _exhaustive;
        }
      }
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

/** The note the check gave a verdict other than inconclusive, such as a changed boot ID it weighed; null otherwise. */
export const verdictNote = (r: StateResult) => (r.suspend.kind === "measured" && r.suspend.verdict !== "inconclusive" ? r.suspend.reason : null);

/** Whether the pause settled what survives: a measured verdict other than inconclusive. */
export const hasVerdict = (r: StateResult) => r.suspend.kind === "measured" && r.suspend.verdict !== "inconclusive";

/** Time from resume until the server served again: observed, or composed for one started again. */
export function servingText(r: StateResult): string | null {
  const s = r.suspend;
  if (s.kind !== "measured") return null;
  if (s.servingMs !== null) return msText(s.servingMs);
  if (s.coldServeMs !== null) return `about ${msText(s.coldServeMs)}, started again`;
  return "didn't serve again";
}

/** How far the hog got: exact from its log; "at least" from the last poll, rounded down so the bound never exceeds what was seen. */
export function reachedText(r: PressureResult): string {
  if (r.reached === null) return "nothing observed";
  const of = mibText(r.advertisedMiB);
  if (r.reached.evidence === "log") return `${mibText(r.reached.mib)} (${percentText(r.reached.fraction)} of ${of})`;
  const mib = r.reached.mib;
  const held = mib < 1024 ? `${Math.floor(mib)} MiB` : `${Math.floor((mib / 1024) * 10) / 10} GiB`;
  return `at least ${held} (${Math.floor((mib / r.advertisedMiB) * 100)}% of ${of})`;
}

/** What stopped the hog, in a few words. */
export function pressureOutcomeText(r: PressureResult): string {
  const o = r.outcome;
  switch (o.kind) {
    case "reached-target":
      return `Held all ${mibText(r.targetMiB)}, ${OVERSHOOT}× the advertised memory`;
    case "process-killed":
      return "The process was killed (SIGKILL)";
    case "refused":
      return `The allocation was refused (${o.reason})`;
    case "sandbox-restarted":
      return "The sandbox rebooted";
    case "sandbox-lost":
      return "The sandbox ended: the provider reported it gone";
    case "inconclusive":
      return noVerdict(o.reason);
    default: {
      const _exhaustive: never = o;
      return _exhaustive;
    }
  }
}

/** What else the hog took down, as far as the canary process shows; how the hog stopped is the outcome's, and a lost sandbox claims no cause. */
export function scopeText(r: PressureResult): string {
  switch (r.scope) {
    case "process":
      return "The canary process stayed alive";
    case "collateral":
      return "The canary process was gone too";
    case "sandbox":
      return r.outcome.kind === "sandbox-lost" ? "The provider reported the sandbox gone; the cause isn't known" : "The whole sandbox rebooted";
    case null:
      return "Not determined";
    default: {
      const _exhaustive: never = r.scope;
      return _exhaustive;
    }
  }
}

/** Whether a fresh allocation and a file write worked afterwards. */
export const usableAfterText = (r: PressureResult) => (r.usableAfter === null ? "Not measured" : r.usableAfter ? "Yes" : "No");
