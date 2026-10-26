import type { CSSProperties } from "react";

import { HoverCard, detailText } from "@/components/hover-card";
import type { DetailLine } from "@/components/hover-card";
import { ProviderName } from "@/components/provider-name";
import { markFill } from "@/lib/marks";
import type { MarkFill } from "@/lib/marks";
import { providerColor, providerName } from "@/lib/providers";
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
  /** The time breakdown the column opens on click or Enter (components/trace-panel.tsx). */
  trace?: TraceKind;
}

const total = (c: Column) => c.segments.reduce((sum, s) => sum + s.value, 0);

/** An outlier this many times the runner-up would flatten every other column. */
const OUTLIER = 4;
/** When one is found, the axis ends this far above the runner-up instead. */
const HEADROOM = 1.3;

/** The value at the end of the axis: the largest total, or less when that total is an outlier. */
function axisMax(columns: readonly Column[]) {
  const [first = 0, second = 0] = columns.map(total).sort((a, b) => b - a);
  return second > 0 && first > OUTLIER * second ? second * HEADROOM : Math.max(first, Number.EPSILON);
}

interface Bar {
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
function layout(column: Column, max: number): Bar {
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

const describe = (column: Column, bar: Bar, still = false) =>
  `${providerName(column.provider)}: ${column.detail.map(detailText).join(", ")}${bar.broken === null ? "" : ". Bar shortened, not to scale"}${column.trace && !still ? ". Press Enter for the time breakdown" : ""}`;

/**
 * What makes a column a button that opens its breakdown. The panel listens on
 * the document for these attributes, so the charts stay server components.
 */
const opener = (column: Column) =>
  column.trace
    ? ({ role: "button", "aria-haspopup": "dialog", "data-trace": `${column.trace}:${column.provider}` } as const)
    : {};

/**
 * The axis break: a slanted gap through the bar, edged in its colour, so a
 * shortened bar reads as cut rather than as its true length.
 */
function Break({ color, along }: { color: string; along: "x" | "y" }) {
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

const Mark = ({ column }: { column: Column }) =>
  column.mark === undefined ? null : <sup className="ml-px text-xxs leading-none text-neutral-7">{column.mark}</sup>;

const Card = ({ column, className, style }: { column: Column; className: string; style?: CSSProperties }) => (
  <HoverCard
    provider={column.provider}
    detail={column.detail}
    hint={column.trace ? "Click for where the time goes" : undefined}
    style={style}
    className={`opacity-0 group-hover:opacity-100 group-focus:opacity-100 motion-reduce:transition-none ${className}`}
  />
);

/**
 * Vertical columns in the order given, one per provider, as Artificial
 * Analysis draws them: value on top, name underneath. Flat marks in the
 * provider's colour, rounded at the data end and square on the baseline.
 */
function Vertical({ columns, max, still = false }: { columns: readonly Column[]; max: number; still?: boolean }) {
  return (
    <>
      <div role={still ? "list" : undefined} className={`relative flex items-end border-b border-neutral-4 ${still ? "h-[200px] pt-5" : "h-[260px] pt-l"}`}>
        {columns.map((column, index) => {
          const bar = layout(column, max);
          const color = providerColor(column.provider);
          // Keep the hover card inside the chart: edge columns anchor it inward.
          const anchor =
            index < 2 ? "left-0" : index >= columns.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <div
              key={column.provider}
              aria-label={describe(column, bar, still)}
              {...(still ? { role: "listitem" } : { tabIndex: 0, ...opener(column) })}
              className={`group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none ${column.trace ? "cursor-pointer" : ""}`}
            >
              <span className="mb-1.5 shrink-0 font-mono text-xxs whitespace-nowrap sm:text-xs text-neutral-10 tabular-nums">
                {column.label}
              </span>
              {/* Stacked parts sit 2px apart in the card colour; only the top one is rounded. */}
              <div
                className="relative flex w-[min(36px,60%)] shrink-0 flex-col-reverse gap-[2px] transition-opacity duration-[var(--motion-duration)] ease-[var(--motion-easing)] group-hover:opacity-85 motion-reduce:transition-none"
                style={{ height: `${bar.length * 100}%`, minHeight: 2 }}
              >
                {column.segments.map((s, i) => (
                  <div
                    key={i}
                    aria-hidden
                    className={`relative w-full ${i === column.segments.length - 1 ? "rounded-t-xs" : ""}`}
                    style={{ height: `${((bar.shares[i] ?? 0) / bar.length) * 100}%`, ...markFill(s.fill, s.color) }}
                  >
                    {bar.broken === i ? <Break color={s.color} along="y" /> : null}
                  </div>
                ))}
              </div>
              {still ? null : <Card column={column} className={anchor} style={{ bottom: `calc(${bar.length * 100}% + 1.9rem)` }} />}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-1 -bottom-px h-px opacity-0 group-focus-visible:opacity-100"
                style={{ backgroundColor: color }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex pt-2.5">
        {columns.map((column) => (
          <span
            key={column.provider}
            className={`block min-w-0 flex-1 px-0.5 text-center text-neutral-8 ${still ? "text-xxs" : "text-xs"}`}
          >
            <ProviderName id={column.provider} layout="centered" />
            <Mark column={column} />
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * The same data as horizontal bars, one row per provider, so every name
 * reads level however narrow the card. Used for compact charts and phones.
 */
function Horizontal({ columns, max, still = false }: { columns: readonly Column[]; max: number; still?: boolean }) {
  // Values sit in one right-aligned column wide enough for the longest label.
  const valueWidth = `${Math.max(...columns.map((c) => c.label.length), 3) + 0.5}ch`;
  return (
    <div className="flex flex-col gap-xxs" role={still ? "list" : undefined}>
      {columns.map((column) => {
        const bar = layout(column, max);
        return (
          <div
            key={column.provider}
            aria-label={describe(column, bar, still)}
            {...(still ? { role: "listitem" } : { tabIndex: 0, ...opener(column) })}
            className={`group relative grid data-trace:cursor-pointer grid-cols-[5.25rem_1fr_auto] items-center gap-x-2.5 rounded-[3px] outline-none focus:bg-neutral-3 sm:min-h-[22px] sm:grid-cols-[4.75rem_1fr_auto] ${still ? "min-h-6" : "min-h-8"}`}
          >
            <span aria-hidden className="line-clamp-2 text-s leading-[1.1] text-neutral-8 sm:text-xs">
              <ProviderName id={column.provider} />
              <Mark column={column} />
            </span>
            <div aria-hidden className="relative flex h-3.5 items-stretch border-l border-neutral-4 sm:h-3">
              <div className="relative flex gap-[2px]" style={{ width: `${bar.length * 100}%`, minWidth: 2 }}>
                {column.segments.map((s, i) => (
                  <div
                    key={i}
                    className={`relative h-full ${i === column.segments.length - 1 ? "rounded-r-xs" : ""}`}
                    style={{ width: `${((bar.shares[i] ?? 0) / bar.length) * 100}%`, ...markFill(s.fill, s.color) }}
                  >
                    {bar.broken === i ? <Break color={s.color} along="x" /> : null}
                  </div>
                ))}
              </div>
            </div>
            <span
              aria-hidden
              className="text-right font-mono text-xs text-neutral-10 tabular-nums sm:text-xxs"
              style={{ width: valueWidth }}
            >
              {column.label}
            </span>
            {still ? null : <Card column={column} className="top-full right-0 mt-xxs" />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One value per provider in the order given. Wide charts get columns;
 * charts too narrow for every name (phones, small cards) get horizontal bars, so names never
 * rotate. Compact charts are short read-only columns: no focus stops, hover cards or breakdowns.
 * A single outlier is cut short with a break mark instead of flattening the rest.
 */
export function Columns({
  columns,
  label,
  compact = false,
}: {
  columns: readonly Column[];
  label: string;
  compact?: boolean;
}) {
  const max = axisMax(columns);
  const cut = columns.some((c) => total(c) > max);
  return (
    <figure aria-label={cut ? `${label}. One bar is shortened to fit and marked with a break.` : label} className="relative @container">
      {/* Nine names need about 63px a column (Superserve is 59px), so a chart narrower than
          566px gets bars: phones, the headline cards below 1280px, the Machines size charts.
          Compact charts sit inside a headline card that is itself a link, so their columns are not controls. */}
      <div className="@min-[566px]:hidden">
        <Horizontal columns={columns} max={max} still={compact} />
      </div>
      <div className="hidden @min-[566px]:block">
        <Vertical columns={columns} max={max} still={compact} />
      </div>
    </figure>
  );
}
