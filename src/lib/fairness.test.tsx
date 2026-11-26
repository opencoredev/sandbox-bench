import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import raw from "@/data/fairness.json";
import { FairnessSection, IsolationTable } from "@/components/fairness";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { completed, hasFairness, hasVerdict, readableReason, verdictNote, heldShare, memoryOutcomeText, parseFairness, pressureOutcomeText, reachedText, SCHEMA, scopeText, servingText, suspendText, uptimeText } from "@/lib/fairness";
import type { FairnessData, MemoryResult, SecurityResult } from "@/lib/fairness";
import { fairnessData, fairnessLlms, fairnessMarkdown } from "@/lib/fairness-agent";
import { fairness } from "@/lib/fairness-data";
import { addLaterRun, archFrom, checkFromReport, gvisorDiskWhy, markGvisorDisk, plainReason } from "../../scripts/fairness-site-data";

// The like-for-like checks: the file's parser, the site-data script, the section and the exports. Run with `bun test`.

const run = { id: "r", sdkCommit: "137e55f0000000", startedAt: "2026-11-24T05:00:00.000Z" };
const machine = { cpu: 4, memoryGiB: 8, sameSize: true };
const big = { cpu: 4, memoryGiB: 16, sameSize: false };

const cpu = (allCoreOps: number, retention = 1) => ({
  cpuModel: "AMD EPYC",
  guestVcpus: 4,
  singleOps: allCoreOps / 4,
  allCoreOps,
  scaling: 1,
  first3MinOps: allCoreOps,
  last3MinOps: allCoreOps * retention,
  retention,
  sustained: Array.from({ length: 30 }, (_, i) => ({ minute: (i + 1) / 2, opsPerS: i < 24 ? allCoreOps : allCoreOps * retention })),
});

const disk = (fsType: string, comparable: boolean, why: string | null = null) => ({
  fsType,
  memoryBacked: fsType === "tmpfs",
  comparable,
  notComparableWhy: why,
  directory: "/root",
  sizeMiB: 2048,
  seqWriteMiBps: 900,
  seqReadMiBps: 1800,
  randWriteIops: 9000,
  randWriteP99Us: 300,
  randReadIops: 12000,
  randReadP99Us: 150,
  direct: { seqWrite: true, seqRead: true, randWrite: true, randRead: true },
});

const memory = (visibleCpus: number, outcome: object) => ({
  visibleCpus,
  usableCpus: 4,
  quotaCpus: visibleCpus > 4 ? 4 : null,
  cpusOverReported: visibleCpus > 4,
  memTotalGiB: visibleCpus > 4 ? 247 : 7.8,
  memLimitGiB: 8,
  swapTotalGiB: 0,
  memoryMiB: 6144,
  fileMiB: 2048,
  outcome,
});

const security = (isolation: string, extra: object = {}) => ({
  isolation,
  evidence: ["DMI: Cloud Hypervisor"],
  insideVm: null,
  kernel: "Linux 6.1 x86_64",
  cpu: { vendor: "AuthenticAMD", family: 25, model: 33, modelName: "AMD EPYC", mhz: 3400 },
  weakeningFlags: [],
  notableFlags: [],
  vulnerable: [],
  vulnerabilityFiles: 17,
  uid: 0,
  passwordlessSudo: false,
  createS: 0.4,
  uptimeS: 3.1,
  bootedBeforeCreateS: 2.5,
  ...extra,
});

const measured = (verdict: string, extra: object = {}) => ({
  kind: "measured",
  verdict,
  reason: null,
  holdMs: 60_000,
  pauseMs: 300,
  resumeMs: 400,
  firstCommandMs: 150,
  servingMs: 450,
  serverRestarted: false,
  coldServeMs: null,
  bootSame: true,
  ...extra,
});

const state = (samplesMs: number[], suspend: object) => {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return { restart: { medianMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, samplesMs, failures: 0, startsOnly: 0 }, suspend };
};

const pressure = (outcome: object, reached: { evidence: string; mib: number } | null, extra: object = {}) => {
  const advertisedMiB = (extra as { advertisedMiB?: number }).advertisedMiB ?? 8192;
  return {
    advertisedMiB,
    targetMiB: advertisedMiB * 1.5,
    reached: reached === null ? null : { ...reached, fraction: Number((reached.mib / advertisedMiB).toFixed(3)) },
    outcome,
    scope: "process",
    usableAfter: true,
    swapTotalGiB: 0,
    ...extra,
  };
};

