"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
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
type Sort = { kind: "name" } | { kind: "category"; index: number };

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

const sortClass = "focus-ring group -mx-xs flex w-[calc(100%+var(--space-xs)*2)] cursor-pointer flex-col items-start gap-0.5 rounded-xs px-xs py-xxs text-left";

/**
 * Every provider against every category, for wide screens. A column title
 * sorts by that category, a provider's name opens its page, and each score
 * opens the chart behind it.
 */
export function ScoreTable({ columns, rows, label }: { columns: readonly ScoreColumn[]; rows: readonly ScoreRow[]; label: string }) {
  const [sort, setSort] = useState<Sort>({ kind: "name" });
  const sorted = sortRows(rows, columns, sort);
  const isSorted = (index: number) => sort.kind === "category" && sort.index === index;
  return (
    <table className="w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-0 text-left">
      <caption className="sr-only">{label}. Select a column title to sort by it.</caption>
      <thead>
        <tr className="align-bottom">
          <th scope="col" aria-sort={sort.kind === "name" ? "ascending" : "none"} className="w-[19%] pr-s pb-s font-normal">
            <button type="button" className={sortClass} onClick={() => setSort({ kind: "name" })}>
              <span className="flex items-center gap-xxs text-s font-medium text-neutral-10">
                Provider
                {sort.kind === "name" ? <ArrowUp aria-hidden className="size-3.5 text-neutral-7" /> : null}
              </span>
              <span className="text-xxs text-neutral-7">A to Z</span>
            </button>
          </th>
          {columns.map((c, i) => (
            <th key={c.id} scope="col" aria-sort={isSorted(i) ? bestFirst(c) : "none"} className="px-s pb-s font-normal">
              <button type="button" className={sortClass} onClick={() => setSort({ kind: "category", index: i })}>
                <span className={`flex items-center gap-xxs text-s font-medium ${isSorted(i) ? "text-neutral-10" : "text-neutral-8 group-hover:text-neutral-10"}`}>
                  {c.label}
                  {isSorted(i) ? <ArrowDown aria-hidden className="size-3.5 text-neutral-7" /> : null}
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
