import {
  completed,
  cpuLine,
  iopsText,
  isolationText,
  memoryOutcomeText,
  mibpsText,
  notCompleted,
  opsText,
  percentText,
  heldShare,
  rankBy,
  runsAsText,
  uptimeText,
  vulnerableText,
} from "@/lib/fairness";
import type { CheckData, Completed, DiskResult, FairnessData, SecurityResult } from "@/lib/fairness";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * The like-for-like checks in results.json, results.md and llms.txt. The same rules as the page:
 * comparable rows first, then the rest with why; a provider with no result says why.
 */

export const fairnessAbout =
  "Five checks run the same way on every provider's same-machine sandbox (4 vCPU, 8 GB requested; boxd ran its nearest 4 vCPU, 16 GiB size): the CPU checks use one compiled program instead of each image's Python, the disk check reads past the guest's cache, and burst credit and the CPUs a sandbox reports are measured rather than left to chance. They remove differences that made earlier numbers less comparable; they are not scored. Native CPU: one static C binary with no runtime (an aarch64 build of the same source on ARM providers), single core, four cores and 15 minutes held. Disk: a 2 GiB file with direct I/O past the guest's page cache, plus synced 4 KB random writes and direct reads, each checked against what was written. 10 at once: ten 4 vCPU sandboxes on one account burning together for 2 minutes against one alone. CPUs and memory: nproc and MemTotal against the cgroup quota and limit, then 6 GiB of memory held while a 2 GiB file is written. Isolation and kernel: read-only facts from a fresh sandbox. Styne, whose burst credit is shared across an account, ran each CPU check alone after at least 45 minutes without Styne load; it measured 5.33B ops/s in the short four-core runs, 5.09B in the first 30-second window of the 15-minute burn, and about 0.87B from the second window on. The Nov 23 Sustained CPU test (Python) kept full speed about 10.5 minutes; these traces don't measure the account's remaining credit.";

export const fairnessHowToRead =
  "Each check has `run` (id, SDK commit, start), `results` (the providers that completed it, each with `status: \"completed\"`) and `noResult` (the rest, each with `status` failed or skipped and `why`). `machine.sameSize` is false for a sandbox that isn't 4 vCPU, 8 GiB. `arch` names ARM providers, which ran the aarch64 build. Disk rows and 10-at-once rows carry `comparable` and `notComparableWhy`: a disk on a filesystem held in memory, one that refused direct I/O, or under gVisor's own file layer isn't comparable; a cohort missing sandboxes, burns, or 90 of 120 seconds of proven overlap isn't either. In `cpuNative`, `first3MinOpsPerS` and `last3MinOpsPerS` are medians of the first and last six measured 30-second windows, `retention` is their ratio, and `heldShare` is the last 3 minutes over the short four-core run (`allCoreOpsPerS`), which still shows a drop before minute 3. Rates are operations per second; disk throughput is MiB/s; latencies are microseconds. One run per provider.";

const why = <R>(check: CheckData<R> | null) => notCompleted(check).map((m) => ({ provider: m.provider, name: providerName(m.provider), status: m.status, why: m.why }));

const base = <R>(d: FairnessData, e: Completed<R>) => ({
  provider: e.provider,
  name: providerName(e.provider),
  status: e.status,
  machine: e.machine,
  arch: d.arch[e.provider] ?? null,
});

const comparableFirst = <R extends { comparable: boolean }>(entries: readonly Completed<R>[], value: (r: R) => number) => [
  ...rankBy(entries.filter((e) => e.result.comparable), value),
  ...rankBy(entries.filter((e) => !e.result.comparable), value),
];

