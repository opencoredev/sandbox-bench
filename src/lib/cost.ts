import type { PriceBound, Provider, TaskCost, Track } from "@/lib/data";
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

/**
 * Whether an amount is a lower bound: the provider also bills use the figure
 * doesn't count, so the charge can be higher. A lower bound is shown as "at
 * least", never ranked against exact amounts and never picked.
 */
export const isLowerBound = (x: { bound: PriceBound | null }) => x.bound === "lower";

/** "prose" says "at least $X"; "tight" says "≥ $X", for table cells and bar labels. */
export type BoundStyle = "prose" | "tight";

/** An amount with its lower-bound qualifier, or the amount alone when it is not a lower bound. */
export function qualify({ amount, bound, style = "prose" }: { amount: string; bound: PriceBound | null; style?: BoundStyle }) {
  if (bound !== "lower") return amount;
  return style === "tight" ? `≥ ${amount}` : `at least ${amount}`;
}

/** A task's cost as the site prints it, per 1,000 tasks: "$0.23", or "at least $0.23" for a lower bound. */
export const perThousandText = (c: Priced, style: BoundStyle = "prose") => qualify({ amount: formatPerThousand(c.usd), bound: c.bound, style });

/** A task's cost per task: "$0.00023", or "at least $0.00023" for a lower bound. */
export const perTaskText = (c: Priced, style: BoundStyle = "prose") => qualify({ amount: formatTaskCost(c.usd), bound: c.bound, style });

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
  lowerBound: {
    label: "Lower bound",
    eligible: false,
    rule: "Our measured time at list price on the requested resources, where the provider also bills use above the request, so the charge can be higher. Shown as at least that amount, never ranked against exact costs or picked.",
  },
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

/** Where a cost sits in the table above. A lower bound is checked first: no other status makes it comparable. */
export function costStatus(id: ProviderId, c: Priced): CostStatus {
  if (isLowerBound(c))
    return { kind: "lowerBound", why: `this list-price figure counts only the resources requested, and ${providerName(id)} also bills use above them, so the charge can be higher` };
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

/**
 * "metered, unreconciled" or "billed, unsettled, provisional": a cost's kind
 * and every status it carries, in the eligibility table's words. An estimate
 * is both a kind and a status, so it is said once. Shared by every chart and
 * export that labels a cost.
 */
export function kindStatusText(kind: PricedKind, statuses: readonly CostStatusKind[]) {
  const rest = [...new Set(statuses)].filter((k) => !(kind === "estimate" && k === "estimate"));
  return [costKinds[kind].label, ...rest.map((k) => costStatuses[k].label)].map((w) => w.toLowerCase()).join(", ");
}

/** "metered, provisional" or "estimate, lower bound": the kind and its status, for labels beside a number. An estimate is both, so it is said once. */
export const costTag = (id: ProviderId, c: Priced, s: CostStatus) =>
  s.kind === "estimate" ? (estimateSources[id]?.tag ?? "estimate") : kindStatusText(c.kind, [s.kind]);

/** Whether any track has a lower-bound cost or hourly price, so notes about lower bounds appear only once one does. */
export const hasLowerBounds = (ts: readonly Track[]) =>
  ts.some((t) =>
    t.providers.some((p) => {
      const c = t.costs[p.id];
      return p.pricingBound === "lower" || (c !== undefined && isPriced(c) && isLowerBound(c));
    }),
  );

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
  /** Bills the larger of what was requested and what was used (Modal): the request's list price is the least it charges. */
  | { kind: "request"; label: string; evidence: string }
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
  vercel: {
    kind: "usage",
    label: "bills active CPU time and the memory it allocates",
    evidence:
      "vercel.com/docs/sandbox/pricing (checked Nov 9, 2026): active CPU at $0.128 per vCPU-hour and provisioned memory at $0.0212 per GB-hour on Pro in iad1, memory in one-minute minimum increments; its per-sandbox usage records report both.",
  },
  modal: {
    kind: "request",
    label: "bills per second on the larger of its request and what it uses, counting a CPU as a physical core",
    evidence:
      "Modal's pricing and sandbox resources docs (checked Nov 9, 2026): CPU and memory are billed per second on max(request, usage), with a minimum request of 0.125 CPU, and one Modal CPU is a physical core. A pinned region multiplies the price: 1.15x for a broad region such as us, 1.75x for a narrow one such as us-east.",
  },
};

export function billingLabel(b: BillingBasis) {
  switch (b.kind) {
    case "usage":
    case "request":
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
  | { kind: "hourly"; usdPerHour: number; converted: boolean; cpu: number; memoryGiB: number; counterfactual: boolean; bound: PriceBound | null }
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
    bound: p.pricingBound,
  };
}

/**
 * "priced at Modal's us-east rate, 1.75× its base price": said wherever a
 * provider's prices carry a region multiplier, or null when none applies.
 */