const fixture = () => ({
  schema: SCHEMA,
  generatedAt: "2026-11-24T06:00:00.000Z",
  track: "same-machine",
  arch: { e2b: "x86_64", upstash: "aarch64", styne: "x86_64" },
  checks: {
    "cpu-native": {
      run,
      entries: [
        { provider: "e2b", machine, status: "completed", reason: null, result: cpu(3e9) },
        { provider: "styne", machine, status: "completed", reason: null, result: cpu(5e9, 0.16) },
        { provider: "upstash", machine, status: "completed", reason: null, result: cpu(5.5e9) },
        { provider: "superserve", machine, status: "failed", reason: "Created 0 of 1 sandboxes: HTTP 402 billing_ineligible", result: null },
      ],
    },
    "disk-real": {
      run,
      entries: [
        { provider: "e2b", machine, status: "completed", reason: null, result: disk("ext4", true) },
        { provider: "modal", machine, status: "completed", reason: null, result: disk("overlay", false, gvisorDiskWhy) },
        { provider: "boxd", machine: big, status: "completed", reason: null, result: disk("ext4", true) },
      ],
    },
    "memory-honesty": {
      run,
      entries: [
        { provider: "upstash", machine, status: "completed", reason: null, result: memory(64, { kind: "completed", fillGiBps: 3, verifyGiBps: 4, fileMiBps: 1200, swapUsedMiB: 0 }) },
        { provider: "e2b", machine, status: "completed", reason: null, result: memory(4, { kind: "killed", lastPhase: "file", exitCode: 137, oomKills: 1 }) },
      ],
    },
    "security-probe": {
      run,
      entries: [
        { provider: "styne", machine, status: "completed", reason: null, result: security("cloud-hypervisor", { weakeningFlags: ["spec_rstack_overflow=off"], notableFlags: ["cpuidle_haltpoll.force=1"], vulnerable: [{ name: "tsa", status: "Vulnerable: No microcode" }], uptimeS: 83000, bootedBeforeCreateS: 82999 }) },
        { provider: "boat", machine, status: "completed", reason: null, result: security("vm", { weakeningFlags: ["spec_rstack_overflow=off", "init_on_free=0"] }) },
        { provider: "modal", machine, status: "completed", reason: null, result: security("gvisor", { vulnerabilityFiles: 0 }) },
      ],
    },
    "state-survival": {
      run,
      entries: [
        { provider: "e2b", machine, status: "completed", reason: null, result: state([130, 160, 117, 122, 113], measured("in-ram")) },
        { provider: "upstash", machine, status: "completed", reason: null, result: state([86, 92, 87, 88, 87.6], measured("cold-restart", { servingMs: null, serverRestarted: true, coldServeMs: 220 })) },
        { provider: "tenki", machine, status: "completed", reason: null, result: state([101, 87, 68, 92, 88], measured("in-ram", { bootSame: false, servingMs: 358, reason: "the boot id changed, but the original processes kept their memory" })) },
        { provider: "daytona", machine, status: "completed", reason: null, result: state([101, 102, 100, 105, 98], { kind: "unsupported" }) },
        { provider: "freestyle", machine, status: "completed", reason: null, result: state([161, 175, 136, 168, 122], measured("inconclusive", { reason: "no heartbeat count across the hold" })) },
        { provider: "styne", machine, status: "completed", reason: null, result: state([57, 65, 59, 56, 61], { kind: "failed", stage: "resume", error: "resume timed out after 300 s" }) },
        { provider: "beam", machine, status: "failed", reason: "Process cancellation could not be confirmed", result: null },
      ],
    },
    "memory-pressure": {
      run,
      entries: [
        { provider: "e2b", machine, status: "completed", reason: null, result: pressure({ kind: "process-killed" }, { evidence: "log", mib: 7744 }) },
        { provider: "modal", machine, status: "completed", reason: null, result: pressure({ kind: "sandbox-lost" }, { evidence: "last-poll", mib: 640 }, { scope: "sandbox", usableAfter: false }) },
        { provider: "freestyle", machine, status: "completed", reason: null, result: pressure({ kind: "inconclusive", reason: "the hog and its supervisor are gone with no status" }, { evidence: "last-poll", mib: 7616 }, { scope: null, usableAfter: null }) },
        { provider: "boxd", machine: big, status: "completed", reason: null, result: pressure({ kind: "process-killed" }, { evidence: "log", mib: 16640 }, { advertisedMiB: 16384, swapTotalGiB: 1 }) },
      ],
    },
  },
});

const parsed = () => parseFairness(fixture());

