import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import raw from "@/data/fairness.json";
import { FairnessSection, IsolationTable } from "@/components/fairness";
import { agentData, agentMarkdown, llmsTxt } from "@/lib/agent-data";
import { completed, hasFairness, heldShare, memoryOutcomeText, parseFairness, uptimeText } from "@/lib/fairness";
import type { FairnessData, MemoryResult, SecurityResult } from "@/lib/fairness";
import { fairnessData, fairnessLlms, fairnessMarkdown } from "@/lib/fairness-agent";
import { fairness } from "@/lib/fairness-data";
import { archFrom, checkFromReport, gvisorDiskWhy, markGvisorDisk, plainReason } from "../../scripts/fairness-site-data";

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

const fixture = () => ({
  schema: "fairness-site.v1",
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
    const empty = parseFairness({ schema: "fairness-site.v1", generatedAt: "2026-11-24T00:00:00.000Z", track: "same-machine", arch: {}, checks: {} });
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
    assert.match(uptimeText(styne), /23.1 h at first command, at least 23.1 h before the create began: likely a pool or snapshot/);
    assert.match(uptimeText(boat), /3.1 s at first command, at least 2.5 s before the create began/);
    assert.match(uptimeText({ ...boat, bootedBeforeCreateS: -0.8 }), /booted after the create began/);
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
