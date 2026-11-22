import type { CSSProperties } from "react";

import { detailText } from "@/components/hover-card";
import { HoverCardOnDemand } from "@/components/hover-card-on-demand";
import type { DetailLine } from "@/components/hover-card";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import { markFill, rowFill } from "@/lib/marks";
import type { MarkFill } from "@/lib/marks";
import { isExtraTier, providerBrand, providerColor, providerName } from "@/lib/providers";
import { providerPageOf } from "@/lib/provider-pages";
import type { ProviderPath } from "@/lib/provider-pages";
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

const total = (c: Pick<Column, "segments">) => c.segments.reduce((sum, s) => sum + s.value, 0);

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

const describe = (column: Column, bar: Bar, action: Action) =>
  `${providerName(column.provider)}: ${column.detail.map(detailText).join(", ")}${bar.broken === null ? "" : ". Bar shortened, not to scale"}${action.kind === "trace" ? ". Press Enter for the time breakdown" : ""}`;

/**
 * How a column stands against the chart's highlighted provider, if any: the
 * provider itself is marked, the rest dimmed (globals.css, `.chart-col[data-dim]`).
 * With no highlight, neither attribute is set, so the chart draws as before.
 */
function emphasis(column: Column, highlight: ProviderId | undefined) {
  if (highlight === undefined) return { own: false, attrs: {} };
  const own = column.provider === highlight;
  return { own, attrs: own ? { "data-highlight": "" } : { "data-dim": "" } };
}

/**
 * What clicking a column does. A full chart's column with a trace opens its
 * time breakdown; any other column opens its provider's page, where it has
 * one, except in a compact chart that isn't a headline (`linked`), whose
 * column is only a focus stop for its card.
 */
type Action = { kind: "trace"; trace: TraceKind } | { kind: "page"; href: ProviderPath } | { kind: "none" };

/** The provider whose page a column leads to: a CPU tier leads to its provider's page, which compares the tiers. */
const pageId = (id: ProviderId) => (isExtraTier(id) ? providerBrand(id) : id);

/** A tier row past a provider's first is hidden under "One per provider" (globals.css, components/tier-switch.tsx). */
const tierAttrs = (column: Pick<Column, "provider">) => (isExtraTier(column.provider) ? { "data-tier-extra": "" } : {});

function actionOf(column: Column, still: boolean, linked: boolean): Action {
  if (!still && column.trace) return { kind: "trace", trace: column.trace };
  const href = providerPageOf(pageId(column.provider));
  return href && (linked || !still) ? { kind: "page", href } : { kind: "none" };
}

/**
 * How a column takes part in the page: a button that opens its breakdown (the
 * panel listens on the document for these attributes, so the charts stay
 * server components), a link to its provider's page, or a focus stop for its card.
 */
