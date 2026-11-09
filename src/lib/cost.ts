import type { Provider, TaskCost, Track } from "@/lib/data";
import { usdPrice } from "@/lib/fx";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

export type Priced = Exclude<TaskCost, { kind: "none" }>;
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

/**
 * Whether a cost can be a pick. This table is the only place that decides it:
 * a cost is eligible only if it is billed and settled, and not flagged
 * provisional. A metered cost is the provider's usage at its published rates,
 * so it stays unreconciled until checked against settled charges; no metered
 * cost has been yet. Estimates are shown, never picked.
 */
export const costStatuses = {
  verified: { label: "Verified", eligible: true, rule: "Billed and settled, and not flagged provisional." },
  unreconciled: { label: "Unreconciled", eligible: false, rule: "Metered: the provider's usage records at its published rates, not yet checked against the charges it settled." },
  provisional: { label: "Provisional", eligible: false, rule: "Billed or metered, but flagged provisional, with the reason." },
  unsettled: { label: "Unsettled", eligible: false, rule: "Billed or metered, but the provider has not settled the amount, so it can still change." },
  estimate: { label: "Estimate", eligible: false, rule: "Our measured time at list price, not the provider's bill or meter." },
} as const satisfies Record<string, { label: string; eligible: boolean; rule: string }>;

export type CostStatusKind = keyof typeof costStatuses;
export type CostStatus = { kind: "verified" } | { kind: Exclude<CostStatusKind, "verified">; why: string };

/**
 * Costs flagged provisional, keyed by provider and the kind the flag covers,
 * so a re-run whose charge is reconciled (exported as billed) drops it on its own.
 */
const provisionalCosts: Partial<Record<ProviderId, { kind: PricedKind; why: string }>> = {
  boxd: {
    kind: "metered",
    why: "its metered figure isn't reconciled with settled charges, and its per-hour charge for the same task fell about 6x between Oct 22 (Frankfurt) and Nov 4 (New York), unexplained",
  },
};

/**
 * Where an estimate comes from, when it needs saying beyond "list price".
 * Boat has a per-sandbox usage API, but that run's usage wasn't pulled, so
 * its figure is its documented price on our measured lifetime.
 */
const estimateSources: Partial<Record<ProviderId, { tag: string; why: string }>> = {
  boat: {
    tag: "estimate from docs",
    why: "Boat's documented price on our measured sandbox lifetime; Boat can't be a pick yet because no settled-charge source for Boat is available",
  },
};

/** Where a cost sits in the table above. */
export function costStatus(id: ProviderId, c: Priced): CostStatus {
  const flag = provisionalCosts[id];
  if (flag && flag.kind === c.kind) return { kind: "provisional", why: flag.why };
  switch (c.kind) {
    case "estimate":
      return { kind: "estimate", why: estimateSources[id]?.why ?? "our measured time at list price, not the provider's bill or meter" };
    case "billed":
      return c.settled ? { kind: "verified" } : { kind: "unsettled", why: `${providerName(id)} has not settled this charge yet, so it can still change` };
    case "metered":
      return { kind: "unreconciled", why: `${providerName(id)}'s usage records at its published rates haven't been checked against the charges it settled yet` };
    default: {
      const _exhaustive: never = c.kind;
      return _exhaustive;
    }
  }
}

export const isEligible = (s: CostStatus) => costStatuses[s.kind].eligible;

/** "metered, provisional": the kind and its status, for labels beside a number. An estimate is both, so it is said once. */
export const costTag = (id: ProviderId, c: Priced, s: CostStatus) =>
  s.kind === "estimate" ? (estimateSources[id]?.tag ?? "estimate") : `${costKinds[c.kind].label.toLowerCase()}, ${costStatuses[s.kind].label.toLowerCase()}`;

/** "Provisional: its metered figure …": why a cost is not eligible, or null when it is. */
export const statusNote = (s: CostStatus) => (s.kind === "verified" ? null : `${costStatuses[s.kind].label}: ${s.why}`);

/**
 * What a provider's bill is based on, from its pricing notes and billing API
 * in the harness (bench/src/pricing.ts, bench/src/billing/providers.ts).
 * Where neither says whether the rate applies to the allocation or to use,
 * the basis is not confirmed rather than guessed.
 */
export type BillingBasis =
  | { kind: "usage"; label: string; evidence: string }
  | { kind: "machine"; evidence: string }
  | { kind: "unconfirmed"; evidence: string };

const upstashBasis: BillingBasis = {
  kind: "usage",
  label: "bills active CPU time, with no memory charge listed",
  evidence: "Pricing notes: pay-as-you-go active CPU billing per active box-hour, no RAM fee listed; its API reports CPU time per box.",
};

