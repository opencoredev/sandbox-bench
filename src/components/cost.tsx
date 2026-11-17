import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, ComingNext, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import {
  billingBases,
  billingLabel,
  costPick,
  costSource,
  hasTaskCosts,
  hourlyText,
  isLowerBound,
  machineText,
  noPickLabel,
  noPickWhy,
  perTaskLifetimeNote,
  perThousandText,
  pickLabel,
  pricedTasks,
  regionNote,
  unpricedTasks,
  wholeMachine,
  wholeMachineLabel,
} from "@/lib/cost";
import type { PricedTask } from "@/lib/cost";
import { provider } from "@/lib/data";
import type { Track } from "@/lib/data";
import { allocationNotes } from "@/lib/notes";
import { providerColor } from "@/lib/providers";

/** Stands in for a cost chart until the cost run has results. */
export const NoCostResults = ({ compact = false }: { compact?: boolean }) => (
  <ComingNext compact={compact}>Cost per task comes from a separate cost run, billed per sandbox.</ComingNext>
);

/** Columns of cost per task, lowest first. */
export function costColumns(track: Track) {
  const machine = allocationNotes(track);
  let next = 0;
  const marks = new Map(pricedTasks(track).flatMap(({ id }) => (machine[id] ? [[id, ++next] as const] : [])));
  const columns: Column[] = pricedTasks(track).map(({ id, cost }) => ({
    provider: id,
    label: perThousandText(cost, "tight"),
    mark: marks.get(id),
    segments: [{ value: cost.usd, color: providerColor(id), fill: "solid" }],
    detail: [["Per 1,000 tasks", perThousandText(cost)], costSource(id, cost), sentence(billingLabel(billingBases[id]).replace(/^\w/, (c) => c.toUpperCase()))],
  }));
  return { columns, marks };
}

/** Whether a track shows a lower-bound cost, so the notes explain one only when it does. */
const showsLowerBound = (track: Track) => pricedTasks(track).some((t) => isLowerBound(t.cost));

const Amount = ({ t }: { t: PricedTask }) => (
  <>
    <Who id={t.id} /> <span className="font-mono tabular-nums text-neutral-10">{perThousandText(t.cost)}</span>
  </>
);

/** The cheapest exact cost, and any cheaper one that ran a different machine. A lower bound is never picked: its charge is unknown above the bound. */
export function CostPick({ track }: { track: Track }) {
  const c = costPick(track);
  switch (c.kind) {
    case "picked":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p>
            <span className="text-neutral-7">{pickLabel}:</span> <Amount t={c.pick} /> <span className="text-neutral-7">per 1,000 tasks</span>
          </p>
          {c.lower.map((t) => (
            <p key={t.id} className="text-xs text-neutral-7">
              Not counted: <Amount t={t} /> ({(allocationNotes(track)[t.id] ?? "machine differs").replace(/\.$/, "")}).
            </p>
          ))}
        </div>
      );
    case "none":
      return <p className="mb-m text-s font-medium text-pretty">{noPickLabel}: {noPickWhy(c)}.</p>;
    case "empty":
      return null;
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** One provider's cost row: the figure, what the provider bills on, and the whole machine at list price. */
function rowsOf(track: Track) {
  return pricedTasks(track).map((t) => {
    const p = provider(track, t.id);
    const w = p ? wholeMachine(p) : { kind: "none" as const, why: "no list price for the machine it ran" };
    return { t, billing: billingLabel(billingBases[t.id]), w };
  });
}

type Row = ReturnType<typeof rowsOf>[number];

function WholeMachineCell({ w }: { w: Row["w"] }) {
  if (w.kind === "none") return <span className="text-neutral-7">{w.why}</span>;
  return (
    <>
      <span className="font-mono text-xs whitespace-nowrap tabular-nums text-neutral-10">{hourlyText(w, "tight")}</span>
      <span className="block text-xs text-neutral-7">
        {machineText(w)}
        {w.counterfactual ? ", counterfactual" : ""}
      </span>
    </>
  );
}

/**
 * Every priced provider's billing model and whole-machine list price.
 * A table on wide screens, one block per provider on phones, as the
 * allocations table does.
 */
export function CostTable({ track }: { track: Track }) {
  const rows = rowsOf(track);
  return (
    <div className="mt-l">
      <ul className="flex flex-col divide-y divide-neutral-3 sm:hidden">
        {rows.map(({ t, billing, w }) => (
          <li key={t.id} className="py-s text-s">
            <p className="flex items-baseline justify-between gap-s">
              <Who id={t.id} />
              <span className="font-mono text-xs tabular-nums">{perThousandText(t.cost, "tight")}</span>
            </p>
            <p className="mt-xxs text-xs text-neutral-7">{sentence(billing.replace(/^\w/, (c) => c.toUpperCase()))}</p>
            <p className="mt-xxs text-xs text-neutral-7">
              {wholeMachineLabel}:{" "}
              {w.kind === "none" ? (
                w.why
              ) : (
                <>
                  <span className="font-mono tabular-nums text-neutral-10">{hourlyText(w, "tight")}</span>, {machineText(w)}
                  {w.counterfactual ? ", counterfactual" : ""}
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      <table className="hidden w-full border-collapse text-left text-s sm:table">
        <thead>
          <tr className="text-xs text-neutral-7">
            {["Provider", "Per 1,000 tasks", "Billing model", `${wholeMachineLabel}, per hour`].map((h) => (
              <th key={h} scope="col" className="py-2.5 pr-5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, billing, w }) => (
            <tr key={t.id} className="align-top">
              <th scope="row" className="py-s pr-5 font-medium">
                <Who id={t.id} />
              </th>
              <td className="py-s pr-5 font-mono text-xs whitespace-nowrap tabular-nums">{perThousandText(t.cost, "tight")}</td>
              <td className="py-s pr-5 text-xs text-neutral-8">{billing}</td>
              <td className="py-s pr-5">
                <WholeMachineCell w={w} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cost per task from the cost run. */
export function CostPerTaskChart({ track }: { track: Track }) {
  const head = <ChartHead title="Cost of the quick task: create, 100 tool calls, delete" sub="Per 1,000 tasks · A small synthetic task, not real work: see What a task costs above · US dollars · Lower is better" />;
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
      <CostPick track={track} />
      <Columns columns={columns} label="Cost per 1,000 tasks by provider" />
      <CostTable track={track} />
      <Footnotes
        items={[
          ...[...marks].map(([id, mark]) => ({ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })),
          { text: "Each task ran in its own sandbox, up to 10 per provider, in a separate cost run. The bar is the median." },
          ...(showsLowerBound(track)
            ? [{ text: "A lower bound (≥) counts only the resources requested, and the provider also bills use above them, so the charge can be higher. It is listed after every exact cost and is never called cheapest." }]
            : []),
          { text: <>{wholeMachineLabel}: {perTaskLifetimeNote} For a provider that bills usage it is a counterfactual, not what it charges.</> },
          ...track.providers.flatMap((p) => {
            const note = regionNote(p);
            return note && pricedTasks(track).some((t) => t.id === p.id) ? [{ text: <><Who id={p.id} />: {sentence(note)}</> }] : [];
          }),
          ...(missing.length > 0
            ? [{ text: <>No cost for {missing.map(({ id, why }, i) => <span key={id}>{i > 0 ? "; " : ""}<Who id={id} /> ({why.replace(/\.$/, "")})</span>)}.</> }]
            : []),
          { text: "Usage charges only: credits and tax are left out." },
          ...trackFootnotes(track, "cost"),
        ]}
      />
    </>
  );
}