export function fairnessData(d: FairnessData) {
  return {
    about: fairnessAbout,
    howToRead: fairnessHowToRead,
    track: "same-spec",
    generatedAt: d.generatedAt,
    ...(d.cpuNative
      ? {
          cpuNative: {
            run: d.cpuNative.run,
            results: rankBy(completed(d.cpuNative), (r) => r.allCoreOps).map((e) => ({
              ...base(d, e),
              singleCoreOpsPerS: e.result.singleOps,
              allCoreOpsPerS: e.result.allCoreOps,
              scaling: e.result.scaling,
              first3MinOpsPerS: e.result.first3MinOps,
              last3MinOpsPerS: e.result.last3MinOps,
              retention: e.result.retention,
              heldShare: Number(heldShare(e.result).toFixed(4)),
              cpuModel: e.result.cpuModel,
            })),
            noResult: why(d.cpuNative),
          },
        }
      : {}),
    ...(d.diskReal
      ? {
          diskReal: {
            run: d.diskReal.run,
            results: comparableFirst(completed(d.diskReal), (r) => r.seqReadMiBps).map((e) => ({ ...base(d, e), ...e.result })),
            noResult: why(d.diskReal),
          },
        }
      : {}),
    ...(d.cpuBurst
      ? {
          cpuBurst10: {
            run: d.cpuBurst.run,
            results: comparableFirst(completed(d.cpuBurst), (r) => r.medianOps).map((e) => ({ ...base(d, e), ...e.result })),
            noResult: why(d.cpuBurst),
          },
        }
      : {}),
    ...(d.memoryHonesty
      ? {
          cpusAndMemory: {
            run: d.memoryHonesty.run,
            results: [...completed(d.memoryHonesty)].sort((a, b) => a.provider.localeCompare(b.provider)).map((e) => ({ ...base(d, e), ...e.result })),
            noResult: why(d.memoryHonesty),
          },
        }
      : {}),
    ...(d.securityProbe
      ? {
          isolationAndKernel: {
            run: d.securityProbe.run,
            results: [...completed(d.securityProbe)].sort((a, b) => a.provider.localeCompare(b.provider)).map((e) => ({ ...base(d, e), ...e.result })),
            noResult: why(d.securityProbe),
          },
        }
      : {}),
  };
}

const diskRow = (e: Completed<DiskResult>) =>
  `| ${providerName(e.provider)} | ${e.result.fsType} | ${mibpsText(e.result.seqWriteMiBps)} | ${mibpsText(e.result.seqReadMiBps)} | ${iopsText(e.result.randWriteIops)} | ${iopsText(e.result.randReadIops)} | ${e.result.comparable ? "yes" : `no: ${e.result.notComparableWhy}`} |`;

const secRow = (e: Completed<SecurityResult>) =>
  `| ${providerName(e.provider)} | ${isolationText(e.result)} | ${cpuLine(e.result.cpu)} | ${[...e.result.weakeningFlags, ...e.result.notableFlags].join(" ") || "none of the listed flags"} | ${vulnerableText(e.result)} | ${runsAsText(e.result)} | ${uptimeText(e.result)} |`;

const missingLines = <R>(check: CheckData<R> | null) => notCompleted(check).map((m) => `${providerName(m.provider)}: ${m.status === "skipped" ? "not run" : "no result"} (${m.why}).`);

