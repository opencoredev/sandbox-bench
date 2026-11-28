import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, NotOnChart, Who, sentence } from "@/components/metric-chart";
import { ProviderName } from "@/components/provider-name";
import { TabCard } from "@/components/tabs";
import { formatShort, formatValue } from "@/lib/format";
import {
  completed,
  cpuLine,
  dockerStartText,
  gibText,
  greenText,
  hasVerdict,
  iopsText,
  isolationText,
  memoryOutcomeText,
  mibpsText,
  msText,
  notCompleted,
  OVERSHOOT,
  opsText,
  percentText,
  heldShare,
  pressureOutcomeText,
  rankBy,
  reachedText,
  runsAsText,
  scopeText,
  secondsText,
  serviceIsolationText,
  servicesNotes,
  servicesRanked,
  servingText,
  stateVerdicts,
  suspendText,
  verdictNote,
  uptimeText,
  usableAfterText,
  vulnerableText,
} from "@/lib/fairness";
import type { BurstResult, CheckData, Completed, CpuNativeResult, DiskResult, FairnessData, MemoryResult, PressureResult, SecurityResult, ServicePathResult, ServicesResult, StateResult } from "@/lib/fairness";
import { providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** The section id, for the nav and links that open a tab: `#like-for-like/disk`. */
export const fairnessSection = "like-for-like";

type Note = { mark?: number; lead?: string; text: ReactNode; about?: ProviderId };

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Notes every chart here can need for a provider: a machine that is not 4 vCPU, 8 GiB, and, on the
 * charts that ran the compiled C program (`cBuild`), an ARM CPU, which ran the aarch64 build of
 * the same source. Numbered in chart order.
 */
function marksFor<R>(data: FairnessData, shown: readonly Completed<R>[], extra: (e: Completed<R>) => string | undefined = () => undefined, { cBuild = true } = {}) {
  let next = 0;
  const marks = new Map<ProviderId, { mark: number; note: string }>();
  for (const e of shown) {
    const notes = [
      e.machine.sameSize ? undefined : `asked for ${e.machine.cpu} vCPU, ${e.machine.memoryGiB} GiB, its nearest size to 4 vCPU, 8 GiB`,
      cBuild && data.arch[e.provider] === "aarch64" ? "runs on ARM (aarch64), so it ran an ARM build of the same C source; its CPU figures come from different machine code than the x86 providers'" : undefined,
      extra(e),
    ].filter((x) => x !== undefined);
    if (notes.length > 0) marks.set(e.provider, { mark: ++next, note: notes.map(sentence).join(" ") });
  }
  return marks;
}

const markNotes = (marks: ReturnType<typeof marksFor>): Note[] => [...marks].map(([id, m]) => ({ mark: m.mark, text: <><Who id={id} />: {m.note}</>, about: id }));

const missingNotes = <R,>(check: CheckData<R> | null): Note[] =>
  notCompleted(check).map(({ provider, status, why }) => ({ text: <><Who id={provider} />: {status === "failed" ? "no result" : "not run"} ({why}).</>, about: provider }));

/** The providers missing from the chart: those we didn't run apart from those with no result. */
function Missing<R>({ check }: { check: CheckData<R> }) {
  const missing = notCompleted(check);
  return (
    <>
      <NotOnChart ids={missing.filter((m) => m.status === "failed").map((m) => m.provider)} />
      <NotOnChart ids={missing.filter((m) => m.status !== "failed").map((m) => m.provider)} lead="Not run:" />
    </>
  );
}

/** The check's run, then each provider added from its own later run, named by that run's id. */
const runNote = <R,>(check: CheckData<R>): Note => {
  const apart = check.entries.flatMap((e) => (e.run === null ? [] : [`; ${providerName(e.provider)} on ${dayOf(e.run.startedAt)} in its own run (${e.run.id}, SDK commit ${e.run.sdkCommit.slice(0, 7)})`]));
  return { lead: "Run", text: `One run per provider, ${dayOf(check.run.startedAt)} (SDK commit ${check.run.sdkCommit.slice(0, 7)})${apart.join("")}. A single run, so read small gaps as noise.` };
};

const solid = (id: ProviderId, value: number) => [{ value, color: providerColor(id), fill: "solid" as const }] as const;

// ---------------------------------------------------------------------------
// Native CPU

function cpuColumns(rows: readonly Completed<CpuNativeResult>[], marks: ReturnType<typeof marksFor>, value: (r: CpuNativeResult) => number, tag: (r: CpuNativeResult) => string): Column[] {
  return rows.map((e) => ({
    provider: e.provider,
    label: formatShort(value(e.result), "ops/s"),
    mark: marks.get(e.provider)?.mark,
    tag: tag(e.result),
    segments: solid(e.provider, value(e.result)),
    detail: [
      ["One core", opsText(e.result.singleOps)],
      ["Four cores", opsText(e.result.allCoreOps)],
      ["Scaling", `${e.result.scaling.toFixed(2)}×`],
      ["First 3 minutes", opsText(e.result.first3MinOps)],
      ["Last 3 minutes", opsText(e.result.last3MinOps)],
      ["Held (last 3 min ÷ four cores)", percentText(heldShare(e.result))],
      ["Last 3 ÷ first 3 minutes", percentText(e.result.retention)],
      ...(e.result.cpuModel ? [["CPU", e.result.cpuModel] as const] : []),
    ],
  }));
}

function NativeCpu({ data, check, held }: { data: FairnessData; check: CheckData<CpuNativeResult>; held: boolean }) {
  const value = (r: CpuNativeResult) => (held ? r.last3MinOps : r.allCoreOps);
  const rows = rankBy(completed(check), value);
  const marks = marksFor(data, rows);
  const title = held ? "Native CPU held for 15 minutes" : "Native CPU, all four cores";
  return (
    <>
      <ChartHead
        title={title}
        sub={held ? "One static binary, 4 workers, 30 windows of 30 s · Median operations per second of the last six windows · Tag: held, last 3 minutes ÷ the four-core run · Higher is better" : "One static binary, 4 workers · Median operations per second of three 10-second runs · Tag: four cores ÷ (4 × one core) · Higher is better"}
      />
      <Columns columns={cpuColumns(rows, marks, value, (r) => (held ? percentText(heldShare(r)) : `${r.scaling.toFixed(2)}×`))} label={`${title}: operations per second by provider`} />
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "The Python CPU tests ran whichever Python each image ships, 3.11 to 3.14, and newer Pythons run the same loop faster. This is one small C program with no runtime, built once per CPU architecture from one source, so every x86 provider runs the same machine code and the ARM providers run an ARM build of it." },
          { lead: "Work", text: "The same 32-bit LCG as the Python test, one dependent multiply-add per step, compiled for baseline x86-64 (no AVX) so no CPU gets a wider code path. Every run uses a fresh seed and the host checks each worker's final value; a run whose numbers don't add up isn't published." },
          { lead: "Scaling", text: "Four workers' rate over four times one worker's. 1.00× means four vCPUs did four times the work of one. Well below 1 means the four did less together than alone, for example from shared cores, hyperthread siblings or a CPU quota; this test can't tell which." },
          { lead: "Held for 15 minutes", text: "After the short runs, the same sandbox burns all four workers for 15 minutes without a pause: one command whose four workers never stop, sampled together every 30 seconds on one clock. A CPU that runs on burst credit shows the rate it falls to. The first and last 3 minutes are the medians of the first and last six measured windows. The tag, held, is the last 3 minutes over the short four-core run just before, so a drop that came before minute 3 still shows. Each window's rate is the work every worker did over the window's measured length (29.98 to 30.02 s in this run); a worker reports progress after each 4,194,304-step chunk, so at most one chunk per worker, about 20 ms of work at the slowest rate measured, can fall on the other side of a window's edge." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Disk

function diskNote(e: Completed<DiskResult>) {
  return e.result.comparable ? undefined : `not comparable: ${e.result.notComparableWhy}`;
}

function Disk({ data, check, writes }: { data: FairnessData; check: CheckData<DiskResult>; writes: boolean }) {
  const value = (r: DiskResult) => (writes ? r.randWriteIops : r.seqReadMiBps);
  const all = completed(check);
  const rows = [...rankBy(all.filter((e) => e.result.comparable), value), ...rankBy(all.filter((e) => !e.result.comparable), value)];
  const marks = marksFor(data, rows, diskNote);
  const title = writes ? "Disk, synced 4 KB writes" : "Disk, reading a 2 GiB file";
  const columns: Column[] = rows.map((e) => ({
    provider: e.provider,
    label: writes ? iopsText(e.result.randWriteIops) : formatShort(e.result.seqReadMiBps, "MB/s"),
    mark: marks.get(e.provider)?.mark,
    tag: e.result.comparable ? e.result.fsType : `${e.result.fsType}, not comparable`,
    segments: [{ value: value(e.result), color: providerColor(e.provider), fill: e.result.comparable ? "solid" : "striped" }],
    detail: [
      ["Sequential write", mibpsText(e.result.seqWriteMiBps)],
      ["Sequential read", mibpsText(e.result.seqReadMiBps)],
      ["4 KB synced writes", `${iopsText(e.result.randWriteIops)}/s, p99 ${Math.round(e.result.randWriteP99Us).toLocaleString("en-US")} µs`],
      ["4 KB reads", `${iopsText(e.result.randReadIops)}/s, p99 ${Math.round(e.result.randReadP99Us).toLocaleString("en-US")} µs`],
      ["Filesystem", `${e.result.fsType} at ${e.result.directory}`],
      ["Direct I/O", Object.values(e.result.direct).every(Boolean) ? "every phase" : "not every phase"],
    ],
  }));
  return (
    <>
      <ChartHead
        title={title}
        sub={writes ? "Each 4 KB write followed by fdatasync, 10 seconds · Operations per second · Tag: filesystem · Higher is better" : "Direct I/O past the guest's page cache, every page checked · MiB per second · Tag: filesystem · Higher is better"}
      />
      <Columns columns={columns} label={`${title} by provider`} />
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "The quick disk tests wrote a 64 MB file and read it straight back, so some reads came from the guest's memory cache, at speeds no disk reaches. This writes 2 GiB with direct I/O, drops the file from the cache, and reads it back with direct I/O, so the figures are measured past the sandbox's own cache." },
          { lead: "Work", text: "In the sandbox's roomiest writable directory that isn't held in memory: a 2 GiB file written 1 MiB at a time, synced, read back; then 10 seconds of 4 KB writes each synced to disk, and 10 seconds of 4 KB direct reads. Each random write puts new content in its page, and afterwards every page written is read back and checked against its last write, so a synced write the sandbox's filesystem didn't keep fails the run. Only the I/O calls are timed." },
          { lead: "Not comparable", text: "Striped bars ran on a filesystem held in memory (tmpfs), one that refused direct I/O for a phase, or under gVisor, whose own file layer sits between the sandbox and the disk, so part of their figure can be memory speed. They are listed after the rest." },
          { lead: "What it can't see", text: "Direct I/O skips the sandbox's own cache. A VM's host can still cache its disk image in the host's memory, which no test inside the sandbox can detect; read figures well above a single NVMe drive's speed (about 7 GB/s) likely include that cache." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 10 at once

function Burst({ data, check }: { data: FairnessData; check: CheckData<BurstResult> }) {
  const all = completed(check);
  const rows = [...rankBy(all.filter((e) => e.result.comparable), (r) => r.medianOps), ...rankBy(all.filter((e) => !e.result.comparable), (r) => r.medianOps)];
  const marks = marksFor(data, rows, (e) => (e.result.comparable ? undefined : `not comparable with a full cohort: ${e.result.notComparableWhy}${e.result.createErrors[0] ? `. The provider said: ${e.result.createErrors[0].error}` : ""}`));
  const columns: Column[] = rows.map((e) => ({
    provider: e.provider,
    label: formatShort(e.result.medianOps, "ops/s"),
    mark: marks.get(e.provider)?.mark,
    tag: `${e.result.relativeToSolo.toFixed(2)}× alone`,
    segments: [{ value: e.result.medianOps, color: providerColor(e.provider), fill: e.result.comparable ? "solid" : "striped" }],
    detail: [
      ["Median, at once", opsText(e.result.medianOps)],
      ["Alone, just before", opsText(e.result.soloOps)],
      ["At once ÷ alone", `${e.result.relativeToSolo.toFixed(2)}×`],
      ["Fastest ÷ slowest", `${e.result.spread.toFixed(2)}×`],
      ["Sandboxes", `${e.result.created} of ${e.result.requested} created, ${e.result.verified} verified`],
      ["Ran together", `${Math.max(0, Math.round(e.result.guaranteedOverlapS))} s of 120 s, provably`],
      ["Distinct boot IDs", `${e.result.distinctBootIds} of ${e.result.created} reported`],
    ],
  }));
  return (
    <>
      <ChartHead title="Native CPU, 10 sandboxes at once" sub="10 sandboxes of 4 vCPU on one account, 4 workers each for 2 minutes together · Median operations per second per sandbox · Tag: at once ÷ alone · Higher is better" />
      <Columns columns={columns} label="Native CPU, 10 sandboxes at once: operations per second per sandbox by provider" />
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "Agents fan out. A sandbox can be as fast as any alone and slower when ten run together on one account, for example if they share hosts or cores, and only a test that runs them together shows it." },
          { lead: "Work", text: "Ten 4 vCPU sandboxes are created at once. The first burns alone for 2 minutes, then all ten burn the same 2-minute job together. The bar is the median of the nine that didn't run alone first (it had already burned for 2 minutes); the tag divides it by the run alone. Every burn is checked as the native CPU test's are." },
          { lead: "Ran together", text: "From the host's clock, the seconds every burn must have shared. A cohort is comparable when all ten were created, all ten burns checked out, and at least 90 of the 120 seconds were provably shared; striped bars missed one of those and say which." },
          { lead: "Quotas", text: "A provider that refused some of the ten creates for an account limit is shown with what it created, and its message." },
          { lead: "Distinct kernels", text: "How many different kernel boot IDs the ten sandboxes reported. Fewer than ten distinct reported IDs is consistent with containers on one host or VMs cloned from one booted snapshot, common ways to start fast; it doesn't change the CPU figures." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// CPUs and memory

const cpusText = (r: MemoryResult) => (r.visibleCpus === null ? "not readable" : String(r.visibleCpus));
const usableText = (r: MemoryResult) => (r.usableCpus === null ? "not readable" : `${Number(r.usableCpus.toFixed(2))}${r.quotaCpus !== null ? " (quota)" : ""}`);
const memText = (r: MemoryResult) => `${r.memTotalGiB === null ? "?" : `${Math.round(r.memTotalGiB)} GiB`} shown${r.memLimitGiB !== null ? `, ${Number(r.memLimitGiB.toFixed(1))} GiB limit` : ""}`;

function Limits({ data, check }: { data: FairnessData; check: CheckData<MemoryResult> }) {
  const rows = [...completed(check)].sort((a, b) => Number(b.result.cpusOverReported === true) - Number(a.result.cpusOverReported === true) || a.provider.localeCompare(b.provider));
  const marks = marksFor(data, rows);
  const cell = "px-m py-1.5 align-top";
  return (
    <>
      <ChartHead title="CPUs and memory a sandbox shows, and what it can use" sub="nproc and MemTotal against the cgroup's CPU quota, CPU affinity and memory limit · Then 6 GiB of memory held while a 2 GiB file is written" />
      <ul className="flex flex-col gap-s sm:hidden">
        {rows.map((e) => (
          <li key={e.provider} className="text-s">
            <p className="font-medium" style={{ color: providerColor(e.provider) }}>
              <ProviderName id={e.provider} />
              {marks.get(e.provider) ? <sup className="ml-0.5 text-neutral-7">{marks.get(e.provider)?.mark}</sup> : null}
            </p>
            <p>
              {cpusText(e.result)} CPUs shown, {usableText(e.result)} usable · {memText(e.result)}
            </p>
            <p className="text-xs text-neutral-7">{memoryOutcomeText(e.result)}</p>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-xs text-neutral-7">
              {["Provider", "CPUs shown (nproc)", "CPUs usable", "Memory", "6 GiB held + 2 GiB file"].map((h) => (
                <th key={h} scope="col" className="px-m py-xs font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.provider}>
                <th scope="row" className={`${cell} font-medium whitespace-nowrap`} style={{ color: providerColor(e.provider) }}>
                  <ProviderName id={e.provider} />
                  {marks.get(e.provider) ? <sup className="ml-0.5 text-neutral-7">{marks.get(e.provider)?.mark}</sup> : null}
                </th>
                <td className={`${cell} font-mono tabular-nums`}>{cpusText(e.result)}</td>
                <td className={`${cell} font-mono tabular-nums`}>{usableText(e.result)}</td>
                <td className={cell}>{memText(e.result)}</td>
                <td className={cell}>{memoryOutcomeText(e.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "Build tools and test runners size their worker pools from nproc. A container that shows the host's 48 or 64 CPUs while its quota gives it 4 starts 48 or 64 workers on 4 CPUs' worth of time, which slows the build and can exhaust memory. That's a setting to know about, and easy to fix with an explicit worker count." },
          { lead: "Usable", text: "The tighter of the cgroup CPU quota and the CPUs the sandbox may run on, read in the sandbox's own cgroup and every parent it can see." },
          { lead: "Memory", text: "6 GiB of memory filled with values that don't compress, held while a 2 GiB file is written and synced in the disk test's directory, then every word read back and checked. A sandbox that keeps its files in memory needs 8 GiB for this. Swap use is shown when the kernel reports it; this test can't see memory compression below the guest." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Isolation and kernel (Machines)

const flagsText = (r: SecurityResult) => {
  const parts = [...r.weakeningFlags, ...r.notableFlags];
  return parts.length === 0 ? "None of the listed flags" : parts.join(" ");
};

const hasFlags = (r: SecurityResult) => r.weakeningFlags.length + r.notableFlags.length > 0;




/** The security probe's read-only facts, every provider the same questions, for the Machines section. */
export function IsolationTable({ data }: { data: FairnessData }) {
  const check = data.securityProbe;
  if (check === null) return null;
  const rows = [...completed(check)].sort((a, b) => a.provider.localeCompare(b.provider));
  const cell = "px-m py-1.5 align-top";
  const heads = ["Provider", "Isolation", "CPU", "Kernel flags", "CPU vulnerabilities (kernel's view)", "Runs as", "Fresh sandbox"];
  return (
    <>
      <ChartHead title="Isolation and kernel inside each sandbox" sub="The same read-only questions in a fresh sandbox from each provider (4 vCPU, 8 GB requested; boxd 4 vCPU, 16 GiB) · Nothing is changed in the guest" />
      <ul className="flex flex-col gap-m sm:hidden">
        {rows.map((e) => (
          <li key={e.provider} className="text-s">
            <p className="font-medium" style={{ color: providerColor(e.provider) }}>
              <ProviderName id={e.provider} />
            </p>
            <dl className="mt-xxs grid grid-cols-[7rem_1fr] gap-x-s gap-y-0.5 text-xs">
              {[
                ["Isolation", isolationText(e.result)],
                ["CPU", cpuLine(e.result.cpu)],
                ["Kernel flags", flagsText(e.result)],
                ["Vulnerabilities", vulnerableText(e.result)],
                ["Runs as", runsAsText(e.result)],
                ["Fresh sandbox", uptimeText(e.result)],
              ].map(([t, d]) => (
                <div key={t} className="contents">
                  <dt className="text-neutral-7">{t}</dt>
                  <dd className="break-words">{d}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-xs text-neutral-7">
              {heads.map((h) => (
                <th key={h} scope="col" className="px-m py-xs font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.provider}>
                <th scope="row" className={`${cell} font-medium whitespace-nowrap`} style={{ color: providerColor(e.provider) }}>
                  <ProviderName id={e.provider} />
                </th>
                <td className={cell} title={e.result.evidence.join("; ")}>
                  {isolationText(e.result)}
                </td>
                <td className={cell}>{cpuLine(e.result.cpu)}</td>
                <td className={`${cell} [overflow-wrap:anywhere] ${hasFlags(e.result) ? "font-mono" : "text-neutral-7"}`}>{flagsText(e.result)}</td>
                <td className={cell}>{vulnerableText(e.result)}</td>
                <td className={cell}>{runsAsText(e.result)}</td>
                <td className={cell}>{uptimeText(e.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Missing check={check} />
      <Footnotes
        items={[
          ...missingNotes(check),
          { lead: "Isolation", text: "Worked out from the kernel, the DMI table, the kernel command line, dmesg and PID 1, most specific first: gVisor; a container (Docker or containerd markers), and whether its CPU also reports a hypervisor; Cloud Hypervisor or Firecracker when they name themselves; a microVM when the kernel has virtio-mmio devices and no DMI table, the layout Firecracker and QEMU's microvm use; QEMU; else a VM when the CPU reports a hypervisor." },
          { lead: "Kernel flags", text: "Parameters on the kernel command line that turn a CPU mitigation off (such as spec_rstack_overflow=off) or memory hardening down (init_on_free=0), and idle tuning (cpuidle_haltpoll.force=1). Each trades some isolation margin or power for speed; they are listed, not judged." },
          { lead: "Vulnerabilities", text: "What the guest kernel reports in /sys/devices/system/cpu/vulnerabilities, only the lines that start with Vulnerable. The host may mitigate below the guest, so this is the guest's view. gVisor doesn't expose these files." },
          { lead: "Fresh sandbox", text: "How long the guest kernel had been up when the sandbox ran its first command, against how long the create took, as a lower bound on how long before the create began it was already up (the bound subtracts the whole wait for the first reply, so a bound at or below zero leaves the boot time undetermined). Uptime shorter than the create itself means it booted during the create; up seconds before can be a snapshot restore, which keeps the kernel's uptime; up minutes or hours before suggests it came from a pool or snapshot, common ways to make creates fast. A container shows its host's uptime." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pause and resume, and restart speed (state-survival)

/** Verdicts first, best kept state first; then no verdict, then not tested. */
const suspendOrder = (r: StateResult) => {
  const s = r.suspend;
  if (s.kind === "unsupported") return 7;
  if (s.kind === "failed") return 6;
  return stateVerdicts.indexOf(s.verdict);
};

/** The check's own note on a verdict, such as a changed boot ID it weighed against the processes. */
const verdictMark = (e: Completed<StateResult>) => verdictNote(e.result) ?? undefined;

const resumeText = (r: StateResult) => (r.suspend.kind === "measured" ? `pause ${msText(r.suspend.pauseMs)}, resume ${msText(r.suspend.resumeMs)}, first command ${msText(r.suspend.firstCommandMs)}` : null);

const dim = (r: StateResult) => (hasVerdict(r) ? "" : "text-neutral-7");

function PauseSurvival({ data, check }: { data: FairnessData; check: CheckData<StateResult> }) {
  const rows = [...completed(check)].sort((a, b) => suspendOrder(a.result) - suspendOrder(b.result) || a.provider.localeCompare(b.provider));
  const marks = marksFor(data, rows, verdictMark, { cBuild: false });
  const cell = "px-m py-1.5 align-top";
  const sup = (id: ProviderId) => (marks.get(id) ? <sup className="ml-0.5 text-neutral-7">{marks.get(id)?.mark}</sup> : null);
  return (
    <>
      <ChartHead title="Survives a pause with memory intact" sub="A server holding 32 MiB in memory, a worker beating once a second and a 16 MiB file · Paused, held 60 s, resumed · Then checked against the start" />
      <ul className="flex flex-col gap-s sm:hidden">
        {rows.map((e) => (
          <li key={e.provider} className="text-s">
            <p className="font-medium" style={{ color: providerColor(e.provider) }}>
              <ProviderName id={e.provider} />
              {sup(e.provider)}
            </p>
            <p className={dim(e.result)}>{suspendText(e.result)}</p>
            {e.result.suspend.kind === "measured" ? (
              <p className="text-xs text-neutral-7">
                Serving again after {servingText(e.result)} · {resumeText(e.result)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-xs text-neutral-7">
              {["Provider", "After a 60 s pause", "Serving again", "Pause, resume and first command"].map((h) => (
                <th key={h} scope="col" className="px-m py-xs font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.provider}>
                <th scope="row" className={`${cell} font-medium whitespace-nowrap`} style={{ color: providerColor(e.provider) }}>
                  <ProviderName id={e.provider} />
                  {sup(e.provider)}
                </th>
                <td className={`${cell} ${dim(e.result)}`}>{suspendText(e.result)}</td>
                <td className={`${cell} font-mono tabular-nums`}>{servingText(e.result) ?? <span className="font-sans text-neutral-7">–</span>}</td>
                <td className={`${cell} font-mono tabular-nums`}>{resumeText(e.result) ?? <span className="font-sans text-neutral-7">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "An agent that sleeps while it waits wants its dev server, its shell state and its files back as they were. A provider can freeze the sandbox's memory, keep it running, or bring back only the disk; this says which, from what the sandbox shows afterwards." },
          { lead: "Work", text: "In a fresh directory: a 16 MiB random file, an HTTP server holding a random token and 32 MiB of random bytes, and a shell worker counting a heartbeat every second, both started detached as an agent's dev server would be. Then the provider's pause, 60 seconds, and its resume. Afterwards the file's hash and the boot ID are compared with the start; the server's process ID, start time, token and memory digest are checked; and, separately, the worker's process ID, start time and heartbeat." },
          { lead: "Verdicts", text: "Memory intact: the same server, with its token and memory, and the same worker came back, and the worker missed at least 80% of the hold's heartbeats, so it was frozen. Kept running: the same, but it missed at most 20%. Files kept, processes gone: both processes confirmed gone with the file intact. Files lost: the file or its directory is gone or changed. The original server answering with its random token and memory counts for more than a changed boot ID, which a restored checkpoint can also show; such a verdict carries a note." },
          { lead: "No verdict", text: "When the evidence fits none of those, or a pause, resume or first command didn't complete, there is no verdict. That settles nothing about the provider; the reason is shown." },
          { lead: "Serving again", text: "From the resume returning until the original server answered. When it was gone, it was started again, and the time is the first command plus that restart, which leaves out the check's own reads (about)." },
          { lead: "Not tested", text: "Our SDK adapter has no pause for these providers. Stopping and starting a sandbox has no portable SDK call, so that isn't tested here." },
          runNote(check),
        ]}
      />
    </>
  );
}

const timedOf = (r: StateResult) => r.restart.samplesMs.length;
const attemptsOf = (r: StateResult) => r.restart.samplesMs.length + r.restart.failures + r.restart.startsOnly;

function RestartSpeed({ data, check }: { data: FairnessData; check: CheckData<StateResult> }) {
  const timed = completed(check).flatMap((e) => (e.result.restart.medianMs === null ? [] : [{ ...e, medianMs: e.result.restart.medianMs }]));
  const rows = [...timed].sort((a, b) => a.medianMs - b.medianMs || a.provider.localeCompare(b.provider));
  const marks = marksFor(data, rows, undefined, { cBuild: false });
  const columns: Column[] = rows.map((e) => ({
    provider: e.provider,
    label: formatValue(e.medianMs, "ms"),
    mark: marks.get(e.provider)?.mark,
    ...(timedOf(e.result) < attemptsOf(e.result) ? { tag: `${timedOf(e.result)} of ${attemptsOf(e.result)} timed` } : {}),
    segments: solid(e.provider, e.medianMs),
    detail: [
      ["Median", `${formatValue(e.medianMs, "ms")} of ${timedOf(e.result)} timed restarts`],
      ["Each restart", e.result.restart.samplesMs.map((s) => formatValue(s, "ms")).join(", ")],
      ...(e.result.restart.failures > 0 ? [["Failed", String(e.result.restart.failures)] as const] : []),
      ...(e.result.restart.startsOnly > 0 ? [["Starts, not timed", String(e.result.restart.startsOnly)] as const] : []),
    ],
  }));
  const untimed = completed(check).filter((e) => e.result.restart.medianMs === null);
  return (
    <>
      <ChartHead title="How fast a killed process restarts" sub="A server killed with SIGKILL and started again in the same sandbox, 5 attempts · Median milliseconds of the timed restarts, from the kill until the new one answers, timed in the guest · Tag: restarts timed, when not all · Lower is better" />
      <Columns columns={columns} label="How fast a killed process restarts: median milliseconds by provider" />
      <Missing check={check} />
      <NotOnChart ids={untimed.map((e) => e.provider)} lead="No restart timed for" />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          ...untimed.map((e) => ({ text: <><Who id={e.provider} />: no restart was timed ({e.result.restart.failures} failed, {e.result.restart.startsOnly} found no server to kill).</>, about: e.provider })),
          { lead: "Why", text: "When an agent's dev server crashes, or the agent restarts it after a change, this is how long the sandbox takes to have it serving again." },
          { lead: "Work", text: "The same small HTTP server each time, in the runtime the image ships. The guest kills it with SIGKILL, starts it again, and times until the new process answers on its port with its own launch nonce, so the host's round trip isn't in the figure. A trial that found no server to kill is a start, not a restart, and is left out of the median." },
          { lead: "One run", text: "Each bar is one sandbox's median of its timed restarts out of 5 attempts, from a single run per provider; the hover card lists every restart, and a tag says when fewer than 5 were timed. Figures can move between runs, so read small gaps as noise." },
          { lead: "What it isn't", text: "A process restart inside a running sandbox, not the sandbox itself stopped and started, which has no portable SDK call." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// When memory runs out (memory-pressure)

const pressureOrder = ["reached-target", "process-killed", "refused", "sandbox-restarted", "sandbox-lost", "inconclusive"] as const;

const heldText = (r: PressureResult) => `${reachedText(r)}${r.swapTotalGiB ? `, with ${gibText(r.swapTotalGiB)} swap` : ""}`;

function MemoryPressure({ data, check }: { data: FairnessData; check: CheckData<PressureResult> }) {
  const rows = [...completed(check)].sort((a, b) => pressureOrder.indexOf(a.result.outcome.kind) - pressureOrder.indexOf(b.result.outcome.kind) || (b.result.reached?.fraction ?? 0) - (a.result.reached?.fraction ?? 0) || a.provider.localeCompare(b.provider));
  const marks = marksFor(data, rows, undefined, { cBuild: false });
  const cell = "px-m py-1.5 align-top";
  const sup = (id: ProviderId) => (marks.get(id) ? <sup className="ml-0.5 text-neutral-7">{marks.get(id)?.mark}</sup> : null);
  const quiet = (r: PressureResult) => (r.outcome.kind === "inconclusive" ? "text-neutral-7" : "");
  return (
    <>
      <ChartHead title="What happens when memory runs out" sub={`One process allocates memory that doesn't compress, 64 MiB at a time, up to ${OVERSHOOT}× the advertised memory (12 GiB of 8 GiB) · What stopped it, how much it held, and what else it took down`} />
      <ul className="flex flex-col gap-s sm:hidden">
        {rows.map((e) => (
          <li key={e.provider} className="text-s">
            <p className="font-medium" style={{ color: providerColor(e.provider) }}>
              <ProviderName id={e.provider} />
              {sup(e.provider)}
            </p>
            <p className={quiet(e.result)}>{pressureOutcomeText(e.result)}</p>
            <p className="text-xs text-neutral-7">
              Held {heldText(e.result)} · {scopeText(e.result)} · Usable after: {usableAfterText(e.result)}
            </p>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-xs text-neutral-7">
              {["Provider", "What happened", "Held before it", "What it took down", "Usable after"].map((h) => (
                <th key={h} scope="col" className="px-m py-xs font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.provider}>
                <th scope="row" className={`${cell} font-medium whitespace-nowrap`} style={{ color: providerColor(e.provider) }}>
                  <ProviderName id={e.provider} />
                  {sup(e.provider)}
                </th>
                <td className={`${cell} ${quiet(e.result)}`}>{pressureOutcomeText(e.result)}</td>
                <td className={`${cell} tabular-nums`}>{heldText(e.result)}</td>
                <td className={cell}>{scopeText(e.result)}</td>
                <td className={cell}>{usableAfterText(e.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "A build or a test suite that runs out of memory should lose one process, not the whole sandbox, and the sandbox should work afterwards. This shows what each provider does when a process asks for more than the sandbox has." },
          { lead: "Work", text: `A detached process, the hog, allocates random bytes 64 MiB at a time, logging each chunk, up to ${OVERSHOOT} times the provider's advertised memory, while a shell above it records how it exits and a canary process writes the time every second. The host polls every 2 seconds and waits through silences. Afterwards: is the boot ID the same, is the canary still the same live process, and do a fresh 256 MiB allocation and a file write succeed.` },
          { lead: "What happened", text: "Only evidence counts: an exit status the shell recorded (killed is SIGKILL), the process's own refusal, a new boot ID, or the provider's own lookup saying the sandbox is gone. Anything else has no verdict, with the reason, and settles nothing about the provider." },
          { lead: "Held", text: "Exact when read from the process's whole log; \"at least\" when it is the last progress seen before the process or the sandbox went away. Memory past 100% of the advertised size came from swap or from no limit at that size." },
          { lead: "Took down", text: "Judged from one canary process, not every process in the sandbox; how the hog itself stopped is in What happened. The canary stayed alive: it was the same live process with a fresh beat. The canary was gone too: it was confirmed gone. The provider reported the sandbox gone: the provider's own lookup said the sandbox had ended, which doesn't say why. The whole sandbox rebooted: a new boot ID. Not determined otherwise. Usable after means a fresh allocation and a file write worked, not that other work survived." },
          runNote(check),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Docker and services (services)

const sText = secondsText;

const servicesMark = (e: Completed<ServicesResult>) => {
  const notes = servicesNotes(e.result);
  return notes.length > 0 ? notes.map(sentence).join(" ") : undefined;
};

function servicesColumns(rows: ReturnType<typeof servicesRanked>, path: "compose" | "native", marks: ReturnType<typeof marksFor>): Column[] {
  return rows.map((e) => {
    const p: ServicePathResult = e.result[path];
    return {
      provider: e.provider,
      label: sText(e.medianUpS),
      mark: marks.get(e.provider)?.mark,
      ...(p.green < p.attempts ? { tag: `${greenText(p)} green` } : {}),
      segments: solid(e.provider, e.medianUpS),
      detail: [
        ["Median", `${sText(e.medianUpS)} of ${p.green} green attempts`],
        ["Each green attempt", p.upS.map(sText).join(", ")],
        ["Green", greenText(p)],
        ...(p.medianDaemonS !== null ? [["Docker daemon ready (median)", sText(p.medianDaemonS)] as const] : []),
        ...(p.medianPullS !== null ? [["Image pull (median)", sText(p.medianPullS)] as const] : []),
        ...(p.medianToGreenS !== null ? [["Upload to all tests passing (median)", sText(p.medianToGreenS)] as const] : []),
        ...(path === "compose" ? [["Docker", dockerStartText(e.result)] as const] : []),
      ],
    };
  });
}

function Services({ data, check }: { data: FairnessData; check: CheckData<ServicesResult> }) {
  const rows = [...completed(check)].sort((a, b) => a.provider.localeCompare(b.provider));
  const marks = marksFor(data, rows, servicesMark, { cBuild: false });
  const compose = servicesRanked(check, "compose");
  const native = servicesRanked(check, "native");
  const noGreen = (path: "compose" | "native") => rows.filter((e) => e.result[path].medianUpS === null).map((e) => e.provider);
  const cell = "px-m py-1.5 align-top";
  const sup = (id: ProviderId) => (marks.get(id) ? <sup className="ml-0.5 text-neutral-7">{marks.get(id)?.mark}</sup> : null);
  const quiet = (p: ServicePathResult) => (p.green === 0 ? "text-neutral-7" : "");
  return (
    <>
      <ChartHead title="Docker Compose: Postgres and Redis up" sub="A small API's 9 integration tests need Postgres 16 and Redis 7 · Docker started in the sandbox, both images pulled and started · Median seconds until both answer, over green attempts of 3 · Tag: green attempts, when not all · Lower is better" />
      <Columns columns={servicesColumns(compose, "compose", marks)} label="Docker Compose: median seconds until Postgres and Redis answer, by provider" />
      <NotOnChart ids={noGreen("compose")} lead="No green attempt with Docker:" />
      <div className="mt-l">
        <ChartHead title="Without Docker: Postgres and Redis up" sub="The same servers' own binaries uploaded and started directly, no Docker · Median seconds until both answer, over green attempts of 3 · A separate ranking: this path uploads from our runner, the Docker one pulls its images from the internet · Lower is better" />
      </div>
      <Columns columns={servicesColumns(native, "native", marks)} label="Without Docker: median seconds until Postgres and Redis answer, by provider" />
      <NotOnChart ids={noGreen("native")} lead="No green attempt without Docker:" />
      <div className="mt-l">
        <ChartHead title="How Docker ran" sub="The daemon each provider's compose attempts used · Green: attempts where all 9 tests passed" />
      </div>
      <ul className="flex flex-col gap-s sm:hidden">
        {rows.map((e) => (
          <li key={e.provider} className="text-s">
            <p className="font-medium" style={{ color: providerColor(e.provider) }}>
              <ProviderName id={e.provider} />
              {sup(e.provider)}
            </p>
            <p>{dockerStartText(e.result)}</p>
            <p className="text-xs text-neutral-7">
              {serviceIsolationText[e.result.isolation]} · With Docker: {greenText(e.result.compose)} green · Without Docker: {greenText(e.result.native)} green
            </p>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-xs text-neutral-7">
              {["Provider", "Isolation", "Docker", "Green with Docker", "Green without Docker"].map((h) => (
                <th key={h} scope="col" className="px-m py-xs font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.provider}>
                <th scope="row" className={`${cell} font-medium whitespace-nowrap`} style={{ color: providerColor(e.provider) }}>
                  <ProviderName id={e.provider} />
                  {sup(e.provider)}
                </th>
                <td className={cell}>{serviceIsolationText[e.result.isolation]}</td>
                <td className={cell}>{dockerStartText(e.result)}</td>
                <td className={`${cell} tabular-nums ${quiet(e.result.compose)}`}>{greenText(e.result.compose)}</td>
                <td className={`${cell} tabular-nums ${quiet(e.result.native)}`}>{greenText(e.result.native)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Missing check={check} />
      <Footnotes
        items={[
          ...markNotes(marks),
          ...missingNotes(check),
          { lead: "Why", text: "A coding agent working on a real project has to run its integration tests, and those usually need a database and a cache. This shows whether they go green inside each provider's sandbox, with Docker or without it, and how long the services take to come up." },
          { lead: "Work", text: "Every attempt is a fresh sandbox, deleted afterwards. Both ways upload the same pinned Node and the same small notes API, wait until Postgres answers SELECT 1 and Redis answers PING, then run its 9 tests, which must all pass. With Docker: get a Docker daemon (one already running in the sandbox, used only when it runs inside the sandbox itself; else our own static Docker, fetched by hash and started as root, trying its flags in turn), then docker compose pulls postgres:16 and redis:7, pinned by digest, and starts them. Without Docker: upload relocatable Postgres 16 and a static Redis 7, check their hashes, and start them directly." },
          { lead: "Services up", text: "With Docker, from the first step toward a daemon (fetching Docker included when the image has none) until both services answer; without Docker, from the upload until they answer. Creating the sandbox isn't in it. The Docker path pulls its images from the internet inside the sandbox, and downloads Docker itself only when no daemon was already running there (a provider whose own Docker was running skipped that download), while the no-Docker path uploads from our runner, so the two are ranked apart and never compared." },
          { lead: "Docker", text: "The provider's Docker, already running: the image came with a daemon serving the socket from inside the sandbox. Our static Docker: the image had none, so we fetched Docker's static binaries and started the daemon as root. Iptables off, vfs storage and no bridge network are the flags used by the daemon that answered: our harness starts Docker with its defaults first, then tries those flags in a fixed order until a daemon answers." },
          { lead: "Green", text: "All 9 tests passed. A median counts green attempts only; an attempt that didn't go green is listed with the stage it stopped at and the last line of its output." },
          runNote(check),
        ]}
      />
    </>
  );
}

/** The like-for-like checks, Same machine only. Nothing until one has a result. */
export function FairnessSection({ data }: { data: FairnessData }) {
  const tabs = [
    ...(data.cpuNative && completed(data.cpuNative).length > 0
      ? [
          { id: "cpu", label: "Native CPU", content: <NativeCpu data={data} check={data.cpuNative} held={false} /> },
          { id: "cpu-held", label: "Held 15 min", content: <NativeCpu data={data} check={data.cpuNative} held /> },
        ]
      : []),
    ...(data.diskReal && completed(data.diskReal).length > 0
      ? [
          { id: "disk", label: "Disk read", content: <Disk data={data} check={data.diskReal} writes={false} /> },
          { id: "disk-writes", label: "Disk synced writes", content: <Disk data={data} check={data.diskReal} writes /> },
        ]
      : []),
    ...(data.cpuBurst && completed(data.cpuBurst).length > 0 ? [{ id: "ten", label: "10 at once", content: <Burst data={data} check={data.cpuBurst} /> }] : []),
    ...(data.memoryHonesty && completed(data.memoryHonesty).length > 0 ? [{ id: "limits", label: "CPUs and memory", content: <Limits data={data} check={data.memoryHonesty} /> }] : []),
    ...(data.stateSurvival && completed(data.stateSurvival).length > 0
      ? [
          { id: "pause", label: "Survives a pause", content: <PauseSurvival data={data} check={data.stateSurvival} /> },
          ...(completed(data.stateSurvival).some((e) => e.result.restart.medianMs !== null) ? [{ id: "restart", label: "Restart speed", content: <RestartSpeed data={data} check={data.stateSurvival} /> }] : []),
        ]
      : []),
    ...(data.memoryPressure && completed(data.memoryPressure).length > 0 ? [{ id: "memory-out", label: "Memory runs out", content: <MemoryPressure data={data} check={data.memoryPressure} /> }] : []),
    ...(data.services && completed(data.services).length > 0 ? [{ id: "services", label: "Docker and services", content: <Services data={data} check={data.services} /> }] : []),
  ];
  if (tabs.length === 0) return null;
  return <TabCard label="Like-for-like checks" section={fairnessSection} tabs={tabs} />;
}
