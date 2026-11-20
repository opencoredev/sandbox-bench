import type { ReactNode } from "react";

import { JumpLink } from "@/components/jump";
import { providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import type { ScoreCategory, ScoreCell } from "@/lib/score-categories";

/** What the score views need from a category: everything but the functions, so it can cross to the client. */
export type ScoreColumn = Pick<ScoreCategory, "id" | "label" | "measure" | "better" | "link">;

/** One provider's scores, one cell per column, and the footnote mark for a machine that differs from the track's. */
export interface ScoreRow {
  provider: ProviderId;
  mark: number | null;
  cells: readonly ScoreCell[];
}

/** Opens the chart a score comes from: on its tab where the section has tabs, else at the section. */
export function ScoreLink({ link, provider, category, cell, className, children }: { link: ScoreColumn["link"]; provider: ProviderId; category: string; cell: ScoreCell; className: string; children: ReactNode }) {
  const said = cell.kind === "scored" ? `${cell.score} out of 100, from ${cell.display}` : cell.kind === "excluded" ? `not counted: ${cell.why}` : "not measured";
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

/** The score, a bar filled to it in the provider's colour, and the number it came from. "Not measured" takes the same space. */
export function ScoreMeter({ cell, provider }: { cell: ScoreCell; provider: ProviderId }) {
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
    case "excluded":
      return (
        <>
          <span className="flex h-4 items-end text-xs leading-none text-neutral-7" title={cell.why}>
            Not counted
          </span>
          <span className="block h-1 w-full rounded-full bg-neutral-3" />
        </>
      );
    case "not-measured":
      return (
        <>
          <span className="flex h-4 items-end text-xs leading-none text-neutral-7">Not measured</span>
          <span className="block h-1 w-full rounded-full bg-neutral-3" />
        </>
      );
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}
