import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, ComingNext, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import { Marker } from "@/components/scatter";
import { costBasis, costKinds, formatTaskCost, hasTaskCosts, pricedKinds, pricedTasks, unpricedTasks } from "@/lib/cost";
import type { Track } from "@/lib/data";
import { fillStyle } from "@/lib/dither";
import { allocationNotes } from "@/lib/notes";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** What a task is, said the same way everywhere it is priced. */
export const taskDefinition =
  "A task is: create a sandbox, run the 100-call tool replay, delete it. Each was its own sandbox in a separate cost run, billed per sandbox.";

/** Stands in for a cost chart until the cost run has results. */
export const NoCostResults = ({ compact = false }: { compact?: boolean }) => (
  <ComingNext compact={compact}>Cost per task comes from a separate cost run, billed per sandbox.</ComingNext>
);

/** The swatches that tell billed, metered and estimated costs apart, for the kinds a chart shows. */
export function CostLegend({ track, shape = "fill" }: { track: Track; shape?: "fill" | "marker" }) {
  const kinds = pricedKinds.filter((k) => pricedTasks(track).some((t) => t.cost.kind === k));
  return (
    <ul className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--muted)]">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-2">
          {shape === "fill" ? (
            <span aria-hidden className="inline-block size-3 shrink-0" style={fillStyle(costKinds[k].fill, { color: "var(--foreground)" })} />
          ) : (
            <Marker kind={k} color="var(--foreground)" />
          )}
          {costKinds[k].long}
        </li>
      ))}
    </ul>
  );
}

/** Columns of cost per task, cheapest first, each drawn in its kind's fill. */
export function costColumns(track: Track) {
  const machine = allocationNotes(track);
  let next = 0;
  const marks = new Map(pricedTasks(track).flatMap(({ id }) => (machine[id] ? [[id, ++next] as const] : [])));
  const columns: Column[] = pricedTasks(track).map(({ id, cost }) => ({
    provider: id,
    label: formatTaskCost(cost.usd),
    mark: marks.get(id),
    segments: [{ value: cost.usd, color: providerColor(id), variant: costKinds[cost.kind].fill }],
    detail: [`${costKinds[cost.kind].label} ${formatTaskCost(cost.usd)} per task`, costBasis(cost)],
  }));
  return { columns, marks };
}

/** Cost per task from the cost run, never mixing billed, metered and estimated silently. */
export function CostPerTaskChart({ track }: { track: Track }) {
  const head = <ChartHead title="Cost per task" sub="Create a sandbox, run the 100-call tool replay, delete it · US dollars · Lower is better" />;
  if (!hasTaskCosts(track))
    return (
      <>
        {head}
        <NoCostResults />
        <Footnotes items={[{ text: taskDefinition }]} />
      </>
    );
  const { columns, marks } = costColumns(track);
  const machine = allocationNotes(track);
  const estimates = pricedTasks(track).filter(({ cost }) => cost.kind === "estimate");
  const missing = unpricedTasks(track);
  const names = (ids: readonly { id: ProviderId }[]) => ids.map(({ id }, i) => <span key={id}>{i > 0 ? ", " : ""}<Who id={id} /></span>);
  return (
    <>
      {head}
      <CostLegend track={track} />
      <Columns columns={columns} label="Cost per task by provider" />
      <Footnotes
        items={[
          ...[...marks].map(([id, mark]) => ({ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })),
          { text: taskDefinition },
          ...(estimates.length > 0 ? [{ text: <>{names(estimates)}: list-price estimates, because billing gives no amount for them.</> }] : []),
          ...(missing.length > 0
            ? [{ text: <>No cost for {missing.map(({ id, why }, i) => <span key={id}>{i > 0 ? "; " : ""}<Who id={id} /> ({why.replace(/\.$/, "")})</span>)}.</> }]
            : []),
          { text: "Billed and metered amounts are usage charges before credits, tax and plan minimums, not invoices. Estimates use compute list price only; disk, transfer and subscriptions are left out." },
          ...trackFootnotes(track),
        ]}
      />
    </>
  );
}
