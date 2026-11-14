import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, ComingNext, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import {
  billingBases,
  billingLabel,
  costPick,
  costSource,
  costStatuses,
  costTag,
  hasTaskCosts,
  hourlyText,
  isEligible,
  isLowerBound,
  machineText,
  noPickLabel,
  notFromBill,
  perTaskLifetimeNote,
  perThousandText,
  pickLabel,
  pricedTasks,
  regionNote,
  statusNote,
  unpricedTasks,
  wholeMachine,
  wholeMachineLabel,
} from "@/lib/cost";
import type { CostStatus, PricedTask } from "@/lib/cost";
import { provider } from "@/lib/data";
import type { Track } from "@/lib/data";
import { markFill } from "@/lib/marks";
import type { MarkFill } from "@/lib/marks";
import { allocationNotes } from "@/lib/notes";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

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
  return <p className="mt-s text-xs text-pretty text-neutral-7">Not from a bill yet. {parts}.</p>;
}

/** An eligible cost is a solid bar; one that is shown but can't be the pick is striped, the site's one texture. */
const fillOf = (s: CostStatus): MarkFill => (isEligible(s) ? "solid" : "striped");

/** Columns of cost per task, lowest first: solid when eligible for the pick, striped when not. */
export function costColumns(track: Track) {
  const machine = allocationNotes(track);
  let next = 0;
  const marks = new Map(pricedTasks(track).flatMap(({ id }) => (machine[id] ? [[id, ++next] as const] : [])));
  const columns: Column[] = pricedTasks(track).map(({ id, cost, status }) => {
    const why = statusNote(status);
    return {
      provider: id,
      label: perThousandText(cost, "tight"),
      mark: marks.get(id),
      segments: [{ value: cost.usd, color: providerColor(id), fill: fillOf(status) }],
      detail: [
        ["Per 1,000 tasks", perThousandText(cost)],
        ["Status", costStatuses[status.kind].label],
        costSource(id, cost),
        sentence(billingLabel(billingBases[id]).replace(/^\w/, (c) => c.toUpperCase())),
        ...(why ? [sentence(why)] : []),
      ],
    };
  });
  return { columns, marks };
}

/** A small swatch of a bar's fill, for the legend. Shared with the realistic-workload legends. */
export const Swatch = ({ fill }: { fill: MarkFill }) => (
  <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[2px]" style={markFill(fill, "var(--color-neutral-8)")} />
);

/** Whether a track shows a lower-bound cost, so the legend and notes explain one only when it does. */
const showsLowerBound = (track: Track) => pricedTasks(track).some((t) => isLowerBound(t.cost));

/** What solid and striped bars mean. */
export function CostLegend({ track, compact = false }: { track: Track; compact?: boolean }) {
  return (
    <p className={`mt-s flex flex-wrap items-center gap-x-m gap-y-xxs text-neutral-7 ${compact ? "text-xxs" : "text-xs"}`}>
      <span className="inline-flex items-center gap-1.5">
        <Swatch fill="solid" />
        Verified: eligible for the pick
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch fill="striped" />
        {showsLowerBound(track) ? "Unreconciled, provisional, unsettled, estimate or lower bound: shown, not eligible" : "Unreconciled, provisional, unsettled or estimate: shown, not eligible"}
      </span>
    </p>
  );
}

const Amount = ({ t }: { t: PricedTask }) => (
  <>
    <Who id={t.id} /> <span className="font-mono tabular-nums text-neutral-10">{perThousandText(t.cost)}</span>{" "}
    <span className="text-neutral-7">({costTag(t.id, t.cost, t.status)})</span>
  </>
);

/**
 * The cost pick, said the way the plan words it: the lowest verified cost
 * among eligible providers, with the eligible set, and any lower cost that
 * isn't eligible flagged beside it with its reason.
 */
