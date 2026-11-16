import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import { markFill } from "@/lib/marks";
import type { Provider, Track } from "@/lib/data";
import { formatShort, formatValue } from "@/lib/format";
import { allocationNotes, autoStandby } from "@/lib/notes";
import { pauses } from "@/lib/pause";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { hasTrace } from "@/lib/traces";

const what = "Pause, resume, then run a command";

const list = (ps: readonly { id: ProviderId }[]) =>
  ps.map((p, i) => (
    <span key={p.id}>
      {i > 0 ? ", " : ""}
      <Who id={p.id} />
    </span>
  ));

/**
 * How each provider's pause sorts: timed in parts, timed as a total, resumed
 * after going on standby by itself (no pause call), a restart rather than a
 * pause, or absent. See pause.ts.
 */
function classify(track: Track) {
  const all = pauses(track);
  return {
    split: all.flatMap(({ p, r }) => (r.kind === "split" ? [{ p, split: r }] : [])),
    whole: all.flatMap(({ p, r }) => (r.kind === "total" ? [{ p, total: r.total }] : [])),
    standby: all.flatMap(({ p, r }) => (r.kind === "standby" ? [{ p, standby: r }] : [])),
    restart: all.flatMap(({ p, r }) => (r.kind === "restart" ? [{ p, note: r.note }] : [])),
    missing: all.flatMap(({ p, r }) => (r.kind === "none" && !autoStandby[p.id] ? [p] : [])),
    // A provider that pauses by itself but has no standby resume in this track's data.
    standbyMissing: all.flatMap(({ p, r }) => (r.kind === "none" && autoStandby[p.id] ? [p] : [])),
  };
}

/** "Baseten has no pause call: … resumes it." plus where its resume is shown, for the charts that leave it out. */
const standbyLine = (s: { p: Provider; standby: { note: string; resume: number } }, where: string) => ({
  text: (
    <>
      <Who id={s.p.id} />: {sentence(s.standby.note)} {where}
    </>
  ),
});

/** Footnotes shared by the pause charts: what is not a pause, what has no pause, and machine exceptions. */
function pauseNotes(track: Track, marks: ReadonlyMap<ProviderId, number>, extra: readonly { mark?: number; text: ReactNode }[]) {
  const { restart, missing, standbyMissing } = classify(track);
  const machine = allocationNotes(track);
  return [
    ...[...marks].flatMap(([id, mark]) => (machine[id] ? [{ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> }] : [])),
    ...extra,
    ...restart.map(({ p, note }) => ({ text: <><Who id={p.id} />: not supported. {note} We don&apos;t time a restart as a pause.</> })),
    ...(missing.length > 0 ? [{ text: <>No result for {list(missing)} (no pause support).</> }] : []),
    ...standbyMissing.map((p) => ({ text: <><Who id={p.id} />: {sentence(autoStandby[p.id] ?? "")} No resume after standby measured in this track yet.</> })),
    ...trackFootnotes(track, "pause-resume"),
  ];
}

const markMachines = (track: Track, ids: readonly ProviderId[]) => {
  const machine = allocationNotes(track);
  let next = 0;
  return new Map(ids.flatMap((id) => (machine[id] ? [[id, ++next] as const] : [])));
};

/**
 * Pause and resume as two parts of one column: striped resume at the
 * bottom, solid pause on top, so a slow pause and a slow resume look
 * different. Providers whose "pause" is a restart are listed as not
 * supported, and one that pauses by itself is listed, not drawn: it has no
 * pause to add, so a column would read as a zero-second pause.
 */
