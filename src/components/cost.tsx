import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, ComingNext, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import { costSource, formatPerThousand, hasTaskCosts, notFromBill, perPriceLabel, pricedTasks, unpricedTasks } from "@/lib/cost";
import type { Track } from "@/lib/data";
import { allocationNotes, costNotes } from "@/lib/notes";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** What a task is, said the same way everywhere it is priced. */
export const taskDefinition = "One task = create a sandbox, run 100 tool calls, delete it";

/** Stands in for a cost chart until the cost run has results. */
export const NoCostResults = ({ compact = false }: { compact?: boolean }) => (
  <ComingNext compact={compact}>Cost per task comes from a separate cost run, billed per sandbox.</ComingNext>
);

const names = (ids: readonly ProviderId[]) => ids.map((id, i) => <span key={id}>{i > 0 ? (i === ids.length - 1 ? " and " : ", ") : ""}<Who id={id} /></span>);

/** The one visible note naming providers whose figure is not straight from a bill, and how they were priced. Empty once every figure is billed. */
export function NotFromBill({ track }: { track: Track }) {
  const groups = notFromBill(track);
  if (groups.length === 0) return null;
  const parts: ReactNode[] = groups.map(({ kind, ids, source }, i) => (
    <span key={kind}>{i > 0 ? "; " : ""}{names(ids)}: {source}</span>
  ));
  return <p className="mt-3 text-[12px] leading-snug text-pretty text-[var(--muted)]">Not from a bill yet. {parts}.</p>;
}

/** Columns of cost per task, cheapest first, all drawn alike. */
export function costColumns(track: Track) {
  const machine = allocationNotes(track);
  let next = 0;
  const marks = new Map(pricedTasks(track).flatMap(({ id }) => (machine[id] ? [[id, ++next] as const] : [])));
  const columns: Column[] = pricedTasks(track).map(({ id, cost }) => ({
    provider: id,
    label: formatPerThousand(cost.usd),
    mark: marks.get(id),
    segments: [{ value: cost.usd, color: providerColor(id), variant: "gradient" }],
    detail: [`${formatPerThousand(cost.usd)} ${perPriceLabel}`, costSource(id, cost)],
  }));
  return { columns, marks };
}

/** Cost per task from the cost run. */
export function CostPerTaskChart({ track }: { track: Track }) {
  const head = <ChartHead title="Cost per 1,000 tasks" sub={`${taskDefinition} · US dollars · Lower is better`} />;
  if (!hasTaskCosts(track))
    return (
      <>
        {head}
        <NoCostResults />
      </>
    );
  const { columns, marks } = costColumns(track);
  const machine = allocationNotes(track);
  const missing = unpricedTasks(track);
  return (
    <>
      {head}
      <Columns columns={columns} label="Cost per 1,000 tasks by provider" />
      <NotFromBill track={track} />
      <Footnotes
        items={[
          ...[...marks].map(([id, mark]) => ({ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })),
          { text: "Each task ran in its own sandbox, up to 10 per provider, in a separate cost run. The bar is the median." },
          ...(missing.length > 0
            ? [{ text: <>No cost for {missing.map(({ id, why }, i) => <span key={id}>{i > 0 ? "; " : ""}<Who id={id} /> ({why.replace(/\.$/, "")})</span>)}.</> }]
            : []),
          ...pricedTasks(track).flatMap(({ id }) => { const note = costNotes[id]; return note ? [{ text: <><Who id={id} />: {note}</> }] : []; }),
          { text: "Usage charges only: credits, tax and plan minimums are left out." },
          ...trackFootnotes(track, "cost"),
        ]}
      />
    </>
  );
}