export function CostPick({ track }: { track: Track }) {
  const c = costPick(track);
  switch (c.kind) {
    case "verified":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p>
            <span className="text-neutral-7">{pickLabel}:</span> <Amount t={c.pick} /> <span className="text-neutral-7">per 1,000 tasks</span>
          </p>
          <p className="text-xs text-neutral-7">Eligible: {names(c.eligible)}.</p>
          {c.lower.map((t) => (
            <p key={t.id} className="flex gap-1.5 text-xs text-neutral-7">
              <span aria-hidden className="mt-[0.4em] size-1.5 shrink-0 rounded-full bg-warning" />
              <span>
                Lower but not eligible: <Amount t={t} />. {sentence(statusNote(t.status) ?? "")}
              </span>
            </p>
          ))}
        </div>
      );
    case "none":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p className="font-medium">{noPickLabel}.</p>
          {c.lowest ? (
            <p className="text-xs text-neutral-7">
              Lowest reported: <Amount t={c.lowest} />. {sentence(statusNote(c.lowest.status) ?? "")}
            </p>
          ) : (
            <p className="text-xs text-neutral-7">Every reported cost is a lower bound, so none is ranked.</p>
          )}
        </div>
      );
    case "empty":
      return null;
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** One provider's cost row: the figure, its kind and status, what the provider bills on, and the whole machine at list price. */
function rowsOf(track: Track) {
  return pricedTasks(track).map((t) => {
    const p = provider(track, t.id);
    const w = p ? wholeMachine(p) : { kind: "none" as const, why: "no list price for the machine it ran" };
    return { t, billing: billingLabel(billingBases[t.id]), w };
  });
}

type Row = ReturnType<typeof rowsOf>[number];

const Status = ({ t }: { t: PricedTask }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${isEligible(t.status) ? "" : "text-warning"}`}>
    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${isEligible(t.status) ? "bg-success" : "bg-warning"}`} />
    {costTag(t.id, t.cost, t.status).replace(/^\w/, (c) => c.toUpperCase())}
  </span>
);

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
 * Every priced provider's status, billing model and whole-machine list price.
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
            <p className="mt-xxs text-xs">
              <Status t={t} />
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
            {["Provider", "Per 1,000 tasks", "Kind and status", "Billing model", `${wholeMachineLabel}, per hour`].map((h) => (
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
              <td className="py-s pr-5 text-xs">
                <Status t={t} />
              </td>
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
      <CostLegend track={track} />
      <CostTable track={track} />
      <Footnotes
        items={[
          ...[...marks].map(([id, mark]) => ({ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })),
          { text: "Each task ran in its own sandbox, up to 10 per provider, in a separate cost run. The bar is the median." },
          { text: <>Eligible for the pick: {costStatuses.verified.rule.replace(/^\w/, (c) => c.toLowerCase())} Unreconciled, provisional, unsettled and estimated costs are shown, never picked.</> },
          ...(showsLowerBound(track)
            ? [{ text: "A lower bound (≥) counts only the resources requested, and the provider also bills use above them, so the charge can be higher. It is listed after every exact cost and is never ranked or picked." }]
            : []),
          { text: <>{wholeMachineLabel}: {perTaskLifetimeNote} For a provider that bills usage it is a counterfactual, not what it charges.</> },
          ...track.providers.flatMap((p) => {
            const note = regionNote(p);
            return note && pricedTasks(track).some((t) => t.id === p.id) ? [{ text: <><Who id={p.id} />: {sentence(note)}</> }] : [];
          }),
          ...(missing.length > 0
            ? [{ text: <>No cost for {missing.map(({ id, why }, i) => <span key={id}>{i > 0 ? "; " : ""}<Who id={id} /> ({why.replace(/\.$/, "")})</span>)}.</> }]
            : []),
          { text: "Usage charges only: credits, tax and plan minimums are left out." },
          ...trackFootnotes(track, "cost"),
        ]}
      />
    </>
  );
}
