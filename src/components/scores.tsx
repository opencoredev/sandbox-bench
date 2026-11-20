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
  const columns: ScoreColumn[] = byCategory.map(({ category: { id, label, measure, better, shows, link } }) => ({ id, label, measure, better, shows, link }));
  const machine = allocationNotes(track);
  const marked = track.providers.flatMap((p) => (machine[p.id] ? [p.id] : []));
  const rows: ScoreRow[] = track.providers.map((p) => ({
    provider: p.id,
    mark: marked.includes(p.id) ? marked.indexOf(p.id) + 1 : null,
    cells: byCategory.map(({ scores }) => scores.find((s) => s.provider === p.id) ?? { kind: "not-measured", provider: p.id }),
  }));
  return { columns, rows, notes: marked.map((id, i) => ({ mark: i + 1, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })) };
}

/** One category, best first, for phones: each row opens the chart behind it. A value column right-aligns its numbers. */
function RankedList({ column, rows, index }: { column: ScoreColumn; rows: readonly ScoreRow[]; index: number }) {
  const cells = rows.flatMap((r) => { const c = r.cells[index]; return c ? [c] : []; });
  const marks = new Map(rows.map((r) => [r.provider, r.mark]));
  const valued = column.shows === "value";
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
                <span className={`flex flex-col gap-xxs ${valued ? "items-end" : ""}`}>
                  <ScoreMeter cell={cell} provider={cell.provider} under={valued ? "none" : "track"} />
                </span>
              </ScoreLink>
            </li>
          );
        })}
      </ol>
    </>
  );
}

const label = "Scores by category: speed, real tasks and bursts 0 to 100, cost in dollars per 1,000 tasks";

/**
 * Each provider's score per category, for one track: a sortable table on wide
 * screens, a tab per category on phones. A one-line key sits under it.
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
      <p className="mt-m max-w-[80ch] text-s text-pretty text-neutral-8">
        Twice as slow as the best scores 50. Not measured means no result yet, not a 0. Not counted means the chart leaves it out; open it for why.
      </p>
      <Footnotes items={notes} />
    </>
  );
}
