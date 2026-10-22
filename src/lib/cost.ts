import type { TaskCost, Track } from "@/lib/data";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

type Priced = Exclude<TaskCost, { kind: "none" }>;
export type PricedKind = Priced["kind"];

/**
 * Where each kind of cost came from, in plain words. Charts draw every kind
 * the same way; only a figure that is not straight from a bill gets named,
 * once, under the chart.
 */
export const costKinds = {
  billed: { label: "Billed", source: "from its bill" },
  metered: { label: "Metered", source: "their own usage records at published rates" },
  estimate: { label: "Estimate", source: "our measured time at list price" },
} as const satisfies Record<PricedKind, { label: string; source: string }>;

export const isPriced = (c: TaskCost): c is Priced => c.kind !== "none";

/** "$0.0049": two significant figures under a cent, since tasks cost fractions of one. */
export function formatTaskCost(usd: number) {
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toPrecision(2)}`;
}

/** Tasks cost fractions of a cent, so the site shows them per this many tasks. Agent files keep the raw per-task value too. */
export const TASKS_PER_PRICE = 1000;
export const perPriceLabel = "per 1,000 tasks";

/** "$0.23": what 1,000 tasks cost, from the cost of one. */
export function formatPerThousand(usd: number) {
  const v = usd * TASKS_PER_PRICE;
  if (v === 0) return "$0";
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 0.1) return `$${v.toFixed(2)}`;
  return `$${v.toPrecision(2)}`;
}

/** Whether a track has any cost-suite result, so charts can say "no results yet" instead of drawing nothing. */
export const hasTaskCosts = (track: Track) => pricedTasks(track).length > 0;

/** Every priced provider in a track, cheapest first. */
export function pricedTasks(track: Track) {
  return track.providers
    .flatMap((p) => {
      const c = track.costs[p.id];
      return c && isPriced(c) ? [{ id: p.id, cost: c }] : [];
    })
    .sort((a, b) => a.cost.usd - b.cost.usd);
}

/** Providers with no cost at all, and why. */
export const unpricedTasks = (track: Track) =>
  track.providers.flatMap((p): { id: ProviderId; why: string }[] => {
    const c = track.costs[p.id];
    return !c ? [{ id: p.id, why: "no cost data" }] : c.kind === "none" ? [{ id: p.id, why: c.why }] : [];
  });

/** One line on where a cost came from, for hover cards and agent files. */
export const costBasis = (c: Priced) =>
  `${costKinds[c.kind].label} over ${c.n} ${c.n === 1 ? "task" : "tasks"}${c.confidence ? `, ${c.confidence} confidence` : ""}`;

/** The second line of a hover card: what the amount is, without jargon. */
export const costSource = (id: ProviderId, c: Priced) =>
  `From ${providerName(id)}'s ${c.kind === "billed" ? "bill" : c.kind === "metered" ? "usage record" : "list price"}, ${c.n} ${c.n === 1 ? "task" : "tasks"}`;

/** Providers whose figure is not straight from a bill, grouped by how it was priced, for the one note under a cost chart. */
export function notFromBill(track: Track) {
  const kinds = ["metered", "estimate"] as const satisfies readonly PricedKind[];
  return kinds.flatMap((kind) => {
    const ids = pricedTasks(track).flatMap(({ id, cost }) => (cost.kind === kind ? [id] : []));
    return ids.length > 0 ? [{ kind, ids, source: costKinds[kind].source }] : [];
  });
}