export const billingBases: Record<ProviderId, BillingBasis> = {
  boxd: {
    kind: "usage",
    label: "bills active CPU and memory in use",
    evidence: "boxd.sh/pricing (checked Nov 4, 2026): \"You only pay for active vCPU, not for the vCPUs your machine reserves\"; memory is billed on memory in use and disk on space written.",
  },
  upstash: upstashBasis,
  "upstash-ephemeral": upstashBasis,
  e2b: { kind: "machine", evidence: "Its usage events price the sandbox's vCPU count and memory over its running time." },
  boat: { kind: "machine", evidence: "A flat rate per machine size, billed per second." },
  daytona: { kind: "unconfirmed", evidence: "Published hourly rates; our data doesn't say whether they apply to the allocation or to use." },
  superserve: { kind: "unconfirmed", evidence: "Published vCPU and GiB-hour rates; our data doesn't say whether they apply to the allocation or to use." },
  freestyle: { kind: "unconfirmed", evidence: "Published overage rates and no billing API; our data doesn't say whether they apply to the allocation or to use." },
  tenki: { kind: "unconfirmed", evidence: "Per-second pricing and no billing API; our data doesn't say whether it applies to the allocation or to use." },
};

export function billingLabel(b: BillingBasis) {
  switch (b.kind) {
    case "usage":
      return b.label;
    case "machine":
      return "bills the whole machine while it exists";
    case "unconfirmed":
      return "billing basis not confirmed";
    default: {
      const _exhaustive: never = b;
      return _exhaustive;
    }
  }
}

/**
 * The whole machine at list price. Per task this would be the allocation's
 * hourly price times each task's sandbox lifetime, but the site data has no
 * per-task lifetime yet, so only the hourly price is shown, labelled as such.
 * For a provider that bills usage it is a counterfactual, never its price.
 */
export type WholeMachine =
  | { kind: "hourly"; usdPerHour: number; converted: boolean; cpu: number; memoryGiB: number; counterfactual: boolean }
  | { kind: "none"; why: string };

export const wholeMachineLabel = "Whole machine at list price";
export const perTaskLifetimeNote =
  "Shown per hour for the allocation: a per-task figure needs each task's sandbox lifetime, which the harness doesn't export yet.";

export function wholeMachine(p: Provider): WholeMachine {
  const price = usdPrice(p, "hourly");
  if (price === null || p.pricingAllocation === null) return { kind: "none", why: "no list price for the machine it ran" };
  return {
    kind: "hourly",
    usdPerHour: price.usd,
    converted: price.converted,
    cpu: p.pricingAllocation.cpu,
    memoryGiB: p.pricingAllocation.memoryGiB,
    counterfactual: billingBases[p.id].kind === "usage",
  };
}

/** "$0.391 an hour". */
export const hourlyText = (w: Extract<WholeMachine, { kind: "hourly" }>) => `$${w.usdPerHour.toFixed(3)} an hour`;

/** "4 vCPU, 16 GiB". */
export const machineText = (w: Extract<WholeMachine, { kind: "hourly" }>) => `${w.cpu} vCPU, ${Number(w.memoryGiB.toFixed(1))} GiB`;

/** "$0.391 an hour for 4 vCPU, 16 GiB (from euros), counterfactual: …", one line for agent files. */
export function wholeMachineText(w: WholeMachine) {
  if (w.kind === "none") return w.why;
  return `${hourlyText(w)} for ${machineText(w)}${w.converted ? " (converted from euros)" : ""}${w.counterfactual ? ", counterfactual: it bills usage, not the whole machine" : ""}`;
}

/** Every priced provider in a track, lowest first, with where its cost sits in the eligibility table. */
export function pricedTasks(track: Track) {
  return track.providers
    .flatMap((p) => {
      const c = track.costs[p.id];
      return c && isPriced(c) ? [{ id: p.id, cost: c, status: costStatus(p.id, c) }] : [];
    })
    .sort((a, b) => a.cost.usd - b.cost.usd);
}

export type PricedTask = ReturnType<typeof pricedTasks>[number];

export const pickLabel = "Lowest verified cost among eligible providers";
export const noPickLabel = "No verified cost yet";

/**
 * The cost pick: the lowest verified cost among eligible providers, never
 * "cheapest". It carries the eligible set and every lower cost that isn't
 * eligible, so the reason a lower bar lost is always printed beside it.
 */
export type CostPick =
  | { kind: "verified"; pick: PricedTask; runnerUp: PricedTask | null; eligible: readonly ProviderId[]; lower: readonly PricedTask[] }
  | { kind: "none"; lowest: PricedTask }
  | { kind: "empty" };

export function costPick(track: Track): CostPick {
  const all = pricedTasks(track);
  const eligible = all.filter((t) => isEligible(t.status));
  const [pick, runnerUp] = eligible;
  if (pick) {
    const lower = all.filter((t) => !isEligible(t.status) && t.cost.usd < pick.cost.usd);
    return { kind: "verified", pick, runnerUp: runnerUp ?? null, eligible: eligible.map((t) => t.id), lower };
  }
  const [lowest] = all;
  return lowest ? { kind: "none", lowest } : { kind: "empty" };
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