function target(column: Column, action: Action) {
  switch (action.kind) {
    case "trace":
      return { tabIndex: 0, role: "button", "aria-haspopup": "dialog", "data-trace": `${action.trace}:${column.provider}` } as const;
    case "page":
      return { href: action.href };
    case "none":
      return { tabIndex: 0 };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** What the card's last line offers: the breakdown, or the provider's page. */
function hintOf(column: Column, action: Action) {
  switch (action.kind) {
    case "trace":
      return "Click for where the time goes";
    case "page":
      return `Open ${providerName(pageId(column.provider))}'s page`;
    case "none":
      return undefined;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
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

const Mark = ({ column }: { column: Column }) =>
  column.mark === undefined ? null : <sup className="ml-px text-xxs leading-none text-neutral-7">{column.mark}</sup>;

const Card = ({ column, action, className, style }: { column: Column; action: Action; className: string; style?: CSSProperties }) => (
  <HoverCardOnDemand
    provider={column.provider}
    detail={column.detail}
    hint={hintOf(column, action)}
    style={style}
    className={`opacity-0 group-hover:opacity-100 group-focus:opacity-100 motion-reduce:transition-none ${className}`}
  />
);

/**
 * A column's logo and name under the chart, a link to the provider's page
 * wherever it has one. Where the bar above already leads there, the label is a
 * second way in for the pointer only, so keyboards and screen readers meet the
 * link once; under a bar that opens a breakdown, it is the page's own link.
 */
function ColumnLabel({ column, still, own, bar }: { column: Column; still: boolean; own: boolean; bar: Action }) {
  const page = providerPageOf(pageId(column.provider));
  const content = (
    <>
      {/* Each provider's mark over its name, as Artificial Analysis labels its columns. A compact chart has
          no room for 14 names side by side, so its names run diagonally down to the left from under the mark. */}
      <span className="mb-1 flex items-center justify-center">
        <ProviderLogo id={column.provider} size={still ? 16 : 14} />
        {still ? <Mark column={column} /> : null}
      </span>
      {still ? (
        <span className="absolute top-6 right-1/2 origin-top-right -rotate-45 whitespace-nowrap decoration-neutral-6 underline-offset-2 group-hover/label:underline">
          <ProviderName id={column.provider} />
        </span>
      ) : (
        <>
          <span className="decoration-neutral-6 underline-offset-2 group-hover/label:underline">
            <ProviderName id={column.provider} layout="centered" />
          </span>
          <Mark column={column} />
        </>
      )}
    </>
  );
  const linkProps = bar.kind === "page" ? ({ "aria-hidden": true, tabIndex: -1 } as const) : { "aria-label": `Open ${providerName(pageId(column.provider))}'s page` };
  return (
    <span {...tierAttrs(column)} className={`relative block min-w-0 flex-1 px-0.5 text-center ${own ? "font-bold text-neutral-10" : "text-neutral-8"} ${still ? "text-xxs" : "text-xs"}`}>
      {page ? (
        <a
          href={page}
          {...linkProps}
          className="group/label focus-ring block rounded-xs hover:text-neutral-10"
        >
          {content}
        </a>
      ) : (
        <span aria-hidden className="block">
          {content}
        </span>
      )}
      {column.tag ? <span aria-hidden className="mt-0.5 block text-xxs leading-tight text-balance text-neutral-7">{column.tag}</span> : null}
      {column.note ? <span aria-hidden className="mt-0.5 block text-xxs leading-tight text-balance text-neutral-8">{column.note}</span> : null}
    </span>
  );
}

/**
 * Vertical columns in the order given, one per provider, as Artificial
 * Analysis draws them: value on top, name underneath. Flat marks in the
 * provider's colour, rounded at the data end and square on the baseline.
 */
function Vertical({ columns, max, still = false, linked = false, highlight }: { columns: readonly Column[]; max: number; still?: boolean; linked?: boolean; highlight?: ProviderId }) {
  return (
    <>
      {/* A compact chart's names run diagonally to the left of their columns, so it leaves room on the left. */}
      <div className={`chart-cols relative flex items-end border-b border-neutral-4 ${still ? "ml-8 h-[200px] pt-5" : "h-[260px] pt-l"}`}>
        {columns.map((column, index) => {
          const bar = layout(column, max);
          const color = providerColor(column.provider);
          // Keep the hover card inside the chart: edge columns anchor it inward.
          const anchor =
            index < 2 ? "left-0" : index >= columns.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
          const action = actionOf(column, still, linked);
          const Tag = action.kind === "page" ? "a" : "div";
          const { own, attrs } = emphasis(column, highlight);
          return (
            <Tag
              key={column.provider}
              aria-label={describe(column, bar, action)}
              {...target(column, action)}
              {...attrs}
              {...tierAttrs(column)}
              className={`chart-col group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-xs outline-none ${action.kind === "none" ? "" : "cursor-pointer"}`}
            >
              <span className={`mb-1.5 shrink-0 font-mono text-xxs whitespace-nowrap sm:text-xs text-neutral-10 tabular-nums ${own ? "font-bold" : ""}`}>
                {column.label}
              </span>
              {/* Stacked parts sit 2px apart in the card colour; only the top one is rounded. */}
              <div
                className="chart-fade relative flex w-[min(36px,60%)] shrink-0 flex-col-reverse gap-[2px]"
                style={{ height: `${bar.length * 100}%`, minHeight: 2 }}
              >
                {column.segments.map((s, i) => (
                  <div
                    key={i}
                    aria-hidden
                    className={`relative w-full ${i === column.segments.length - 1 ? "rounded-t-xs" : ""}`}
                    style={{ height: `${segmentPercent(bar, i)}%`, ...markFill(rowFill(column.provider, s.fill), s.color) }}
                  >
                    {bar.broken === i ? <Break color={s.color} along="y" /> : null}
                  </div>
                ))}
              </div>
              <Card column={column} action={action} className={anchor} style={{ bottom: `calc(${bar.length * 100}% + 1.9rem)` }} />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-1 -bottom-px h-px opacity-0 group-focus-visible:opacity-100"
                style={{ backgroundColor: color }}
              />
            </Tag>
          );
        })}
      </div>
      <div className={`flex pt-2.5 ${still ? "ml-8 h-[104px]" : ""}`}>
        {columns.map((column) => (
          <ColumnLabel key={column.provider} column={column} still={still} own={emphasis(column, highlight).own} bar={actionOf(column, still, linked)} />
        ))}
      </div>
    </>
  );
}

/**
 * The same data as horizontal bars, one row per provider, so every name
 * reads level however narrow the card. Used for compact charts and phones.
 * A row that opens a breakdown keeps its name inside the button; the panel
 * links to the provider's page.
 */
function Horizontal({ columns, max, still = false, linked = false, highlight }: { columns: readonly Column[]; max: number; still?: boolean; linked?: boolean; highlight?: ProviderId }) {
  // Values sit in one right-aligned column wide enough for the longest label.
  const valueWidth = `${Math.max(...columns.map((c) => c.label.length), 3) + 0.5}ch`;
  return (
    <div className="chart-cols flex flex-col gap-xxs">
      {columns.map((column) => {
        const bar = layout(column, max);
        const action = actionOf(column, still, linked);
        const Tag = action.kind === "page" ? "a" : "div";
        const { own, attrs } = emphasis(column, highlight);
        return (
          <Tag
            key={column.provider}
            aria-label={describe(column, bar, action)}
            {...target(column, action)}
            {...attrs}
            {...tierAttrs(column)}
            className={`chart-col group relative grid data-trace:cursor-pointer grid-cols-[8.5rem_1fr_auto] items-center gap-x-2.5 rounded-[3px] outline-none sm:min-h-[22px] sm:grid-cols-[7.5rem_1fr_auto] ${still ? "min-h-6" : "min-h-8"}`}
          >
            <span aria-hidden className={`line-clamp-2 text-s leading-[1.1] sm:text-xs ${own ? "font-bold text-neutral-10" : "text-neutral-8"}`}>
              <ProviderName id={column.provider} />
              <Mark column={column} />
            </span>
            <div aria-hidden className="chart-fade relative flex h-3.5 items-stretch sm:h-3">
              <div className="relative flex gap-[2px]" style={{ width: `${bar.length * 100}%`, minWidth: 2 }}>
                {column.segments.map((s, i) => (
                  <div
                    key={i}
                    className={`relative h-full ${i === column.segments.length - 1 ? "rounded-r-xs" : ""}`}
                    style={{ width: `${segmentPercent(bar, i)}%`, ...markFill(rowFill(column.provider, s.fill), s.color) }}
                  >
                    {bar.broken === i ? <Break color={s.color} along="x" /> : null}
                  </div>
                ))}
              </div>
            </div>
            <span
              aria-hidden
              className={`text-right font-mono text-xs text-neutral-10 tabular-nums sm:text-xxs ${own ? "font-bold" : ""}`}
              style={{ width: valueWidth }}
            >
              {column.label}
            </span>
            {column.tag ? (
              <span aria-hidden className="col-span-2 col-start-2 -mt-0.5 pb-0.5 text-xxs leading-tight text-neutral-7">
                {column.tag}
                {column.note ? <span className="text-neutral-8"> · {column.note}</span> : null}
              </span>
            ) : null}
            <Card column={column} action={action} className="top-full right-0 mt-xxs" />
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * One value per provider in the order given. Wide charts get columns;
 * charts too narrow for every name (phones, small cards) get horizontal bars. Full charts keep
 * their names level; compact ones (headline cards) set them diagonally under each logo, as
 * Artificial Analysis does, and link each column to its provider's page, with no breakdown.
 * Every name under a column links to its provider's page; a full chart's bar opens its
 * breakdown where it has one and the provider's page otherwise.
 * A single outlier is cut short with a break mark instead of flattening the rest.
 */
/** A segment's share of its bar, in percent. A zero-length bar (no failures, say) has nothing to share out, so 0, never NaN. */
function segmentPercent(bar: { length: number; shares: readonly number[] }, i: number) {
  return bar.length > 0 ? ((bar.shares[i] ?? 0) / bar.length) * 100 : 0;
}

export function Columns({
  columns,
  label,
  compact = false,
  linked = false,
  highlight,
  max: fixedMax,
}: {
  columns: readonly Column[];
  label: string;
  compact?: boolean;
  /** A headline chart: each compact column links to its provider's page. */
  linked?: boolean;
  /** A provider page's chart: this provider's column stays at full colour with its name in bold, and the others dim. */
  highlight?: ProviderId;
  /** A fixed end for the axis, such as 100 for a percentage, instead of one fitted to the values. */
  max?: number;
}) {
  // A chart with extra CPU tier rows draws twice, each on its own scale, so hidden tiers never flatten the default view.
  if (columns.some((c) => isExtraTier(c.provider)))
    return (
      <>
        <div data-tier-view="one">
          <Chart columns={columns.filter((c) => !isExtraTier(c.provider))} label={label} compact={compact} linked={linked} highlight={highlight} fixedMax={fixedMax} />
        </div>
        <div data-tier-view="all">
          <Chart columns={columns} label={label} compact={compact} linked={linked} highlight={highlight} fixedMax={fixedMax} />
        </div>
      </>
    );
  return <Chart columns={columns} label={label} compact={compact} linked={linked} highlight={highlight} fixedMax={fixedMax} />;
}

function Chart({
  columns,
  label,
  compact,
  linked,
  highlight,
  fixedMax,
}: {
  columns: readonly Column[];
  label: string;
  compact: boolean;
  linked: boolean;
  highlight: ProviderId | undefined;
  fixedMax: number | undefined;
}) {
  const max = fixedMax ?? axisMax(columns);
  const cut = columns.some((c) => total(c) > max);
  return (
    <figure aria-label={cut ? `${label}. One bar is shortened to fit and marked with a break.` : label} className="relative @container">
      {/* Nine names need about 63px a column (Superserve is 59px), so a chart narrower than
          566px gets bars: phones, the headline cards below 1280px, the Machines size charts.
          A compact chart's columns link to each provider's page and show their card on hover or focus. */}
      <div className="@min-[566px]:hidden">
        <Horizontal columns={columns} max={max} still={compact} linked={linked} highlight={highlight} />
      </div>
      <div className="hidden @min-[566px]:block">
        <Vertical columns={columns} max={max} still={compact} linked={linked} highlight={highlight} />
      </div>
    </figure>
  );
}