export function PauseChart({ track }: { track: Track }) {
  const { split, whole, standby } = classify(track);
  const rows = [
    ...split.map(({ p, split: parts }) => ({ p, sum: parts.pause + parts.resume, parts })),
    ...whole.map(({ p, total }) => ({ p, sum: total, parts: null })),
  ].sort((a, b) => a.sum - b.sum);
  const marks = markMachines(track, rows.map((r) => r.p.id));
  const columns: Column[] = rows.map(({ p, sum, parts }) => ({
    provider: p.id,
    label: formatShort(sum, "s"),
    mark: marks.get(p.id),
    trace: hasTrace(track.id, "pause", p.id) ? "pause" : undefined,
    segments: parts
      ? [
          { value: parts.resume, color: providerColor(p.id), fill: "striped" },
          { value: parts.pause, color: providerColor(p.id), fill: "solid" },
        ]
      : [{ value: sum, color: providerColor(p.id), fill: "solid" }],
    detail: parts
      ? [["Pause", formatValue(parts.pause, "s")], ["Resume", formatValue(parts.resume, "s")], ["Attempts", String(parts.n)]]
      : [["Median", formatValue(sum, "s")], "Pause and resume not recorded apart"],
  }));

  return (
    <>
      <ChartHead title="Pause + resume" sub={`${what} · Median of each part, seconds · Lower is better`} />
      <div className="mb-5 flex gap-5 text-xs text-neutral-7">
        <span className="flex items-center gap-xs">
          <span aria-hidden className="inline-block size-3 rounded-[2px]" style={markFill("solid", "var(--neutral-7)")} />
          Pause
        </span>
        <span className="flex items-center gap-xs">
          <span aria-hidden className="inline-block size-3 rounded-[2px]" style={markFill("striped", "var(--neutral-7)")} />
          Resume until a command runs
        </span>
      </div>
      <Columns columns={columns} label="Pause and resume by provider" />
      <Footnotes
        items={pauseNotes(track, marks, [
          ...(whole.length > 0 ? [{ text: <>{list(whole.map((w) => w.p))}: pause and resume were not recorded apart, so the column is the total.</> }] : []),
          ...standby.map((s) => standbyLine(s, `With no pause to add, it isn't drawn here; its resume is on the Resume tab.`)),
        ])}
      />
    </>
  );
}

const partText = {
  pause: { title: "Pause", what: "Pause a running sandbox until the provider confirms" },
  resume: { title: "Resume", what: "Resume a paused sandbox until a command runs" },
} as const;

/**
 * One part on its own scale, so fast providers are not flattened by a slow
 * one. The resume part also draws providers that pause by themselves, whose
 * resume is the first command after standby, each marked and explained.
 */
export function PausePart({ track, part }: { track: Track; part: keyof typeof partText }) {
  const { split, whole, standby } = classify(track);
  const rows = [
    ...split.map(({ p, split: parts }) => ({ p, value: parts[part], n: parts.n, idleS: null })),
    ...(part === "resume" ? standby.map(({ p, standby: s }) => ({ p, value: s.resume, n: s.n, idleS: s.idleS })) : []),
  ].sort((a, b) => a.value - b.value);
  const marks = markMachines(track, rows.map((r) => r.p.id));
  // Standby rows carry their own mark after the machine marks, pointing at the line that says what they measure.
  let next = marks.size;
  const standbyMarks = new Map(rows.flatMap((r) => (r.idleS !== null ? [[r.p.id, ++next] as const] : [])));
  const columns: Column[] = rows.map(({ p, value, n, idleS }) => ({
    provider: p.id,
    label: formatShort(value, "s"),
    mark: marks.get(p.id) ?? standbyMarks.get(p.id),
    trace: hasTrace(track.id, "pause", p.id) ? "pause" : undefined,
    segments: [{ value, color: providerColor(p.id), fill: idleS === null ? "solid" : "striped" }],
    detail:
      idleS === null
        ? [["Median", formatValue(value, "s")], ["Attempts", String(n)]]
        : [["Median", formatValue(value, "s")], ["Idle first", formatValue(idleS, "s")], ["Attempts", String(n)], "No pause call: resumed from standby"],
  }));
  const standbyNotes = standby.map((s) =>
    part === "resume"
      ? {
          mark: standbyMarks.get(s.p.id),
          text: (
            <>
              <Who id={s.p.id} />: {sentence(s.standby.note)} Striped: its resume is the first command after {formatValue(s.standby.idleS, "s")} with no requests, each standby confirmed from inside the sandbox.
            </>
          ),
        }
      : standbyLine(s, "There is no pause call to time, so it has no column here."),
  );
  return (
    <>
      <ChartHead title={partText[part].title} sub={`${partText[part].what} · Median seconds · Lower is better`} />
      <Columns columns={columns} label={`${partText[part].title} by provider`} />
      <Footnotes
        items={pauseNotes(track, marks, [
          ...standbyNotes,
          ...(whole.length > 0 ? [{ text: <>No result for {list(whole.map((w) => w.p))}: pause and resume were not recorded apart.</> }] : []),
        ])}
      />
    </>
  );
}

/** Whether a track has a resume time for anyone, so the part tabs have something to show. */
export const hasPauseSplit = (track: Track) => {
  const { split, standby } = classify(track);
  return split.length > 0 || standby.length > 0;
};