export function fairnessMarkdown(d: FairnessData): string[] {
  const out = ["# Like-for-like checks (Same machine)", "", fairnessAbout, ""];
  if (d.cpuNative) {
    out.push("## Native CPU", "", "| Provider | One core | Four cores | Scaling | Last 3 minutes | Held |", "| --- | --- | --- | --- | --- | --- |");
    for (const e of rankBy(completed(d.cpuNative), (r) => r.allCoreOps))
      out.push(`| ${providerName(e.provider)}${d.arch[e.provider] === "aarch64" ? " (ARM)" : ""} | ${opsText(e.result.singleOps)} | ${opsText(e.result.allCoreOps)} | ${e.result.scaling.toFixed(2)}× | ${opsText(e.result.last3MinOps)} | ${percentText(heldShare(e.result))} |`);
    out.push("", ...missingLines(d.cpuNative), "");
  }
  if (d.diskReal) {
    out.push("## Disk, past the page cache", "", "| Provider | Filesystem | Sequential write | Sequential read | 4 KB synced writes/s | 4 KB reads/s | Comparable |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of comparableFirst(completed(d.diskReal), (r) => r.seqReadMiBps)) out.push(diskRow(e));
    out.push("", ...missingLines(d.diskReal), "");
  }
  if (d.cpuBurst) {
    out.push("## Native CPU, 10 sandboxes at once", "", "| Provider | Median at once | Alone | At once ÷ alone | Fastest ÷ slowest | Created | Comparable |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of comparableFirst(completed(d.cpuBurst), (r) => r.medianOps))
      out.push(`| ${providerName(e.provider)} | ${opsText(e.result.medianOps)} | ${opsText(e.result.soloOps)} | ${e.result.relativeToSolo.toFixed(2)}× | ${e.result.spread.toFixed(2)}× | ${e.result.created} of ${e.result.requested} | ${e.result.comparable ? "yes" : `no: ${e.result.notComparableWhy}`} |`);
    out.push("", ...missingLines(d.cpuBurst), "");
  }
  if (d.memoryHonesty) {
    out.push("## CPUs and memory a sandbox shows", "", "| Provider | CPUs shown | CPUs usable | Memory shown | Memory limit | 6 GiB held + 2 GiB file |", "| --- | --- | --- | --- | --- | --- |");
    for (const e of [...completed(d.memoryHonesty)].sort((a, b) => a.provider.localeCompare(b.provider)))
      out.push(`| ${providerName(e.provider)} | ${e.result.visibleCpus ?? "?"} | ${e.result.usableCpus ?? "?"} | ${e.result.memTotalGiB ?? "?"} GiB | ${e.result.memLimitGiB === null ? "none" : `${e.result.memLimitGiB} GiB`} | ${memoryOutcomeText(e.result)} |`);
    out.push("", ...missingLines(d.memoryHonesty), "");
  }
  if (d.securityProbe) {
    out.push("## Isolation and kernel", "", "| Provider | Isolation | CPU | Kernel flags | Vulnerable (kernel's view) | Runs as | Fresh sandbox |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of [...completed(d.securityProbe)].sort((a, b) => a.provider.localeCompare(b.provider))) out.push(secRow(e));
    out.push("", ...missingLines(d.securityProbe), "");
  }
  return out;
}

const line = (id: ProviderId, text: string) => `- ${providerName(id)}: ${text}`;

export function fairnessLlms(d: FairnessData): string {
  const parts = [`## Like-for-like checks\n\n${fairnessAbout} Same machine only. Data: \`likeForLike\` in results.json.\n`];
  if (d.cpuNative)
    parts.push(`Native CPU, four cores (highest first):\n${rankBy(completed(d.cpuNative), (r) => r.allCoreOps).map((e, i) => `${i + 1}. ${providerName(e.provider)}: ${opsText(e.result.allCoreOps)}, ${percentText(heldShare(e.result))} of it held at minutes 12–15${d.arch[e.provider] === "aarch64" ? " (ARM build)" : ""}`).join("\n")}\n`);
  if (d.diskReal)
    parts.push(`Disk read past the page cache:\n${comparableFirst(completed(d.diskReal), (r) => r.seqReadMiBps).map((e) => line(e.provider, `${mibpsText(e.result.seqReadMiBps)} read, ${iopsText(e.result.randWriteIops)} synced 4 KB writes/s on ${e.result.fsType}${e.result.comparable ? "" : ` (not comparable: ${e.result.notComparableWhy})`}`)).join("\n")}\n`);
  if (d.cpuBurst)
    parts.push(`10 sandboxes at once:\n${comparableFirst(completed(d.cpuBurst), (r) => r.medianOps).map((e) => line(e.provider, `${opsText(e.result.medianOps)} per sandbox, ${e.result.relativeToSolo.toFixed(2)}× alone${e.result.comparable ? "" : ` (not comparable: ${e.result.notComparableWhy})`}`)).join("\n")}\n`);
  if (d.memoryHonesty)
    parts.push(`CPUs and memory:\n${[...completed(d.memoryHonesty)].sort((a, b) => a.provider.localeCompare(b.provider)).map((e) => line(e.provider, `${e.result.visibleCpus ?? "?"} CPUs shown, ${e.result.usableCpus ?? "?"} usable; ${memoryOutcomeText(e.result)}`)).join("\n")}\n`);
  if (d.securityProbe)
    parts.push(`Isolation:\n${[...completed(d.securityProbe)].sort((a, b) => a.provider.localeCompare(b.provider)).map((e) => line(e.provider, `${isolationText(e.result)}; ${runsAsText(e.result)}; ${uptimeText(e.result)}`)).join("\n")}\n`);
  const labelled = (label: string, rows: ReturnType<typeof why>) => rows.map((m) => `- ${label}, ${m.name}: ${m.status === "skipped" ? "not run" : "no result"} (${m.why})`);
  const missing = [
    ...labelled("Native CPU", why(d.cpuNative)),
    ...labelled("Disk", why(d.diskReal)),
    ...labelled("10 at once", why(d.cpuBurst)),
    ...labelled("CPUs and memory", why(d.memoryHonesty)),
    ...labelled("Isolation", why(d.securityProbe)),
  ];
  if (missing.length > 0) parts.push(`No result:\n${missing.join("\n")}\n`);
  return `${parts.join("\n")}\n`;
}
