import {
  completed,
  cpuLine,
  iopsText,
  isolationText,
  memoryOutcomeText,
  mibpsText,
  notCompleted,
  msText,
  newScenarioCoverageText,
  opsText,
  percentText,
  heldShare,
  pressureOutcomeText,
  rankBy,
  reachedText,
  runsAsText,
  scopeText,
  secondsText,
  servicesNotes,
  servicesRanked,
  dockerStartText,
  greenText,
  serviceIsolationText,
  servingText,
  suspendText,
  uptimeText,
  usableAfterText,
  verdictNote,
  vulnerableText,
} from "@/lib/fairness";
import type { CheckData, Completed, DiskResult, FairnessData, SecurityResult, StateResult } from "@/lib/fairness";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * The like-for-like checks in results.json, results.md and llms.txt. The same rules as the page:
 * comparable rows first, then the rest with why; a provider with no result says why.
 */

const fairnessAboutText =
  "Eight checks run the same way on the same-machine sandbox of each provider listed in them (4 vCPU, 8 GB requested; boxd ran its nearest 4 vCPU, 16 GiB size): the CPU checks use one compiled program instead of each image's Python, the disk check reads past the guest's cache, and burst credit and the CPUs a sandbox reports are measured rather than left to chance. They remove differences that made earlier numbers less comparable; they are not scored. Native CPU: one static C binary with no runtime (an aarch64 build of the same source on ARM providers), single core, four cores and 15 minutes held. Disk: a 2 GiB file with direct I/O past the guest's page cache, plus synced 4 KB random writes and direct reads, each checked against what was written. 10 at once: ten 4 vCPU sandboxes on one account burning together for 2 minutes against one alone. CPUs and memory: nproc and MemTotal against the cgroup quota and limit, then 6 GiB of memory held while a 2 GiB file is written. Isolation and kernel: read-only facts from a fresh sandbox. Survives a pause: a server holding 32 MiB in memory, a worker beating every second and a 16 MiB file, paused for 60 s and resumed, then checked for the same processes, memory and file; restart speed is how fast that server, killed with SIGKILL, answers again in the same sandbox. Memory runs out: one process allocates up to 1.5 times the advertised memory, and what stopped it, how much it held and whether a canary process stayed alive are recorded. Docker and services: a small API's 9 integration tests against Postgres 16 and Redis 7, inside the sandbox two ways, with Docker Compose and with the same servers started without Docker, 3 attempts each; the two ways are ranked apart, because the Docker way downloads from the internet inside the sandbox and the other uploads from our runner. Styne, whose burst credit is shared across an account, ran each CPU check alone after at least 45 minutes without Styne load; it measured 5.33B ops/s in the short four-core runs, 5.09B in the first 30-second window of the 15-minute burn, and about 0.87B from the second window on. The Nov 25 Sustained CPU test (Python) ran at full speed about a minute, then at about 16% of it; these traces don't measure the account's remaining credit.";

/** The about text, with how many providers each newer scenario covers so far. */
export const fairnessAbout = (d: FairnessData) => `${fairnessAboutText} So far ${newScenarioCoverageText(d)}. A provider listed for a check without a result is in that check's \`noResult\`, with why; providers not listed for a check weren't run in it.`;

