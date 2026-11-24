"use client";

/**
 * The column chart. A client component so the page's payload carries each
 * chart's columns as data, not as the thousands of elements they draw; the
 * server still renders the same markup into the HTML.
 */
import type { CSSProperties } from "react";

import { Break, axisMax, layout, segmentPercent, total } from "@/components/column-layout";
import type { Bar, Column } from "@/components/column-layout";
import { detailText } from "@/components/hover-card";
import { HoverCardOnDemand } from "@/components/hover-card-on-demand";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import { useTierView } from "@/components/tier-switch";
import { markFill, rowFill } from "@/lib/marks";
import { isExtraTier, providerBrand, providerColor, providerName } from "@/lib/providers";
import { providerPageOf } from "@/lib/provider-pages";
import type { ProviderPath } from "@/lib/provider-pages";
import type { ProviderId } from "@/lib/providers";
import type { TraceKind } from "@/lib/traces";

/** A share of the axis as a percentage for an inline style, rounded: 15 digits added bytes to every bar and nothing a screen can show. */
const pct = (share: number) => `${Math.round(share * 10000) / 100}%`;

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
      <span className="cc-logo-row">
        <ProviderLogo id={column.provider} size={still ? 16 : 14} />
        {still ? <Mark column={column} /> : null}
      </span>
      {still ? (
        <span className="cc-name cc-name-slant">
          <ProviderName id={column.provider} />
        </span>
      ) : (
        <>
          <span className="cc-name">
            <ProviderName id={column.provider} layout="centered" />
          </span>
          <Mark column={column} />
        </>
      )}
    </>
  );
  const linkProps = bar.kind === "page" ? ({ "aria-hidden": true, tabIndex: -1 } as const) : { "aria-label": `Open ${providerName(pageId(column.provider))}'s page` };
  return (
    <span {...tierAttrs(column)} className={`cc-label ${own ? "font-bold text-neutral-10" : "text-neutral-8"} ${still ? "text-xxs" : "text-xs"}`}>
      {page ? (
        <a
          href={page}
          {...linkProps}
          className="group/label focus-ring cc-label-link"
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
              className={`chart-col group cc-col ${action.kind === "none" ? "" : "cursor-pointer"}`}
            >
              <span className={`cc-value ${own ? "font-bold" : ""}`}>
                {column.label}
              </span>
              {/* Stacked parts sit 2px apart in the card colour; only the top one is rounded. */}
              <div
                className="chart-fade cc-bar"
                style={{ height: pct(bar.length), minHeight: 2 }}
              >
                {column.segments.map((s, i) => (
                  <div
                    key={i}
                    aria-hidden
                    className={`relative w-full ${i === column.segments.length - 1 ? "rounded-t-xs" : ""}`}
                    style={{ height: pct(segmentPercent(bar, i) / 100), ...markFill(rowFill(column.provider, s.fill), s.color) }}
                  >
                    {bar.broken === i ? <Break color={s.color} along="y" /> : null}
                  </div>
                ))}
              </div>
              <Card column={column} action={action} className={anchor} style={{ bottom: `calc(${pct(bar.length)} + 1.9rem)` }} />
              <span
                aria-hidden
                className="cc-focus-line"
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
            className={`chart-col group cc-row sm:min-h-[22px] ${still ? "min-h-6" : "min-h-8"}`}
          >
            <span aria-hidden className={`cc-row-name ${own ? "font-bold text-neutral-10" : "text-neutral-8"}`}>
              <ProviderName id={column.provider} />
              <Mark column={column} />
            </span>
            <div aria-hidden className="chart-fade cc-row-bar">
              <div className="relative flex gap-[2px]" style={{ width: pct(bar.length), minWidth: 2 }}>
                {column.segments.map((s, i) => (
                  <div
                    key={i}
                    className={`relative h-full ${i === column.segments.length - 1 ? "rounded-r-xs" : ""}`}
                    style={{ width: pct(segmentPercent(bar, i) / 100), ...markFill(rowFill(column.provider, s.fill), s.color) }}
                  >
                    {bar.broken === i ? <Break color={s.color} along="x" /> : null}
                  </div>
                ))}
              </div>
            </div>
            <span
              aria-hidden
              className={`cc-row-value ${own ? "font-bold" : ""}`}
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
  const view = useTierView();
  // A chart with extra CPU tier rows draws twice, each on its own scale, so hidden tiers never flatten the default view.
  // Only the view on screen is built: the HTML has one row per provider, and every tier is drawn once the switch asks for it.
  if (columns.some((c) => isExtraTier(c.provider)))
    return (
      <>
        <div data-tier-view="one">
          <Chart columns={columns.filter((c) => !isExtraTier(c.provider))} label={label} compact={compact} linked={linked} highlight={highlight} fixedMax={fixedMax} />
        </div>
        {view === "all" ? (
          <div data-tier-view="all">
            <Chart columns={columns} label={label} compact={compact} linked={linked} highlight={highlight} fixedMax={fixedMax} />
          </div>
        ) : null}
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