export function regionNote(p: Pick<Provider, "id" | "pricingRegion" | "regionMultiplier">) {
  if (p.regionMultiplier === 1) return null;
  const where = p.pricingRegion === null ? "pinned-region" : `${p.pricingRegion}`;
  return `priced at ${providerName(p.id)}'s ${where} rate, ${Number(p.regionMultiplier.toFixed(3))}× its base price`;
}

/** "$0.391 an hour", or "at least $0.021 an hour" ("≥ $0.021 an hour" in tight cells) for a lower bound. */
export const hourlyText = (w: Extract<WholeMachine, { kind: "hourly" }>, style: BoundStyle = "prose") =>
  `${qualify({ amount: `$${w.usdPerHour.toFixed(3)}`, bound: w.bound, style })} an hour`;

/** "4 vCPU, 16 GiB". */
export const machineText = (w: Extract<WholeMachine, { kind: "hourly" }>) => `${w.cpu} vCPU, ${Number(w.memoryGiB.toFixed(1))} GiB`;

/** "$0.391 an hour for 4 vCPU, 16 GiB (from euros), counterfactual: …", one line for agent files. */
export function wholeMachineText(w: WholeMachine) {
  if (w.kind === "none") return w.why;
  return `${hourlyText(w)} for ${machineText(w)}${w.converted ? " (converted from euros)" : ""}${w.counterfactual ? ", counterfactual: it bills usage, not the whole machine" : ""}${isLowerBound(w) ? ", a lower bound: it also bills use above the request" : ""}`;
}

/**
 * Every priced provider in a track, lowest first, with where its cost sits in
 * the eligibility table. Lower bounds come after every exact cost, lowest
 * first among themselves: "at least $X" can't be ranked against "$Y".
 */
export function pricedTasks(track: Track) {
  return track.providers
    .flatMap((p) => {
      const c = track.costs[p.id];
      return c && isPriced(c) ? [{ id: p.id, cost: c, status: costStatus(p.id, c) }] : [];
    })
    .sort((a, b) => Number(isLowerBound(a.cost)) - Number(isLowerBound(b.cost)) || a.cost.usd - b.cost.usd);
}

export type PricedTask = ReturnType<typeof pricedTasks>[number];

export const pickLabel = "Lowest verified cost among eligible providers";
export const noPickLabel = "No verified cost yet";

/**
 * The cost pick: the lowest verified cost among eligible providers, never
 * "cheapest". It carries the eligible set and every lower cost that isn't
 * eligible, so the reason a lower bar lost is always printed beside it.
 * Lower bounds are never eligible and never "lower": their charge is unknown
 * above the bound, so they are not compared with exact costs at all. With no
 * pick, `lowest` is the lowest exact cost, or null when every cost is a lower bound.
 */
export type CostPick =
  | { kind: "verified"; pick: PricedTask; runnerUp: PricedTask | null; eligible: readonly ProviderId[]; lower: readonly PricedTask[] }
  | { kind: "none"; lowest: PricedTask | null }
  | { kind: "empty" };

export function costPick(track: Track): CostPick {
  const all = pricedTasks(track);
  const comparable = all.filter((t) => !isLowerBound(t.cost));
  const eligible = comparable.filter((t) => isEligible(t.status));
  const [pick, runnerUp] = eligible;
  if (pick) {
    const lower = comparable.filter((t) => !isEligible(t.status) && t.cost.usd < pick.cost.usd);
    return { kind: "verified", pick, runnerUp: runnerUp ?? null, eligible: eligible.map((t) => t.id), lower };
  }
  if (all.length === 0) return { kind: "empty" };
  return { kind: "none", lowest: comparable[0] ?? null };
}

/** Providers with no cost at all, and why. */
export const unpricedTasks = (track: Track) =>
  track.providers.flatMap((p): { id: ProviderId; why: string }[] => {
    const c = track.costs[p.id];
    return !c ? [{ id: p.id, why: "no cost data" }] : c.kind === "none" ? [{ id: p.id, why: c.why }] : [];
  });

/** One line on where a cost came from, for hover cards and agent files. */
export const costBasis = (c: Priced) =>
  `${costKinds[c.kind].label} over ${c.n} ${c.n === 1 ? "task" : "tasks"}${c.confidence ? `, ${c.confidence} confidence` : ""}${isLowerBound(c) ? ", a lower bound" : ""}`;

/** The second line of a hover card: what the amount is, without jargon. */
export const costSource = (id: ProviderId, c: Priced) =>
  `From ${providerName(id)}'s ${c.kind === "billed" ? "bill" : c.kind === "metered" ? "usage record" : "list price"}, ${c.n} ${c.n === 1 ? "task" : "tasks"}${isLowerBound(c) ? ", a lower bound" : ""}`;

/** Providers whose figure is not straight from a bill, grouped by how it was priced, for the one note under a cost chart. */
export function notFromBill(track: Track) {
  const kinds = ["metered", "estimate"] as const satisfies readonly PricedKind[];
  return kinds.flatMap((kind) => {
    const ids = pricedTasks(track).flatMap(({ id, cost }) => (cost.kind === kind ? [id] : []));
    return ids.length > 0 ? [{ kind, ids, source: costKinds[kind].source }] : [];
  });
}