export const fairnessHowToRead =
  "Each check has `run` (id, SDK commit, start), and each result its own `run`: null when it came from the check's run, or the provider's own later run when it was added from one. Each check has `results` (the providers that completed it, each with `status: \"completed\"`) and `noResult` (the other providers listed for that check, each with `status` and `why`: `failed` when the provider returned no result, `not-run` or `skipped` when it never started, `not-run` for a reason on our side such as a rejected API key). `machine.sameSize` is false for a sandbox that isn't 4 vCPU, 8 GiB. `arch` names ARM providers, which ran the aarch64 build. Disk rows and 10-at-once rows carry `comparable` and `notComparableWhy`: a disk on a filesystem held in memory, one that refused direct I/O, or under gVisor's own file layer isn't comparable; a cohort missing sandboxes, burns, or 90 of 120 seconds of proven overlap isn't either. In `cpuNative`, `first3MinOpsPerS` and `last3MinOpsPerS` are medians of the first and last six measured 30-second windows, `retention` is their ratio, and `heldShare` is the last 3 minutes over the short four-core run (`allCoreOpsPerS`), which still shows a drop before minute 3. In `stateSurvival`, `suspend.kind` is `measured` (with `verdict`: `in-ram` memory and processes intact and frozen, `kept-running`, `cold-restart` both processes confirmed gone with the file intact, where a changed boot ID alone is not enough, `files-lost`, or `inconclusive` with `reason`; a `reason` on another verdict is the check's note on its evidence, such as a changed boot ID outweighed by the original server keeping its memory and the same worker coming back), `failed` (a pause, resume or first command didn't complete, with `stage`), or `unsupported` (our SDK adapter has no pause); `inconclusive` and `failed` are no verdict and say nothing against the provider. `servingMs` is observed from resume to the original server answering; `coldServeMs` is composed (first command plus a guest-timed restart) for a server started again. `restart.medianMs` is the median kill-to-answer time of a server killed with SIGKILL and started again, over the restarts that were timed out of 5 attempts (failed and start-only attempts aren't timed), lower is better. In `memoryPressure`, `outcome.kind` is `reached-target`, `process-killed` (SIGKILL recorded), `refused`, `sandbox-restarted`, `sandbox-lost`, or `inconclusive` with `reason` (no verdict); `reached.mib` is exact when `reached.evidence` is `log` and a lower bound when it is `last-poll`; `reached.fraction` is over `advertisedMiB`; `scope` is judged from one canary process: `process` (the canary stayed alive; `outcome` says how the hog stopped), `collateral` (the canary was gone too), `sandbox` (the sandbox rebooted, or the provider reported it gone, which says nothing about why), or null when not determined; `usableAfter` is null when not measured. In `services`, each result has `isolation`, `runtime` (Modal's: `vm`, its only runtime with Docker), `docker` (the daemon the compose attempts used: `method` `preinstalled-running`, the provider's own already running in the sandbox, or `static-rootful`, our pinned static Docker started as root; `config`, the flags it needed, where `vfs` is vfs storage instead of overlay; `started`, in how many compose attempts; `dockerText` says it in words; null when none started), and `compose` and `native` (without Docker), each with `attempts`, `green` (all 9 tests passed), `upS` (seconds until Postgres and Redis both answered, per green attempt), `medianUpS`, `medianToGreenS`, with Docker `medianDaemonS` and `medianPullS`, and `failures` (`stage`, the harness's `reason`, and `detail`, the last line of the attempt's output); `notes` say what to read beside a row. `rankings.compose` and `rankings.native` are separate and never merged. Rates are operations per second; disk throughput is MiB/s; latencies are microseconds; state-survival times are milliseconds; services times are seconds. One run per provider.";

const why = <R>(check: CheckData<R> | null) => notCompleted(check).map((m) => ({ provider: m.provider, name: providerName(m.provider), status: m.status, why: m.why }));

const base = <R>(d: FairnessData, e: Completed<R>) => ({
  provider: e.provider,
  name: providerName(e.provider),
  status: e.status,
  machine: e.machine,
  arch: d.arch[e.provider] ?? null,
  run: e.run,
});

/** The verdict in words, with the check's own note when it gave one. */
const suspendWithNote = (r: StateResult) => {
  const note = verdictNote(r);
  return note ? `${suspendText(r)} (${note})` : suspendText(r);
};

const byName = <R>(entries: readonly Completed<R>[]) => [...entries].sort((a, b) => a.provider.localeCompare(b.provider));

/** Fastest restart first; providers with no restart timed are left out. */
const restartRanked = (check: CheckData<StateResult>) =>
  completed(check)
    .flatMap((e) => (e.result.restart.medianMs === null ? [] : [{ ...e, medianMs: e.result.restart.medianMs }]))
    .sort((a, b) => a.medianMs - b.medianMs || a.provider.localeCompare(b.provider));

const comparableFirst = <R extends { comparable: boolean }>(entries: readonly Completed<R>[], value: (r: R) => number) => [
  ...rankBy(entries.filter((e) => e.result.comparable), value),
  ...rankBy(entries.filter((e) => !e.result.comparable), value),
];

