import type { ReactNode } from "react";

import { JumpLink } from "@/components/jump";
import { providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import type { ScoreCategory, ScoreCell } from "@/lib/score-categories";

/** What the score views need from a category: everything but the functions, so it can cross to the client. */
export type ScoreColumn = Pick<ScoreCategory, "id" | "label" | "measure" | "better" | "shows" | "link">;

/** One provider's scores, one cell per column, and the footnote mark for a machine that differs from the track's. */
export interface ScoreRow {
  provider: ProviderId;
  mark: number | null;
  cells: readonly ScoreCell[];
}

/** The cell as a screen reader says it: "64 out of 100, from 1.2 s", "$0.76", "$8.87, usage cost, unsettled", "not measured". */
function spoken(cell: ScoreCell): string {
  switch (cell.kind) {
    case "scored":
      return `${cell.score} out of 100, from ${cell.display}`;
    case "valued":
      return cell.tag === null ? cell.display : `${cell.display}, ${cell.tag}`;
    case "excluded":
      return `not counted: ${cell.why}`;
    case "not-measured":
      return "not measured";
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}

/** Opens the chart a score comes from: on its tab where the section has tabs, else at the section. */
export function ScoreLink({ link, provider, category, cell, className, children }: { link: ScoreColumn["link"]; provider: ProviderId; category: string; cell: ScoreCell; className: string; children: ReactNode }) {
  const said = spoken(cell);
  const content = (
    <>
      <span className="sr-only">
        {providerName(provider)}, {category}: {said}. Open the chart.
      </span>
      <span aria-hidden className="contents">
        {children}
      </span>
    </>
  );
  const classes = `focus-ring ${className}`;
  return link.tab === null ? (
    <a href={`#${link.section}`} className={classes}>
      {content}
    </a>
  ) : (
    <JumpLink section={link.section} tab={link.tab} className={classes}>
      {content}
    </JumpLink>
  );
}

/**
 * What sits under a reading with no bar of its own: an empty track in a scored
 * column, blank space in a table's value column so its rows line up with the
 * bars beside it, and nothing in a list of values, which has no bars to match.
 */
export type Under = "track" | "space" | "none";

function EmptyBar({ under }: { under: Under }) {
  switch (under) {
    case "track":
      return <span aria-hidden className="block h-1 w-full rounded-full bg-neutral-3" />;
    case "space":
      return <span aria-hidden className="block h-1" />;
    case "none":
      return null;
    default: {
      const _exhaustive: never = under;
      return _exhaustive;
    }
  }
}

/**
 * The score, a bar filled to it in the provider's colour, and the number it
 * came from; in a value column, the number alone. Every state takes the same
 * space, so rows line up across columns.
 */
export function ScoreMeter({ cell, provider, under }: { cell: ScoreCell; provider: ProviderId; under: Under }) {
  switch (cell.kind) {
    case "scored":
      return (
        <>
          <span className="flex items-baseline justify-between gap-xs">
            <span className="font-mono text-m leading-none font-medium tabular-nums text-neutral-10">{cell.score}</span>
            <span className="truncate text-xs leading-none tabular-nums text-neutral-7">{cell.display}</span>
          </span>
          <span className="block h-1 w-full overflow-hidden rounded-full bg-neutral-4">
            <span className="block h-full rounded-full" style={{ width: `${cell.score}%`, backgroundColor: providerColor(provider) }} />
          </span>
        </>
      );
    case "valued":
      return (
        <>
          <span className="text-m leading-none font-medium tabular-nums text-neutral-10">{cell.display}</span>
          {/* Only a usage cost (Archil's) has a tag; every other value keeps the bar's space under it. */}
          {cell.tag === null ? <EmptyBar under={under} /> : <span className="block text-xxs leading-tight text-pretty text-neutral-7">{cell.tag}</span>}
        </>
      );
    case "excluded":
      return (
        <>
          <span className="flex h-4 items-end text-xs leading-none text-neutral-7" title={cell.why}>
            Not counted
          </span>
          <EmptyBar under={under} />
        </>
      );
    case "not-measured":
      return (
        <>
          <span className="flex h-4 items-end text-xs leading-none text-neutral-7">Not measured</span>
          <EmptyBar under={under} />
        </>
      );
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}
