import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, CompactNotes, Footnotes, NotOnChart, Who, sentence } from "@/components/metric-chart";
import { TabCard } from "@/components/tabs";
import type { Track } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { allocationNotes } from "@/lib/notes";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { completedText, noCostReason, profileFootprintNote, profileIds, profileInfo, profileWhat, runTrackOf, runNotes, wallText } from "@/lib/realistic";
import type { ProfileId, RealisticRow } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

/** The section id, shared with the nav and the headline cards that link here. */
export const realTasksSection = "real-tasks";

type Timed = RealisticRow & { medianWallS: number };
const isTimed = (r: RealisticRow): r is Timed => r.medianWallS !== null;

/**
 * One workload's headline rows on a track, fastest first, and the providers
 * with no time: no completed run, or no run in the pilot at all.
 */
export function taskTimes(track: Track, profile: ProfileId) {
  const rows = realistic.rows.filter((r) => r.variant === "headline" && r.track === runTrackOf[track.id] && r.profile === profile);
  const timed = rows.filter(isTimed).sort((a, b) => a.medianWallS - b.medianWallS);
  const untimed = rows.filter((r) => !isTimed(r)).map((r) => ({ id: r.provider, why: r.completed === 0 ? noCostReason(r) : "no completed run" }));
  const absent = track.providers.flatMap((p) => (rows.some((r) => r.provider === p.id) ? [] : [{ id: p.id, why: "not in the realistic pilot" }]));
  return { timed, missing: [...untimed, ...absent] };
}

/** The marks a chart carries: a machine that isn't the track's, and runs that didn't all complete. */
function marksFor(track: Track, timed: readonly Timed[]) {
  const machine = allocationNotes(track);
  const notes = new Map<ProviderId, string>();
  for (const r of timed) {
    const parts = [machine[r.provider], r.completed < r.attempts ? `${completedText(r)} runs completed; the time is the median of those` : undefined].filter((x) => x !== undefined);
    if (parts.length > 0) notes.set(r.provider, parts.map(sentence).join(" "));
  }
  let next = 0;
  return new Map([...notes].map(([id, note]) => [id, { mark: ++next, note }] as const));
}

function columnsOf(timed: readonly Timed[], marks: ReturnType<typeof marksFor>): Column[] {
  return timed.map((r) => ({
    provider: r.provider,
    label: formatShort(r.medianWallS, "s"),
    mark: marks.get(r.provider)?.mark,
    segments: [{ value: r.medianWallS, color: providerColor(r.provider), fill: "solid" }],
    detail: [
      ["Median time", wallText(r.medianWallS)],
      ["Completed", completedText(r)],
      ...(r.medianCpuS === null ? [] : [["Median CPU time", wallText(r.medianCpuS)] as const]),
    ],
  }));
}

const covers = "From the create request to confirmed deletion: setup, installing the toolchain, the work itself and cleanup, so CPU, disk and network all count.";

function notes(track: Track, profile: ProfileId, marks: ReturnType<typeof marksFor>, missing: ReturnType<typeof taskTimes>["missing"]) {
  const footprint = profileFootprintNote(realistic.workloads?.[profile] ?? null);
  return [
    ...[...marks].map(([id, m]) => ({ mark: m.mark, text: <><Who id={id} />: {m.note}</> })),
    ...missing.map(({ id, why }) => ({ text: <><Who id={id} />: no result ({why}).</> })),
    { lead: "Time", text: `${covers} Median of the runs that completed.` },
    { lead: "Runs", text: `${realistic.coverage.headline.attempts} per provider for each workload and machine. Too few for a statistical ranking, so read the times as descriptive.` },
    ...(footprint ? [{ lead: "Workload size", text: footprint }] : []),
    ...(track.id === "default" ? [{ lead: "Default machines", text: "Each provider's own default size, so sizes differ. A default too small for the workload wasn't run, and that isn't counted as a failure." }] : []),
    ...runNotes,
  ];
}

function TaskTime({ track, profile }: { track: Track; profile: ProfileId }) {
  const { timed, missing } = taskTimes(track, profile);
  const marks = marksFor(track, timed);
  const title = `${profileInfo[profile].label}: time to finish`;
  const machine = track.id === "default" ? "Each provider's default machine" : "4 vCPU, 8 GB";
  return (
    <>
      <ChartHead title={title} sub={`${profileWhat(profile, realistic.workloads?.[profile] ?? null)} · ${machine} · Median seconds · Lower is better`} />
      <Columns columns={columnsOf(timed, marks)} label={`${title} by provider`} />
      <NotOnChart ids={missing.map((m) => m.id)} />
      <Footnotes items={notes(track, profile, marks, missing)} />
    </>
  );
}

/** One card per track, a tab per workload. */
export function RealTasks({ track }: { track: Track }) {
  return (
    <TabCard
      label="Real tasks"
      section={realTasksSection}
      tabs={profileIds.map((profile) => ({ id: profile, label: profileInfo[profile].label, content: <TaskTime track={track} profile={profile} /> }))}
    />
  );
}

/** A headline card's chart: one workload's times, with its marks and missing providers in one small block. */
export function RealTaskHeadline({ track, profile, highlight }: { track: Track; profile: ProfileId; /** A provider page's chart: this provider stays bright and the rest dim. */ highlight?: ProviderId }) {
  const { timed, missing } = taskTimes(track, profile);
  const marks = marksFor(track, timed);
  return (
    <>
      <Columns columns={columnsOf(timed, marks)} label={`${profileInfo[profile].label}: time to finish by provider`} compact linked highlight={highlight} />
      <CompactNotes
        items={[
          ...[...marks].map(([id, m]) => ({ mark: m.mark, id, note: m.note })),
          ...missing.map(({ id, why }) => ({ mark: undefined, id, note: `no result (${why})` })),
        ]}
      />
    </>
  );
}