export function fairnessData(d: FairnessData) {
  return {
    about: fairnessAbout(d),
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
    ...(d.stateSurvival
      ? {
          stateSurvival: {
            run: d.stateSurvival.run,
            results: byName(completed(d.stateSurvival)).map((e) => ({ ...base(d, e), summary: suspendText(e.result), ...e.result })),
            noResult: why(d.stateSurvival),
          },
        }
      : {}),
    ...(d.memoryPressure
      ? {
          memoryPressure: {
            run: d.memoryPressure.run,
            results: byName(completed(d.memoryPressure)).map((e) => ({ ...base(d, e), summary: pressureOutcomeText(e.result), held: reachedText(e.result), ...e.result })),
            noResult: why(d.memoryPressure),
          },
        }
      : {}),
    ...(d.services
      ? {
          services: {
            run: d.services.run,
            results: byName(completed(d.services)).map((e) => ({ ...base(d, e), ...e.result, dockerText: dockerStartText(e.result), notes: servicesNotes(e.result) })),
            rankings: Object.fromEntries((["compose", "native"] as const).map((path) => [path, servicesRanked(d.services, path).map((e) => ({ provider: e.provider, name: providerName(e.provider), medianUpS: e.medianUpS, green: e.result[path].green, attempts: e.result[path].attempts }))])),
            noResult: why(d.services),
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

const missingLines = <R>(check: CheckData<R> | null) => notCompleted(check).map((m) => `${providerName(m.provider)}: ${m.status === "failed" ? "no result" : "not run"} (${m.why}).`);

export function fairnessMarkdown(d: FairnessData): string[] {
  const out = ["# Like-for-like checks (Same machine)", "", fairnessAbout(d), ""];
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
  if (d.stateSurvival) {
    out.push("## Survives a pause with memory intact", "", "| Provider | After a 60 s pause | Serving again | Restart after a kill (median) |", "| --- | --- | --- | --- |");
    for (const e of byName(completed(d.stateSurvival)))
      out.push(`| ${providerName(e.provider)} | ${suspendWithNote(e.result)} | ${servingText(e.result) ?? "–"} | ${e.result.restart.medianMs === null ? "not timed" : msText(e.result.restart.medianMs)} |`);
    out.push("", ...missingLines(d.stateSurvival), "");
  }
  if (d.memoryPressure) {
    out.push("## What happens when memory runs out", "", "| Provider | What happened | Held before it | What it took down | Usable after |", "| --- | --- | --- | --- | --- |");
    for (const e of byName(completed(d.memoryPressure))) out.push(`| ${providerName(e.provider)} | ${pressureOutcomeText(e.result)} | ${reachedText(e.result)} | ${scopeText(e.result)} | ${usableAfterText(e.result)} |`);
    out.push("", ...missingLines(d.memoryPressure), "");
  }
  if (d.services) {
    const up = (p: { medianUpS: number | null }) => (p.medianUpS === null ? "–" : secondsText(p.medianUpS));
    out.push("## Docker and services inside the sandbox", "", "Ranked apart: the Docker way downloads Docker and its images inside the sandbox, the other uploads from our runner.", "", "| Provider | Isolation | Docker | Green with Docker | Up with Docker (median) | Green without Docker | Up without Docker (median) |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of byName(completed(d.services))) out.push(`| ${providerName(e.provider)} | ${serviceIsolationText[e.result.isolation]} | ${dockerStartText(e.result)} | ${greenText(e.result.compose)} | ${up(e.result.compose)} | ${greenText(e.result.native)} | ${up(e.result.native)} |`);
    out.push("", ...byName(completed(d.services)).flatMap((e) => servicesNotes(e.result).map((n) => `${providerName(e.provider)}: ${n}.`)), ...missingLines(d.services), "");
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
  const parts = [`## Like-for-like checks\n\n${fairnessAbout(d)} Same machine only. Data: \`likeForLike\` in results.json.\n`];
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
  if (d.stateSurvival) {
    parts.push(`Survives a 60 s pause:\n${byName(completed(d.stateSurvival)).map((e) => line(e.provider, suspendWithNote(e.result))).join("\n")}\n`);
    parts.push(`Restart after a kill (median, lowest first):\n${restartRanked(d.stateSurvival).map((e, i) => `${i + 1}. ${providerName(e.provider)}: ${msText(e.medianMs)}`).join("\n")}\n`);
  }
  if (d.memoryPressure)
    parts.push(`When memory runs out:\n${byName(completed(d.memoryPressure)).map((e) => line(e.provider, `${pressureOutcomeText(e.result)}; held ${reachedText(e.result)}; took down: ${scopeText(e.result).toLowerCase()}`)).join("\n")}\n`);
  if (d.services) {
    const ranked = (path: "compose" | "native") => servicesRanked(d.services, path).map((e, i) => `${i + 1}. ${providerName(e.provider)}: ${secondsText(e.medianUpS)}${e.result[path].green < e.result[path].attempts ? ` (${greenText(e.result[path])} green)` : ""}`).join("\n");
    parts.push(`Postgres and Redis up with Docker Compose (median, lowest first; ranked apart from the no-Docker list):\n${ranked("compose")}\n`);
    parts.push(`Postgres and Redis up without Docker (median, lowest first):\n${ranked("native")}\n`);
    parts.push(`How Docker ran:\n${byName(completed(d.services)).map((e) => line(e.provider, [dockerStartText(e.result), ...servicesNotes(e.result)].join("; "))).join("\n")}\n`);
  }
  const labelled = (label: string, rows: ReturnType<typeof why>) => rows.map((m) => `- ${label}, ${m.name}: ${m.status === "failed" ? "no result" : "not run"} (${m.why})`);
  const missing = [
    ...labelled("Native CPU", why(d.cpuNative)),
    ...labelled("Disk", why(d.diskReal)),
    ...labelled("10 at once", why(d.cpuBurst)),
    ...labelled("CPUs and memory", why(d.memoryHonesty)),
    ...labelled("Isolation", why(d.securityProbe)),
    ...labelled("Survives a pause", why(d.stateSurvival)),
    ...labelled("Memory runs out", why(d.memoryPressure)),
    ...labelled("Docker and services", why(d.services)),
  ];
  if (missing.length > 0) parts.push(`Not run or no result:\n${missing.join("\n")}\n`);
  return `${parts.join("\n")}\n`;
}
