import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import { fillStyle } from "@/lib/dither";
import type { Provider, Track } from "@/lib/data";
import { formatShort, formatValue } from "@/lib/format";
import { allocationNotes, noRealPause } from "@/lib/notes";
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

/** How each provider's pause sorts: timed in parts, timed as a total, a restart rather than a pause, or absent. */
function classify(track: Track) {
  const m = track.metric("pause-resume");
  const total = (p: Provider) => m.values.find((v) => v.provider === p.id)?.p50 ?? null;
  const real = track.providers.filter((p) => !noRealPause[p.id]);
  return {
    split: real.flatMap((p) => (p.pauseSplit ? [{ p, split: p.pauseSplit }] : [])),
    whole: real.flatMap((p) => { const t = total(p); return !p.pauseSplit && t !== null ? [{ p, total: t }] : []; }),
    restart: track.providers.filter((p) => noRealPause[p.id]),
    missing: real.filter((p) => !p.pauseSplit && total(p) === null),
  };
}

/** Footnotes shared by the pause charts: what is not a pause, what has no pause, and machine exceptions. */
function pauseNotes(track: Track, marks: ReadonlyMap<ProviderId, number>, extra: readonly { text: ReactNode }[]) {
  const { restart, missing } = classify(track);
  const machine = allocationNotes(track);
  return [
    ...[...marks].map(([id, mark]) => ({ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })),
    ...extra,
    ...restart.map((p) => ({ text: <><Who id={p.id} />: not supported. {noRealPause[p.id]} We don&apos;t time a restart as a pause.</> })),
    ...(missing.length > 0 ? [{ text: <>No result for {list(missing)} (no pause support).</> }] : []),
    ...trackFootnotes(track, "pause-resume"),
  ];
}

const markMachines = (track: Track, ids: readonly ProviderId[]) => {
  const machine = allocationNotes(track);
  let next = 0;
  return new Map(ids.flatMap((id) => (machine[id] ? [[id, ++next] as const] : [])));
};

/**
 * Pause and resume as two parts of one column: hatched resume at the
 * bottom, dithered pause on top, so a slow pause and a slow resume look
 * different. Providers whose "pause" is a restart are listed as not supported.
 */
export function PauseChart({ track }: { track: Track }) {
  const { split, whole } = classify(track);
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
          { value: parts.resume, color: providerColor(p.id), variant: "hatched" },
          { value: parts.pause, color: providerColor(p.id), variant: "gradient" },
        ]
      : [{ value: sum, color: providerColor(p.id), variant: "gradient" }],
    detail: parts
      ? [`pause ${formatValue(parts.pause, "s")}`, `resume ${formatValue(parts.resume, "s")}`, `${parts.n} attempts`]
      : [`median ${formatValue(sum, "s")}`, "pause and resume not recorded apart"],
  }));

  return (
    <>
      <ChartHead title="Pause + resume" sub={`${what} · Median of each part, seconds · Lower is better`} />
      <div className="mb-5 flex gap-5 text-[12px] text-[var(--muted)]">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3" style={fillStyle("solid", { color: "var(--muted)" })} />
          Pause
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3" style={fillStyle("hatched", { color: "var(--muted)" })} />
          Resume until a command runs
        </span>
      </div>
      <Columns columns={columns} label="Pause and resume by provider" />
      <Footnotes
        items={pauseNotes(
          track,
          marks,
          whole.length > 0 ? [{ text: <>{list(whole.map((w) => w.p))}: pause and resume were not recorded apart, so the column is the total.</> }] : [],
        )}
      />
    </>
  );
}

const partText = {
  pause: { title: "Pause", what: "Pause a running sandbox until the provider confirms" },
  resume: { title: "Resume", what: "Resume a paused sandbox until a command runs" },
} as const;

/** One part on its own scale, so fast providers are not flattened by a slow one. */
export function PausePart({ track, part }: { track: Track; part: keyof typeof partText }) {
  const { split, whole } = classify(track);
  const rows = split.map(({ p, split: parts }) => ({ p, value: parts[part], n: parts.n })).sort((a, b) => a.value - b.value);
  const marks = markMachines(track, rows.map((r) => r.p.id));
  const columns: Column[] = rows.map(({ p, value, n }) => ({
    provider: p.id,
    label: formatShort(value, "s"),
    mark: marks.get(p.id),
    trace: hasTrace(track.id, "pause", p.id) ? "pause" : undefined,
    segments: [{ value, color: providerColor(p.id), variant: "gradient" }],
    detail: [`median ${formatValue(value, "s")}`, `${n} attempts`],
  }));
  return (
    <>
      <ChartHead title={partText[part].title} sub={`${partText[part].what} · Median seconds · Lower is better`} />
      <Columns columns={columns} label={`${partText[part].title} by provider`} />
      <Footnotes
        items={pauseNotes(
          track,
          marks,
          whole.length > 0 ? [{ text: <>No result for {list(whole.map((w) => w.p))}: pause and resume were not recorded apart.</> }] : [],
        )}
      />
    </>
  );
}

/** Whether a track recorded pause and resume apart for anyone, so the part tabs have something to show. */
export const hasPauseSplit = (track: Track) => classify(track).split.length > 0;
