"use client";

import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useState } from "react";

import { ScoreLink, ScoreMeter } from "@/components/score-parts";
import type { ScoreColumn, ScoreRow } from "@/components/score-parts";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import { providerPageOf } from "@/lib/provider-pages";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { rankScores } from "@/lib/score";

/** Alphabetical by provider, or one category best first (highest score, or cheapest) with the not measured last. */
export type Sort = { kind: "name" } | { kind: "category"; index: number };

function sortRows(rows: readonly ScoreRow[], columns: readonly ScoreColumn[], sort: Sort): ScoreRow[] {
  switch (sort.kind) {
    case "name":
      return [...rows].sort((a, b) => providerName(a.provider).localeCompare(providerName(b.provider)));
    case "category": {
      const column = columns[sort.index];
      if (!column) return [...rows];
      const byProvider = new Map(rows.map((r) => [r.provider, r]));
      const ranked = rankScores(rows.flatMap((r) => { const c = r.cells[sort.index]; return c ? [c] : []; }), column.better);
      return ranked.flatMap((s) => { const r = byProvider.get(s.provider); return r ? [r] : []; });
    }
    default: {
      const _exhaustive: never = sort;
      return _exhaustive;
    }
  }
}

/** How a best-first column sorts, for `aria-sort`: scores fall, a lower-is-better value rises. */
function bestFirst(column: ScoreColumn): "ascending" | "descending" {
  switch (column.shows) {
    case "score":
      return "descending";
    case "value":
      return column.better === "lower" ? "ascending" : "descending";
    default: {
      const _exhaustive: never = column.shows;
      return _exhaustive;
    }
  }
}

/** A row's provider: its logo and name, a link to its page where it has one. */
function RowProvider({ provider, mark }: { provider: ProviderId; mark: number | null }) {
  const page = providerPageOf(provider);
  const name = (
    <>
      <ProviderLogo id={provider} size={16} />
      <span className="min-w-0 truncate">
        <ProviderName id={provider} />
      </span>
    </>
  );
  return (
    <span className="flex min-w-0 items-center gap-xs pl-xs text-s font-medium text-neutral-10">
      {page ? (
        <a href={page} className="focus-ring -mx-xxs flex min-w-0 items-center gap-xs rounded-xs px-xxs py-xxs underline-offset-4 decoration-neutral-6 hover:underline">
          {name}
        </a>
      ) : (
        name
      )}
      {mark === null ? null : <span className="font-mono text-xxs text-neutral-7">{mark}</span>}
    </span>
  );
}

/** The default order. */
const byName: Sort = { kind: "name" };

/** A column title's click: sort by that category, or, when it already sorts by it, back to A to Z. */
export function nextSort(current: Sort, index: number): Sort {
  return current.kind === "category" && current.index === index ? byName : { kind: "category", index };
}

/** The arrow that matches `aria-sort`: up for ascending (A to Z, cheapest first), down for descending (score 100 to 0). */
function SortArrow({ direction }: { direction: "ascending" | "descending" }) {
  const Arrow = direction === "ascending" ? ArrowUp : ArrowDown;
  return <Arrow aria-hidden className="size-3.5 text-neutral-7" />;
}

const sortBase = "focus-ring group -mx-xs flex cursor-pointer flex-col items-start gap-0.5 rounded-xs px-xs py-xxs text-left";
/** A column title fills its cell, past the cell's padding on both sides. */
const sortClass = `${sortBase} w-[calc(100%+var(--space-xs)*2)]`;

/**
 * Every provider against every category, for wide screens. A column title
 * sorts by that category, a provider's name opens its page, and each score
 * opens the chart behind it.
 */
export function ScoreTable({ columns, rows, label, initialSort = byName }: { columns: readonly ScoreColumn[]; rows: readonly ScoreRow[]; label: string; initialSort?: Sort }) {
  const [sort, setSort] = useState<Sort>(initialSort);
  const sorted = sortRows(rows, columns, sort);
  const isSorted = (index: number) => sort.kind === "category" && sort.index === index;
  return (
    <table className="w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-0 text-left">
      <caption className="sr-only">{label}. Select a column title to sort by it, and again to go back to A to Z.</caption>
      <thead>
        <tr className="align-bottom">
          <th scope="col" aria-sort={sort.kind === "name" ? "ascending" : "none"} className="w-[19%] pr-s pb-s font-normal">
            <span className="flex items-end justify-between gap-xs">
              <button type="button" className={`${sortBase} min-w-0 flex-1`} onClick={() => setSort(byName)}>
                <span className="flex items-center gap-xxs text-s font-medium text-neutral-10">
                  Provider
                  {sort.kind === "name" ? <SortArrow direction="ascending" /> : null}
                </span>
                <span className="text-xxs text-neutral-7">A to Z</span>
              </button>
              {/* Always visible while a category sorts, so there is an obvious way back to the default order. */}
              {sort.kind === "category" ? (
                <button
                  type="button"
                  className="focus-ring flex shrink-0 items-center gap-xxs rounded-xs px-xs py-xxs text-xs text-neutral-7 hover:bg-neutral-3 hover:text-neutral-10"
                  onClick={() => setSort(byName)}
                  aria-label="Reset sort to provider A to Z"
                >
                  <RotateCcw aria-hidden className="size-3" />
                  Reset
                </button>
              ) : null}
            </span>
          </th>
          {columns.map((c, i) => (
            <th key={c.id} scope="col" aria-sort={isSorted(i) ? bestFirst(c) : "none"} className="px-s pb-s font-normal">
              <button type="button" className={sortClass} onClick={() => setSort((current) => nextSort(current, i))}>
                <span className={`flex items-center gap-xxs text-s font-medium ${isSorted(i) ? "text-neutral-10" : "text-neutral-8 group-hover:text-neutral-10"}`}>
                  {c.label}
                  {isSorted(i) ? <SortArrow direction={bestFirst(c)} /> : null}
                </span>
                <span className="text-xxs text-neutral-7">{c.measure}</span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.provider} className="group/row">
            <th scope="row" className="rounded-l-s py-0 pr-s font-normal group-hover/row:bg-neutral-3/40">
              <RowProvider provider={r.provider} mark={r.mark} />
            </th>
            {r.cells.map((cell, i) => {
              const column = columns[i];
              return column ? (
                <td key={column.id} className="py-0 last:rounded-r-s group-hover/row:bg-neutral-3/40">
                  <ScoreLink link={column.link} provider={r.provider} category={column.label} cell={cell} className="mx-xxs flex flex-col gap-xs rounded-s px-xs py-xs hover:bg-neutral-3">
                    <ScoreMeter cell={cell} provider={r.provider} under={column.shows === "score" ? "track" : "space"} />
                  </ScoreLink>
                </td>
              ) : null;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
