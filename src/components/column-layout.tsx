/**
 * The column chart's data shapes and layout maths, shared by the client chart
 * (components/column-chart.tsx) and the server components that draw the same bars.
 */
import type { DetailLine } from "@/components/hover-card";
import type { MarkFill } from "@/lib/marks";
import type { ProviderId } from "@/lib/providers";
import type { TraceKind } from "@/lib/traces";

export interface Segment {
  value: number;
  color: string;
  fill: MarkFill;
}

export interface Column {
  provider: ProviderId;
  /** Stacked from the baseline up. One segment for a plain column. */
  segments: readonly [Segment, ...Segment[]];
  /** Printed above the column. */
  label: string;
  /** Lines of the hover and focus card. */
  detail: readonly DetailLine[];
  /** Footnote number shown beside the provider name. */
  mark?: number;
  /** A short qualifier printed with the bar, such as a cost's kind and status. */
  tag?: string;
  /** A second short qualifier under the tag, such as what a cost leaves out. */
  note?: string;
  /** The time breakdown the column opens on click or Enter (components/trace-panel.tsx). */
  trace?: TraceKind;
}

export const total = (c: Pick<Column, "segments">) => c.segments.reduce((sum, s) => sum + s.value, 0);

/** An outlier this many times the runner-up would flatten every other column. */
const OUTLIER = 4;
/** When one is found, the axis ends this far above the runner-up instead. */
const HEADROOM = 1.3;

/** The value at the end of the axis: the largest total, or less when that total is an outlier. Shared with any view that must draw the same bars. */
export function axisMax(columns: readonly Pick<Column, "segments">[]) {
  const [first = 0, second = 0] = columns.map(total).sort((a, b) => b - a);
  return second > 0 && first > OUTLIER * second ? second * HEADROOM : Math.max(first, Number.EPSILON);
}

export interface Bar {
  /** Share of the axis each segment covers, baseline first. */
  shares: readonly number[];
  /** Share of the axis the whole bar covers. */
  length: number;
  /** The segment cut short to fit, if the bar runs past the axis. */
  broken: number | null;
}

/**
 * Lays a column out against the axis. A bar past the end is drawn to the
 * end: its largest segment absorbs the cut so the others keep their scale.
 */
export function layout(column: Pick<Column, "segments">, max: number): Bar {
  const shares = column.segments.map((s) => s.value / max);
  if (total(column) <= max) return { shares, length: total(column) / max, broken: null };
  const broken = shares.indexOf(Math.max(...shares));
  const others = shares.reduce((sum, s, i) => (i === broken ? sum : sum + s), 0);
  return {
    shares: shares.map((s, i) => (i === broken ? Math.max(1 - others, 0.25) : s)),
    length: 1,
    broken,
  };
}

/**
 * The axis break: a slanted gap through the bar, edged in its colour, so a
 * shortened bar reads as cut rather than as its true length.
 */
export function Break({ color, along }: { color: string; along: "x" | "y" }) {
  return (
    <span
      aria-hidden
      className={`absolute bg-neutral-2 ${
        along === "y"
          ? "-inset-x-1.5 top-3 h-[11px] -skew-y-[14deg] border-y-2"
          : "-inset-y-1 right-3 w-[10px] -skew-x-[20deg] border-x-2"
      }`}
      style={{ borderColor: color }}
    />
  );
}

/** A segment's share of its bar, in percent. A zero-length bar (no failures, say) has nothing to share out, so 0, never NaN. */
export function segmentPercent(bar: { length: number; shares: readonly number[] }, i: number) {
  return bar.length > 0 ? ((bar.shares[i] ?? 0) / bar.length) * 100 : 0;
}