describe("parse", () => {
  test("the committed file parses", () => {
    assert.doesNotThrow(() => parseFairness(raw));
    assert.equal(typeof hasFairness(fairness), "boolean");
  });

  test("a full fixture parses, and an empty one shows nothing", () => {
    const d = parsed();
    assert.equal(hasFairness(d), true);
    assert.equal(completed(d.cpuNative).length, 3);
    const empty = parseFairness({ schema: SCHEMA, generatedAt: "2026-11-24T00:00:00.000Z", track: "same-machine", arch: {}, checks: {} });
    assert.equal(hasFairness(empty), false);
    assert.equal(renderToStaticMarkup(<FairnessSection data={empty} />), "");
  });

  const broken = (change: (f: ReturnType<typeof fixture>) => void) => {
    const f = fixture();
    change(f);
    return () => parseFairness(f);
  };

  test("refuses data that contradicts itself", () => {
    assert.throws(broken((f) => (f.checks["cpu-native"].entries[0]!.result!.retention = 0.5)), /retention/);
    assert.throws(
      broken((f) => {
        f.checks["cpu-native"].entries[0]!.result!.sustained = f.checks["cpu-native"].entries[0]!.result!.sustained.map((x, i) => ({ ...x, minute: ((i + 1) * 33) / 60 }));
      }),
      /scheduled minute/,
    );
    assert.throws(
      broken((f) => {
        const r = f.checks["cpu-native"].entries[0]!.result!;
        r.last3MinOps = r.first3MinOps / 2;
        r.retention = 0.5;
      }),
      /last six windows/,
    );
    assert.throws(broken((f) => ((f.checks["disk-real"].entries[0]!.result as { sizeMiB: number }).sizeMiB = 1024)), /2048/);
    assert.throws(broken((f) => ((f.checks["disk-real"].entries[1]!.result as { comparable: boolean; notComparableWhy: string | null }) = Object.assign(f.checks["disk-real"].entries[1]!.result!, { comparable: true, notComparableWhy: null }))), /gVisor/);
    assert.throws(broken((f) => (f.checks["cpu-native"].entries[0]!.result!.scaling = 0.5)), /scaling/);
    assert.throws(broken((f) => ((f.checks["disk-real"].entries[1]!.result as { comparable: boolean }).comparable = true)), /notComparableWhy/);
    assert.throws(broken((f) => ((f.checks["memory-honesty"].entries[0]!.result as { cpusOverReported: boolean }).cpusOverReported = false)), /cpusOverReported/);
    assert.throws(broken((f) => (f.checks["disk-real"].entries[2]!.machine = { cpu: 4, memoryGiB: 16, sameSize: true })), /sameSize/);
    assert.throws(broken((f) => (f.checks["cpu-native"].entries[3]!.result = cpu(1))), /must be null/);
    assert.throws(broken((f) => f.checks["cpu-native"].entries.push(f.checks["cpu-native"].entries[0]!)), /twice/);
    assert.throws(broken((f) => ((f.checks["security-probe"].entries[0]!.result as { vulnerable: object[] }).vulnerable = [{ name: "x", status: "Mitigation: y" }])), /Vulnerable/);
    assert.throws(broken((f) => ((f.arch as Record<string, string>).e2b = "riscv64")), /arch/);
  });
});

