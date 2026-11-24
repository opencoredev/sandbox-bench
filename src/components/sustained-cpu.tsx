import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, NotOnChart, Who, sentence } from "@/components/metric-chart";
import { SustainedCpuLines } from "@/components/sustained-cpu-lines";
import { TabCard } from "@/components/tabs";
import { tracks } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { allocationNotes } from "@/lib/notes";
import { cpuCaveat, providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import {
  firstWindowLabel,
  hasSustainedCpu,
  lastWindowLabel,
  minutesText,
  opsText,
  retentionText,
  sustainedRanked,
} from "@/lib/sustained-cpu";
import type { SteadyRun, SustainedCpuData, SustainedProvider } from "@/lib/sustained-cpu";

/** The section id, for the page and any link that opens a tab: `#sustained-cpu/steady`. */
export const sustainedCpuSection = "sustained-cpu";

type Note = { mark?: number; lead?: string; text: ReactNode; about?: ProviderId };

/** Per provider, the same machine note every same-machine chart carries, and why a run that is on the chart stopped early. */
function marksFor(ranked: readonly SteadyRun[]) {
  const machine = allocationNotes(tracks["same-spec"]);
  let next = 0;
  const marks = new Map<ProviderId, { mark: number; note: string }>();
  for (const p of ranked) {
    const stopped = p.status === "completed" ? undefined : `Stopped at ${minutesText(p.durationS)}: ${p.stopReason}`;
    const note = [machine[p.provider], stopped].filter((x) => x !== undefined).map(sentence).join(" ");
    if (note) marks.set(p.provider, { mark: ++next, note });
  }
  return marks;
}

function steadyColumns(ranked: readonly SteadyRun[], marks: ReturnType<typeof marksFor>): Column[] {
  return ranked.map((p) => {
    const caveat = cpuCaveat(p.provider);
    return {
      provider: p.provider,
      label: formatShort(p.last3MinOps, "ops/s"),
      mark: marks.get(p.provider)?.mark,
      tag: retentionText(p.retention),
      segments: [{ value: p.last3MinOps, color: providerColor(p.provider), fill: "solid" }],
      // Values stay short: the card's value column takes its widest value.
      detail: [
        [lastWindowLabel, opsText(p.last3MinOps)],
        [firstWindowLabel, opsText(p.first3MinOps)],
        ["Retention", retentionText(p.retention)],
        ["Guest vCPU", p.guestVcpus === null ? "not reported" : String(p.guestVcpus)],
        ["Duration", minutesText(p.durationS)],
        ...(p.status === "completed" ? [] : [sentence(`Stopped early: ${p.stopReason}`)]),
        ...(caveat ? [sentence(caveat.detail)] : []),
      ],
    };
  });
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The notes both tabs carry: the workload, why it runs 15 minutes, how retention is worked out, and the run. */
function sharedNotes(data: SustainedCpuData): Note[] {
  return [
    {
      lead: "Work",
      text: `${data.segmentsTarget} back-to-back ${data.segmentDurationS}-second segments of all-core 32-bit LCG arithmetic, ${minutesText(data.targetDurationS)} in all, with each segment's checksum verified. Same machine: every provider asked for 4 vCPU and 8 GB.`,
    },
    {
      lead: "Why 15 minutes",
      text: "Some CPU classes run at full speed on burst credit and then drop to a baseline share. A test of a minute or two sees only the burst; 15 minutes runs past Styne's 10-minute credit window (the dashed line).",
    },
    { lead: "Retention", text: `The mean of the segments that start in minutes 12–15 divided by the mean of those that start in minutes 0–3 (the shaded bands). 100% means the sandbox held its speed.` },
    { lead: "Runs", text: `One run per provider, from ${dayOf(data.run.startedAt)} (SDK commit ${data.run.sdkCommit.slice(0, 7)}). A single run, so read small gaps as noise.` },
  ];
}

/** Providers the chart has no figure for, each with its exact reason. */
const missingNotes = (missing: readonly { provider: ProviderId; why: string }[]): Note[] =>
  missing.map(({ provider, why }) => ({ text: <><Who id={provider} />: no result ({why}).</>, about: provider }));

/** Lines need at least one finished segment; legend order follows the steady-state ranking, then the rest by how far they got. */
function lineRuns(data: SustainedCpuData, ranked: readonly SteadyRun[]): SustainedProvider[] {
  const rankedIds = new Set(ranked.map((p) => p.provider));
  const rest = data.providers.filter((p) => !rankedIds.has(p.provider) && p.segments.length > 0).sort((a, b) => b.durationS - a.durationS);
  return [...ranked, ...rest];
}

/**
 * Sustained CPU over 15 minutes on Same machine: the all-core rate across the
 * run, and the steady state in its last 3 minutes. Nothing until the file has a provider.
 */
export function SustainedCpuSection({ data }: { data: SustainedCpuData }) {
  if (!hasSustainedCpu(data)) return null;
  const { ranked, missing } = sustainedRanked(data);
  const marks = marksFor(ranked);
  const lines = lineRuns(data, ranked);
  const noLine = data.providers.filter((p) => p.segments.length === 0);
  const shared = sharedNotes(data);
  const over = (
    <>
      <ChartHead title="Sustained CPU over 15 minutes" sub="All cores, 4 vCPU, 8 GB · Million operations per second per 30-second segment · Higher is better" />
      <SustainedCpuLines providers={lines} />
      <NotOnChart ids={noLine.map((p) => p.provider)} />
      <Footnotes
        items={[
          ...missingNotes(missing.filter((m) => noLine.some((p) => p.provider === m.provider))),
          { text: "Each point is one segment. Hover, focus or select a provider to highlight its line and see its first and last 3 minutes." },
          ...shared,
        ]}
      />
    </>
  );
  const steady = (
    <>
      <ChartHead title="Sustained CPU, minutes 12–15" sub="All cores, 4 vCPU, 8 GB · Mean operations per second over the last 3 minutes · Tag: retention, minutes 12–15 ÷ minutes 0–3 · Higher is better" />
      {ranked.length > 0 ? <Columns columns={steadyColumns(ranked, marks)} label="Sustained CPU, minutes 12–15: operations per second by provider" /> : <p className="text-s text-neutral-7">No provider reached minute 12.</p>}
      <NotOnChart ids={missing.map((m) => m.provider)} />
      <Footnotes
        items={[
          ...[...marks].map(([id, m]) => ({ mark: m.mark, text: <><Who id={id} />: {m.note}</>, about: id })),
          ...missingNotes(missing),
          ...shared,
        ]}
      />
    </>
  );
  return (
    <TabCard
      label="Sustained CPU"
      section={sustainedCpuSection}
      tabs={[
        { id: "over-time", label: "Over 15 minutes", content: over },
        { id: "steady", label: "Steady state, 12–15 min", content: steady },
      ]}
    />
  );
}
