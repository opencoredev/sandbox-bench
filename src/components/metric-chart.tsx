import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import type { Metric, MetricValue, Track } from "@/lib/data";
import { formatCount, formatShort, formatValue, unitName } from "@/lib/format";
import { absentNote, allocationNotes, mergeNotes, sentence } from "@/lib/notes";
import type { Notes } from "@/lib/notes";
import { isProviderId, providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { hasTrace } from "@/lib/traces";
import type { TraceKind } from "@/lib/traces";

export type { Notes };

/** Metrics whose columns open a time breakdown. */
const traceOf: Partial<Record<string, TraceKind>> = { cold: "cold", "tool-replay": "replay" };

/** A chart's title and its one-line "what and which way" subtitle, as Artificial Analysis writes them. */
export function ChartHead({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[17px] font-medium tracking-tight">{title}</h3>
      <p className="mt-1 text-[12.5px] text-[var(--muted)]">{sub}</p>
    </div>
  );
}

/** A chart's notes, folded into one "Notes (n)" disclosure so the chart stays the first thing read. Marks keep their numbers. */
export function Footnotes({ items }: { items: readonly { mark?: number; text: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <details className="group/notes mt-4 border-t border-[var(--line)] pt-3 text-[12px] leading-snug text-[var(--muted)]">
      <summary className="flex h-8 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-[12.5px] transition-colors duration-150 outline-none select-none hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--brand)] motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block text-[11px] transition-transform duration-150 group-open/notes:rotate-90 motion-reduce:transition-none">▶</span>
        Notes ({items.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            {item.mark === undefined ? null : <span className="w-3 shrink-0 font-mono">{item.mark}</span>}
            <span className="max-w-[90ch]">{item.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

type Measured = MetricValue & { p50: number };
const isMeasured = (v: MetricValue): v is Measured => v.p50 !== null;

const missingReason = (v: MetricValue | undefined) =>
  !v ? "not supported" : v.limitFailures > 0 ? "stopped by our plan's limit" : v.failures > 0 ? "failed every attempt" : "not supported";

/** "100 attempts" or "30 attempts, 1 failed": every attempt counts, failed ones included. */
export const attemptsLine = (v: Pick<MetricValue, "n" | "failures">) => {
  const attempts = v.n + v.failures;
  return `${formatCount(attempts)} ${attempts === 1 ? "attempt" : "attempts"}${v.failures ? `, ${formatCount(v.failures)} failed` : ""}`;
};

const better = (m: Metric) => (m.better === "lower" ? "Lower is better" : "Higher is better");

export const metricSubtitle = (m: Metric, what: string) => `${what} · Median ${unitName[m.unit]} · ${better(m)}`;

/** Footnotes every chart in a track carries: providers the track leaves out, and where this chart's data came from if not the main run. */
export const trackFootnotes = (track: Track, source?: string) => [
  ...track.absent.map((id) => ({ text: <><Who id={id} />: {absentNote(track, id)}</> })),
  ...(source && track.sourceNotes[source] ? [{ text: track.sourceNotes[source] }] : []),
];

export { sentence };

/**
 * Median of one metric per provider, best first, with p95 and sample size on
 * hover. `compact` drops the title and footnotes for a headline card. In the
 * same-machine track every provider whose machine differs gets a mark and a
 * note, whatever the chart.
 */
export function MetricChart({
  track,
  metric,
  title = metric.label,
  what,
  notes: own = {},
  only,
  compact = false,
  empty = "Not collected in this release.",
}: {
  track: Track;
  metric: Metric;
  title?: string;
  /** What was timed, ahead of the unit and direction. */
  what: string;
  notes?: Notes;
  /** Limit the chart to these providers. */
  only?: readonly ProviderId[];
  compact?: boolean;
  /** What a chart with no results says instead. */
  empty?: string;
}) {
  if (metric.values.length === 0)
    return compact ? (
      <ComingNext compact>Not collected in this release.</ComingNext>
    ) : (
      <>
        <ChartHead title={title} sub={metricSubtitle(metric, what)} />
        <ComingNext>{empty}</ComingNext>
        <Footnotes
          items={[
            ...Object.entries(own).flatMap(([id, note]) => (isProviderId(id) && note ? [{ text: <><Who id={id} />: {sentence(note)}</> }] : [])),
            ...trackFootnotes(track, metric.id),
          ]}
        />
      </>
    );
  const providers = track.providers;
  const notes = mergeNotes(allocationNotes(track), own);
  const ids = only ?? providers.map((p) => p.id);
  const values = ids.map((id) => ({ id, value: metric.values.find((v) => v.provider === id) }));
  const sign = metric.better === "lower" ? 1 : -1;
  const measured = values
    .flatMap(({ value }) => (value && isMeasured(value) ? [value] : []))
    .sort((a, b) => sign * (a.p50 - b.p50));
  const missing = values.filter(({ value }) => !value || !isMeasured(value));
  // Providers left out of this chart on purpose still get their note.
  const leftOut = only ? providers.flatMap((p) => (only.includes(p.id) || !notes[p.id] ? [] : [p.id])) : [];

  const kind = traceOf[metric.id];
  let next = 0;
  const marks = new Map<ProviderId, number>();
  for (const v of measured) if (notes[v.provider]) marks.set(v.provider, ++next);

  const columns: Column[] = measured.map((v) => ({
    provider: v.provider,
    label: formatShort(v.p50, metric.unit),
    mark: marks.get(v.provider),
    trace: kind && hasTrace(track.id, kind, v.provider) ? kind : undefined,
    segments: [{ value: v.p50, color: providerColor(v.provider), variant: "gradient" }],
    detail: [
      `median ${formatValue(v.p50, metric.unit)}`,
      ...(v.p95 === null ? [] : [`p95 ${formatValue(v.p95, metric.unit)}`]),
      ...(v.ciLow === null || v.ciHigh === null ? [] : [`95% CI ${formatValue(v.ciLow, metric.unit)}–${formatValue(v.ciHigh, metric.unit)}`]),
      attemptsLine(v),
    ],
  }));

  return (
    <>
      {compact ? null : <ChartHead title={title} sub={metricSubtitle(metric, what)} />}
      <Columns columns={columns} label={title} compact={compact} />
      {compact ? (
        <CompactNotes items={measured.flatMap((v) => { const note = notes[v.provider]; return note ? [{ mark: marks.get(v.provider), id: v.provider, note }] : []; })} />
      ) : (
        <Footnotes
          items={[
            ...measured.flatMap((v) => {
              const note = notes[v.provider];
              return note ? [{ mark: marks.get(v.provider), text: <><Who id={v.provider} />: {sentence(note)}</> }] : [];
            }),
            ...leftOut.map((id) => ({ text: <><Who id={id} />: {sentence(notes[id] ?? "")}</> })),
            ...(missing.length > 0
              ? [
                  {
                    text: (
                      <>
                        No result for{" "}
                        {missing.map(({ id, value }, i) => (
                          <span key={id}>
                            {i > 0 ? "; " : ""}
                            <Who id={id} /> ({(notes[id] ?? missingReason(value)).replace(/\.$/, "")})
                          </span>
                        ))}
                        .
                      </>
                    ),
                  },
                ]
              : []),
            ...trackFootnotes(track, metric.id),
          ]}
        />
      )}
    </>
  );
}

/** The marked notes of a headline chart, kept to one small block so no mark is left unexplained. */
export function CompactNotes({ items }: { items: readonly { mark: number | undefined; id: ProviderId; note: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1 text-[11px] leading-snug text-[var(--muted)]">
      {items.map(({ mark, id, note }) => (
        <li key={id} className="flex gap-1.5">
          <span className="w-2.5 shrink-0 font-mono">{mark}</span>
          <span>
            <Who id={id} />: {sentence(note)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Stands in for a result this release does not have yet. */
export const ComingNext = ({ compact = false, children }: { compact?: boolean; children?: ReactNode }) => (
  <p
    className={`text-[13px] leading-snug text-[var(--muted)] ${compact ? "" : "rounded-lg border border-dashed border-[var(--line)] px-4 py-6 text-center"}`}
  >
    <span className="font-medium text-[var(--foreground)]">Coming in the next update.</span> {children}
  </p>
);

export const Who = ({ id }: { id: ProviderId }) => (
  <span className="font-medium" style={{ color: providerColor(id) }}>
    {providerName(id)}
  </span>
);