describe("rules", () => {
  test("memory outcomes read in plain words", () => {
    const base = parsed().memoryHonesty!;
    const [upstash, e2b] = completed(base);
    assert.match(memoryOutcomeText(upstash!.result), /^Held 6 GiB and wrote 2 GiB$/);
    assert.match(memoryOutcomeText(e2b!.result), /Killed after writing the file by the out-of-memory killer/);
    const failed: MemoryResult = { ...e2b!.result, outcome: { kind: "file-failed", errno: 28, writtenMiB: 900, swapUsedMiB: 0 } };
    assert.match(memoryOutcomeText(failed), /stopped at 900 MiB \(no space left\)/);
  });

  test("held compares the last 3 minutes with the four-core run, so an early drop still shows", () => {
    const styne = completed(parsed().cpuNative!).find((e) => e.provider === "styne")!.result;
    assert.equal(Number(heldShare(styne).toFixed(2)), 0.16);
    const dropped = { ...styne, first3MinOps: styne.last3MinOps, retention: 1 };
    assert.equal(Number(heldShare(dropped).toFixed(2)), 0.16);
  });

  test("uptime says whether the sandbox booted for the create", () => {
    const s = completed(parsed().securityProbe!);
    const styne = s.find((e) => e.provider === "styne")!.result;
    const boat = s.find((e) => e.provider === "boat")!.result;
    assert.match(uptimeText(styne), /23.1 h at first command, at least 23 h before the create began: likely a pool or snapshot/);
    assert.match(uptimeText(boat), /3.1 s at first command, at least 2.5 s before the create began/);
    assert.match(uptimeText({ ...boat, bootedBeforeCreateS: -0.8 }), /boot timing undetermined/);
    assert.match(uptimeText({ ...boat, uptimeS: 0.2, createS: 0.4, bootedBeforeCreateS: -0.5 }), /booted during the create/);
    assert.match(uptimeText({ ...boat, uptimeS: 60, bootedBeforeCreateS: 59.9 }), /at least 59 s before/);
    assert.match(uptimeText({ ...boat, isolation: "container", uptimeS: 900_000 }), /host's uptime \(10 days\)/);
    const unreadable: SecurityResult = { ...boat, uptimeS: null };
    assert.equal(uptimeText(unreadable), "Uptime not readable");
  });
});

describe("site-data script", () => {
  const report = (check: string, providers: object[]) => ({ schema: "fairness.v1", check, track: "same-machine", generatedAt: "x", run, providers });

  test("marks gVisor disks not comparable from the probe, and reads each arch", () => {
    const checks: Record<string, unknown> = {
      "security-probe": { run, entries: [{ provider: "modal", result: { isolation: "gvisor", kernel: "Linux 4.4.0 x86_64" } }, { provider: "upstash", result: { isolation: "container", kernel: "Linux 7.0 aarch64" } }] },
      "disk-real": { run, entries: [{ provider: "modal", result: { comparable: true, notComparableWhy: null } }, { provider: "upstash", result: { comparable: true, notComparableWhy: null } }] },
    };
    markGvisorDisk(checks);
    const entries = (checks["disk-real"] as { entries: { provider: string; result: { comparable: boolean; notComparableWhy: string | null } }[] }).entries;
    assert.deepEqual(entries.map((e) => e.result.comparable), [false, true]);
    assert.equal(entries[0]!.result.notComparableWhy, gvisorDiskWhy);
    assert.deepEqual(archFrom(checks), { modal: "x86_64", upstash: "aarch64" });
  });

  test("converts a harness report and keeps no sandbox ids or home paths", () => {
    const { check, data } = checkFromReport(
      report("disk-real", [
        {
          provider: "e2b",
          status: "completed",
          reason: null,
          machine,
          sandboxes: [{ id: "secret-sandbox-id", createS: 1 }],
          result: { ...disk("ext4", true), directory: "/home/leo/work", seqWriteDirect: true, seqReadDirect: true, randWriteDirect: true, randReadDirect: true, raw: { seed: 1 } },
        },
        { provider: "baseten", status: "failed", reason: "Created 0 of 1\n  sandboxes", machine, result: null },
      ]),
    );
    assert.equal(check, "disk-real");
    const text = JSON.stringify(data);
    assert.doesNotMatch(text, /secret-sandbox-id|\/home\/leo|"raw"/);
    assert.match(text, /"directory":"~\/work"/);
    assert.match(text, /Created 0 of 1 sandboxes/);
    const probe = checkFromReport(
      report("security-probe", [
        { provider: "e2b", status: "completed", reason: null, machine, result: { ...security("microvm"), isolation: { kind: "microvm", evidence: ["mounted /tmp/sbx-6f1b0698aa214acf57847da555 by user leo-secret"], insideVm: null }, cpu: { vendor: "x", family: 1, model: 1, modelName: "CPU 0f8fad5b-d9cb-469f-a165-70867728950e", mhz: 1 }, vulnerabilities: [], uptimeAtFirstCommandS: 1, bootedBeforeCreateS: 0 } },
      ]),
    );
    assert.doesNotMatch(JSON.stringify(probe.data), /6f1b0698aa214acf57847da555|0f8fad5b-d9cb/);
    assert.equal(plainReason("word ".repeat(80)).length, 240);
    const scrubbed = plainReason("Create failed for /home/leo/work/x (sandbox sb-01M8604F365C5Q09VVMZWH58H2, attempt 610c6d1847fc, boot 0f8fad5b-d9cb-469f-a165-70867728950e, seed 2654435760): HTTP 400");
    assert.doesNotMatch(scrubbed, /leo|01M8604F|610c6d1847fc|0f8fad5b|2654435760/);
    assert.match(scrubbed, /HTTP 400/);
    assert.throws(() => checkFromReport({ ...report("disk-real", []), track: "default" }), /same-machine/);
  });

  test("a failure on our side is published as not run, never as the provider's", () => {
    const keyRejected = "Created 0 of 1 sandboxes, fewer than the 1 this check needs: Baseten request failed: the credentials are missing or were rejected. Check Baseten and retry.";
    const billing = "Created 0 of 1 sandboxes, fewer than the 1 this check needs: Superserve POST /sandboxes failed (HTTP 402 billing_ineligible).";
    const entries = [
      { provider: "baseten", status: "failed", reason: `${keyRejected} sentinel-x9Q`, machine, sandboxes: [], result: null },
      { provider: "superserve", status: "failed", reason: billing, machine, sandboxes: [], result: null },
      { provider: "daytona", status: "failed", reason: "Created 1 of 10 sandboxes, fewer than the 2 this check needs: Daytona POST /sandbox failed (HTTP 400).", machine, sandboxes: [{ id: "d1", createS: 0.3 }], result: null },
    ];
    const thrown = (f: () => unknown) => {
      try {
        f();
      } catch (err) {
        return (err as Error).message;
      }
      assert.fail("expected a throw");
    };
    const ours = thrown(() => checkFromReport(report("cpu-native", entries)));
    assert.match(ours, /baseten in cpu-native: its reason reads as a problem on our side; mark it --not-run baseten=/);
    assert.doesNotMatch(ours, /sentinel|credentials|Check Baseten/);
    assert.throws(() => checkFromReport(report("cpu-native", entries), new Map([["baseten", "our API key was rejected"]])), /superserve in cpu-native: its reason reads as a problem on our side/);
    assert.throws(() => checkFromReport(report("cpu-native", entries), new Map([["baseten", "x"], ["superserve", "y"], ["daytona", "z"]])), /--not-run daytona: cpu-native.sandboxes lists 1 created, so it ran/);
    assert.throws(() => checkFromReport(report("cpu-native", [{ ...entries[1]!, sandboxes: undefined }]), new Map([["superserve", "x"]])), /--not-run superserve: cpu-native.sandboxes is missing/);
    const notRun = new Map([
      ["baseten", "our API key was rejected"],
      ["superserve", "our account wasn't eligible for billing (HTTP 402)"],
    ]);
    const { data } = checkFromReport(report("cpu-native", entries), notRun);
    assert.deepEqual(
      (data.entries as { provider: string; status: string; reason: string }[]).map((e) => [e.provider, e.status, e.reason]),
      [
        ["baseten", "not-run", "our API key was rejected"],
        ["superserve", "not-run", "our account wasn't eligible for billing (HTTP 402)"],
        ["daytona", "failed", "Created 1 of 10 sandboxes, fewer than the 2 this check needs: Daytona POST /sandbox failed (HTTP 400)."],
      ],
    );
    assert.throws(() => checkFromReport(report("cpu-native", [{ provider: "baseten", status: "completed", reason: null, machine, result: cpu(4e9) }]), notRun), /--not-run baseten: it completed cpu-native/);

    const f = fixture();
    f.checks["cpu-native"].entries = [
      ...f.checks["cpu-native"].entries.filter((e) => e.provider !== "superserve"),
      { provider: "baseten", machine, status: "not-run", reason: "our API key was rejected", result: null },
      { provider: "daytona", machine, status: "failed", reason: "Daytona POST /sandbox failed (HTTP 400).", result: null },
    ] as (typeof f.checks)["cpu-native"]["entries"];
    const d = parseFairness(f);
    const text = renderToStaticMarkup(<FairnessSection data={d} />).replace(/<[^>]+>/g, "");
    assert.ok(text.includes("Baseten: not run (our API key was rejected)."));
    assert.ok(text.includes("Daytona: no result (Daytona POST /sandbox failed (HTTP 400).)."));
    assert.match(text, /Not run: Baseten\. Notes says why\./);
    assert.match(text, /No result for Daytona\. Notes says why\./);
    assert.doesNotMatch(text, /Baseten: no result|No result for Baseten/);
    assert.deepEqual(fairnessData(d).cpuNative?.noResult.find((m) => m.provider === "baseten"), { provider: "baseten", name: "Baseten", status: "not-run", why: "our API key was rejected" });
    for (const out of [fairnessMarkdown(d).join("\n"), fairnessLlms(d)]) {
      assert.match(out, /Baseten: not run \(our API key was rejected\)/);
      assert.match(out, /Daytona: no result/);
      assert.doesNotMatch(out, /Baseten: no result/);
    }
  });

  test("a provider added from its own later run carries that run, and the section and exports name it", () => {
    const later = { id: "cpu-native-later", sdkCommit: "27f304a8c8db", startedAt: "2026-11-24T08:23:48.000Z" };
    const f = fixture();
    const checks = f.checks as unknown as Record<string, unknown>;
    addLaterRun(checks, checkFromReport({ ...report("cpu-native", [{ provider: "maritime", status: "completed", reason: null, machine, result: { ...cpu(4e9), single: { medianOps: 1e9 }, allCore: { medianOps: 4e9 }, sustained: { first3MinOps: 4e9, last3MinOps: 4e9, segments: cpu(4e9).sustained.map((s) => ({ minute: s.minute, opsPerSec: s.opsPerS })) } } }]), run: later }), "later.json");
    assert.throws(() => addLaterRun(checks, checkFromReport({ ...report("cpu-native", [{ provider: "maritime", status: "failed", reason: "x", machine, result: null }]), run: later }), "again.json"), /already in cpu-native/);
    assert.throws(() => addLaterRun({}, checkFromReport({ ...report("cpu-native", []), run: later }), "none.json"), /no --report for cpu-native/);
    const d = parseFairness(f);
    const added = d.cpuNative?.entries.find((e) => e.provider === "maritime");
    assert.deepEqual(added?.run, later);
    assert.ok(d.cpuNative?.entries.every((e) => e.provider === "maritime" || e.run === null));
    const html = renderToStaticMarkup(<FairnessSection data={d} />);
    assert.match(html, /Maritime on Nov 24, 2026 in its own run \(cpu-native-later, SDK commit 27f304a\)/);
    assert.deepEqual(fairnessData(d).cpuNative?.results.find((r) => r.provider === "maritime")?.run, later);
    const own = structuredClone(f);
    Object.assign(own.checks["cpu-native"].entries.at(-1) ?? {}, { run });
    assert.throws(() => parseFairness(own), /run is the check's own/);
  });
});

describe("section", () => {
  const d: FairnessData = parsed();
  const html = renderToStaticMarkup(<FairnessSection data={d} />);

  test("draws a tab per check with results, comparable rows first", () => {
    for (const tab of ["Native CPU", "Held 15 min", "Disk read", "Disk synced writes", "CPUs and memory"]) assert.match(html, new RegExp(tab));
    assert.doesNotMatch(html, /10 at once/);
  });

  test("names every caveat neutrally", () => {
    assert.match(html, /runs on ARM \(aarch64\)/);
    assert.match(html, /asked for 4 vCPU, 16 GiB, its nearest size/);
    assert.match(html, /gVisor/);
    assert.match(html, /Superserve/);
    assert.doesNotMatch(html, /\b(cheat|gaming|fake|lying|dishonest)\b/i);
  });

  test("the isolation table asks every provider the same questions", () => {
    const table = renderToStaticMarkup(<IsolationTable data={d} />);
    for (const name of ["Styne", "Boat", "Modal"]) assert.match(table, new RegExp(name));
    // Mitigation flags show for every provider that has them, not one.
    assert.equal((table.match(/spec_rstack_overflow=off/g) ?? []).length >= 2, true);
    assert.match(table, /not listed by the kernel/);
    assert.doesNotMatch(table, /\b(cheat|gaming|fake|lying)\b/i);
  });
});

describe("exports", () => {
  const d = parsed();

  test("results.json, results.md and llms.txt carry the checks", () => {
    const json = fairnessData(d);
    assert.equal(json.cpuNative?.results[0]?.provider, "upstash");
    assert.equal(json.cpuNative?.results[0]?.arch, "aarch64");
    assert.equal(json.diskReal?.results.at(-1)?.provider, "modal");
    assert.deepEqual(json.cpuNative?.noResult.map((m) => m.provider), ["superserve"]);
    const md = fairnessMarkdown(d).join("\n");
    assert.match(md, /# Like-for-like checks/);
    assert.match(md, /\| Upstash Box \(ARM\) \|/);
    assert.match(md, /no: the sandbox runs under gVisor/);
    const llms = fairnessLlms(d);
    assert.match(llms, /## Like-for-like checks/);
    assert.match(llms, /`likeForLike` in results.json/);
  });

  test("the live exports include the section exactly when the file has results", () => {
    const has = hasFairness(fairness);
    assert.equal("likeForLike" in agentData(), has);
    assert.equal(agentMarkdown().includes("# Like-for-like checks"), has);
    assert.equal(llmsTxt().includes("## Like-for-like checks"), has);
  });
});

describe("state survival and memory pressure", () => {
  const d = parsed();
  const report = (check: string, providers: object[]) => ({ schema: "fairness.v1", check, track: "same-machine", generatedAt: "x", run, providers });
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  const broken = (change: (f: ReturnType<typeof fixture>) => void) => {
    const f = fixture();
    change(f);
    return () => parseFairness(f);
  };
  const stateAt = (f: ReturnType<typeof fixture>, i: number) => f.checks["state-survival"].entries[i]!.result as unknown as Record<string, Record<string, unknown>>;
  const pressureAt = (f: ReturnType<typeof fixture>, i: number) => f.checks["memory-pressure"].entries[i]!.result as unknown as Record<string, unknown>;

  test("both checks parse, and contradictions stop the build", () => {
    assert.equal(completed(d.stateSurvival).length, 6);
    assert.equal(completed(d.memoryPressure).length, 4);
    assert.throws(broken((f) => (stateAt(f, 0).restart!.medianMs = 999)), /not the median/);
    assert.throws(broken((f) => (stateAt(f, 0).restart!.samplesMs = [])), /no restart was timed/);
    assert.throws(broken((f) => (stateAt(f, 4).suspend!.reason = null)), /must say why the verdict is inconclusive/);
    assert.throws(broken((f) => (stateAt(f, 0).suspend!.holdMs = 30_000)), /60000/);
    assert.throws(broken((f) => (stateAt(f, 1).suspend!.coldServeMs = null)), /started again/);
    assert.throws(broken((f) => (stateAt(f, 0).suspend!.verdict = "survived")), /verdict/);
    assert.throws(broken((f) => (pressureAt(f, 0).targetMiB = 16384)), /1.5/);
    assert.throws(broken((f) => ((pressureAt(f, 0).reached as { fraction: number }).fraction = 0.5)), /fraction/);
    assert.throws(broken((f) => (pressureAt(f, 1).scope = "process")), /must be sandbox for sandbox-lost/);
    assert.throws(broken((f) => (f.checks["memory-pressure"].entries[3]!.machine = machine)), /advertises 16384 MiB, not its machine's 8 GiB/);
    assert.throws(broken((f) => (pressureAt(f, 0).outcome = { kind: "reached-target" })), /whole target/);
    assert.throws(broken((f) => (f.checks["memory-pressure"].entries[0]!.provider = "acme")), /not a known provider: acme/);
  });

  test("an inconclusive or failed pause is no verdict, never the provider's failure", () => {
    const by = (id: string) => completed(d.stateSurvival).find((e) => e.provider === id)!.result;
    assert.equal(suspendText(by("e2b")), "Memory and processes intact, frozen during the pause");
    assert.equal(suspendText(by("upstash")), "Files kept, running processes gone");
    assert.equal(suspendText(by("tenki")), "Memory and processes intact, frozen during the pause");
    assert.equal(verdictNote(by("tenki")), "the boot id changed, but the original processes kept their memory");
    assert.equal(verdictNote(by("freestyle")), null, "an inconclusive reason is no verdict, not a note");
    assert.match(suspendText(by("daytona")), /^Not tested: our SDK adapter has no pause/);
    assert.equal(suspendText(by("freestyle")), "No verdict: no heartbeat count across the hold");
    assert.equal(suspendText(by("styne")), "No verdict: the resume didn't complete (resume timed out after 300 s)");
    for (const id of ["freestyle", "styne", "daytona"]) assert.equal(hasVerdict(by(id)), false);
    assert.equal(servingText(by("e2b")), "450 ms");
    assert.equal(servingText(by("upstash")), "about 220 ms, started again");
    assert.equal(servingText(by("daytona")), null);
  });

  test("a last-poll figure reads as at least, a logged one as exact", () => {
    const by = (id: string) => completed(d.memoryPressure).find((e) => e.provider === id)!.result;
    assert.equal(reachedText(by("e2b")), "7.6 GiB (95% of 8 GiB)");
    assert.equal(reachedText(by("modal")), "at least 640 MiB (8% of 8 GiB)");
    assert.equal(pressureOutcomeText(by("freestyle")), "No verdict: the hog and its supervisor are gone with no status");
    assert.equal(scopeText(by("freestyle")), "Not determined");
    assert.match(pressureOutcomeText(by("modal")), /provider reported it gone/);
    assert.match(pressureOutcomeText(by("e2b")), /killed \(SIGKILL\)/);
  });

  test("a harness \"no answer for N ms\" reads in minutes, or seconds under 90 s", () => {
    assert.equal(readableReason("no answer for 242146 ms"), "the sandbox didn't answer for about 4 min");
    assert.equal(readableReason("no answer for 45000 ms"), "the sandbox didn't answer for about 45 s");
    assert.equal(readableReason("no answer for 89400 ms"), "the sandbox didn't answer for about 89 s");
    assert.equal(readableReason("the hog and its supervisor are gone with no status"), "the hog and its supervisor are gone with no status");
    const f = fixture();
    (f.checks["memory-pressure"].entries[2]!.result as unknown as { outcome: object }).outcome = { kind: "inconclusive", reason: "no answer for 242146 ms" };
    const freestyle = completed(parseFairness(f).memoryPressure).find((e) => e.provider === "freestyle")!.result;
    assert.equal(pressureOutcomeText(freestyle), "No verdict: the sandbox didn't answer for about 4 min");
  });

  test("the site-data script keeps only the figures the page uses, scrubbed", () => {
    const raw = {
      runtime: "node",
      workdir: "/home/leo/sandbox/attempt-610c6d1847fc",
      fileMiB: 16,
      setupMs: 900,
      restart: { samplesMs: [130, 160, 117], medianMs: 130, failures: 0, startsOnly: 0 },
      suspend: { ...measured("inconclusive", { reason: "pid file /home/leo/x unreadable" }), filesystem: true, worker: { same: true }, server: { answered: true } },
      stopStart: { kind: "not-run", reason: "no portable call" },
    };
    const { check, data } = checkFromReport(report("state-survival", [{ provider: "e2b", status: "completed", reason: null, machine, sandboxes: [{ id: "sb-01M8604F365C5Q09VVMZWH58H2" }], result: raw }]));
    assert.equal(check, "state-survival");
    const out = JSON.stringify(data);
    assert.doesNotMatch(out, /\/home\/leo|610c6d1847fc|01M8604F|workdir|worker|stopStart|setupMs/);
    assert.match(out, /pid file <path> unreadable/);
    const hog = {
      runtime: "node",
      limits: { memTotalGiB: 7.8, memLimitGiB: null, swapTotalGiB: 4, overcommit: 0 },
      advertisedMiB: 8192,
      targetMiB: 12288,
      reachedMiB: 640,
      reachedEvidence: "last-poll",
      reachedFraction: 0.078,
      progress: [{ mib: 512, ms: 900 }],
      outcome: { kind: "sandbox-lost", detail: "modal:native-exact-get: terminal" },
      scope: "sandbox",
      usableAfter: false,
      health: { answered: false },
      maxPollGapMs: 17982,
    };
    const mem = checkFromReport(report("memory-pressure", [{ provider: "modal", status: "completed", reason: null, machine, result: hog }]));
    assert.deepEqual((mem.data.entries as { result: unknown }[])[0]!.result, {
      advertisedMiB: 8192,
      targetMiB: 12288,
      reached: { evidence: "last-poll", mib: 640, fraction: 0.078 },
      outcome: { kind: "sandbox-lost" },
      scope: "sandbox",
      usableAfter: false,
      swapTotalGiB: 4,
    });
    assert.throws(() => checkFromReport({ ...report("memory-pressure", []), track: "default" }), /same-machine/);
  });

  test("the section draws a pause table, a restart chart lowest first and a memory table", () => {
    const html = renderToStaticMarkup(<FairnessSection data={d} />);
    const t = text(html);
    for (const s of ["Survives a pause", "Restart speed", "Memory runs out", "Survives a pause with memory intact", "How fast a killed process restarts", "What happens when memory runs out"]) assert.ok(t.includes(s), s);
    assert.ok(t.includes("No verdict: no heartbeat count across the hold"));
    assert.ok(t.includes("at least 640 MiB (8% of 8 GiB)"));
    assert.ok(t.includes("16.3 GiB (102% of 16 GiB), with 1 GiB swap"));
    assert.ok(t.includes("No result for Beam"));
    assert.match(t, /Luxor\s*: the boot id changed, but the original processes kept their memory\./);
    assert.doesNotMatch(t, /New boot ID, yet/);
    assert.doesNotMatch(t, /Freestyle: failed|Styne: failed|\b(cheat|gaming|fake|lying)\b/i);
    const restart = html.slice(html.indexOf("How fast a killed process restarts"));
    const order = ["Styne", "Upstash Box", "Luxor", "Daytona", "E2B", "Freestyle"].map((n) => restart.indexOf(`>${n}<`));
    assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > (order[i - 1] ?? 0))), `restart columns lowest first: ${order.join(",")}`);
  });

  test("results.json, results.md and llms.txt carry both checks", () => {
    const json = fairnessData(d);
    assert.equal(json.stateSurvival?.results.find((r) => r.provider === "freestyle")?.summary, "No verdict: no heartbeat count across the hold");
    assert.equal(json.memoryPressure?.results.find((r) => r.provider === "modal")?.held, "at least 640 MiB (8% of 8 GiB)");
    assert.deepEqual(json.stateSurvival?.noResult.map((m) => m.provider), ["beam"]);
    const md = fairnessMarkdown(d).join("\n");
    assert.match(md, /## Survives a pause with memory intact/);
    assert.match(md, /\| Upstash Box \| Files kept, running processes gone \| about 220 ms, started again \| 88 ms \|/);
    assert.match(md, /## What happens when memory runs out/);
    const llms = fairnessLlms(d);
    assert.match(llms, /Restart after a kill \(median, lowest first\):\n1\. Styne: 59 ms/);
    assert.match(llms, /Survives a pause, Beam: no result/);
  });
});
