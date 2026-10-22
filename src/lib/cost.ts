import type { FillVariant } from "@/lib/dither";
import type { TaskCost, Track } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

type Priced = Exclude<TaskCost, { kind: "none" }>;
export type PricedKind = Priced["kind"];

/**
 * How each kind of cost is named and drawn. Billed is the provider's own
 * charge, metered is the provider's usage at its published rates, an estimate
 * is our list-price arithmetic. Each gets its own fill so they never read as
 * one series.
 */
export const costKinds = {
  billed: { label: "Billed", long: "Billed: the provider's own usage charge", fill: "gradient" },
  metered: { label: "Metered", long: "Metered: the provider's recorded usage at its published rates", fill: "hatched" },
  estimate: { label: "Estimate", long: "Estimate: list price, where the provider's billing gives no amount", fill: "dotted" },
} as const satisfies Record<PricedKind, { label: string; long: string; fill: FillVariant }>;

export const pricedKinds = ["billed", "metered", "estimate"] as const satisfies readonly PricedKind[];

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
