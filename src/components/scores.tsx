import { Footnotes, Who, sentence } from "@/components/metric-chart";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import { ScoreLink, ScoreMeter } from "@/components/score-parts";
import type { ScoreColumn, ScoreRow } from "@/components/score-parts";
import { ScoreTable } from "@/components/score-table";
import { Card, TabCard } from "@/components/tabs";
import type { Track } from "@/lib/data";
import { allocationNotes } from "@/lib/notes";
import { rankScores } from "@/lib/score";
import { trackScores } from "@/lib/score-categories";

/** The section id, for the nav. */
export const scoresSection = "scores";

/** The scores as rows and columns, with a numbered mark for each provider whose machine differs from the track's. */
function scoreGrid(track: Track) {
  const byCategory = trackScores(track);
  const columns: ScoreColumn[] = byCategory.map(({ category: { id, label, measure, better, link } }) => ({ id, label, measure, better, link }));
  const machine = allocationNotes(track);
  const marked = track.providers.flatMap((p) => (machine[p.id] ? [p.id] : []));
  const rows: ScoreRow[] = track.providers.map((p) => ({
    provider: p.id,
    mark: marked.includes(p.id) ? marked.indexOf(p.id) + 1 : null,
    cells: byCategory.map(({ scores }) => scores.find((s) => s.provider === p.id) ?? { kind: "not-measured", provider: p.id }),
  }));
  return { columns, rows, notes: marked.map((id, i) => ({ mark: i + 1, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })) };
}

/** One category, best first, for phones: each row opens the chart behind it. */
function RankedList({ column, rows, index }: { column: ScoreColumn; rows: readonly ScoreRow[]; index: number }) {
  const cells = rows.flatMap((r) => { const c = r.cells[index]; return c ? [c] : []; });
  const marks = new Map(rows.map((r) => [r.provider, r.mark]));
  return (
    <>
      <p className="mb-s text-xs text-neutral-7">
        {column.measure} · {column.better === "lower" ? "lower" : "higher"} is better
      </p>
      <ol className="flex flex-col">
        {rankScores(cells, column.better).map((cell) => {
          const mark = marks.get(cell.provider) ?? null;
          return (
            <li key={cell.provider}>
              <ScoreLink link={column.link} provider={cell.provider} category={column.label} cell={cell} className="-mx-xs grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-s rounded-s px-xs py-xs hover:bg-neutral-3">
                <span className="flex min-w-0 items-center gap-xs text-s font-medium">
                  <ProviderLogo id={cell.provider} size={16} />
                  <span className="min-w-0 truncate">
                    <ProviderName id={cell.provider} />
                  </span>
                  {mark === null ? null : <span className="font-mono text-xxs text-neutral-7">{mark}</span>}
                </span>
                <span className="flex flex-col gap-xxs">
                  <ScoreMeter cell={cell} provider={cell.provider} />
                </span>
              </ScoreLink>
            </li>
          );
        })}
      </ol>
    </>
  );
}

const label = "Scores by category, 0 to 100";

/**
 * Each provider's score per category, for one track: a sortable table on wide
 * screens, a tab per category on phones. The formula sits under it, in words.
 */
export function Scores({ track }: { track: Track }) {
  const { columns, rows, notes } = scoreGrid(track);
  return (
    <>
      <div className="md:hidden">
        <TabCard label={label} tabs={columns.map((c, i) => ({ id: `score-${c.id}`, label: c.label, content: <RankedList column={c} rows={rows} index={i} /> }))} />
      </div>
      <Card className="hidden md:block">
        <ScoreTable columns={columns} rows={rows} label={label} />
      </Card>
      <div className="mt-m flex max-w-[80ch] flex-col gap-xs text-s text-pretty text-neutral-8">
        <p>
          <span className="font-medium text-neutral-10">How a score is made.</span> Each category is scored on its own against the best provider in it, from the
          number in the linked chart. Where lower is better, the score is 100 × the best result ÷ this result. For success rate, where higher is better, it is
          100 × this result ÷ the best. Scores are rounded down, so the best scores 100 and a provider twice as slow or twice as expensive scores 50.
        </p>
        <p>
          Categories are never added up into one score. Not measured means the chart has no result for that provider; it is not a 0. Not counted means
          the chart shows a result but leaves it out of the comparison, by the chart&apos;s own rule: for cost, more than one failed run or the wrong
          machine size. Cost and real-task results come from pilot runs, and some costs are estimates; the linked charts say which.
        </p>
      </div>
      <Footnotes items={notes} />
    </>
  );
}
