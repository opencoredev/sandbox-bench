import type { ProviderId } from "@/lib/providers";

/*
 * Published list prices for the sandbox pricing calculator (/sandbox-pricing/).
 *
 * Copied from the benchmark's own price table, opencoredev/sandbox-sdk
 * bench/src/pricing.ts at commit ceede7e (2026-11-20), which prices every cost
 * on this site. Each card keeps that table's source page and the date it was
 * read. Nothing here is guessed: a plan fee, free tier or charge the table
 * doesn't give stays out, and the page says it isn't in our price data.
 * Update this file together with the harness's table.
 */

/** Where these prices were copied from, for the page's notes. */
export const priceTableSource = {
  repo: "opencoredev/sandbox-sdk",
  path: "bench/src/pricing.ts",
  commit: "ceede7e",
  date: "2026-11-20",
  url: "https://github.com/opencoredev/sandbox-sdk/blob/ceede7e/bench/src/pricing.ts",
} as const;

export interface Size {
  cpu: number;
  memoryGiB: number;
}

/** A price per vCPU-hour and per GiB-hour of memory, or a flat price per machine size. */
export type Rates =
  | { kind: "resource"; cpuHour: number; memoryGiBHour: number }
  | { kind: "size"; sizes: readonly [Size & { hourly: number }, ...(Size & { hourly: number })[]] };

/**
 * What an open sandbox whose CPU sits idle is charged, from each provider's
 * billing basis (lib/cost.ts, billingBases):
 * - "full": the whole size, idle or not.
 * - "memory": memory only; CPU is billed on active CPU time (Vercel, boxd).
 * - "none": nothing listed; CPU is billed on active CPU time and there is no memory fee (Upstash).
 */
export type IdleCharge = "full" | "memory" | "none";

export interface RateCard {
  id: ProviderId;
  currency: "USD" | "EUR";
  rates: Rates;
  /** The sizes it sells, where it lists them; null where any size up to `max` can be asked for. */
  sizes: readonly Size[] | null;
  /** The largest size the price table allows where it names one (Beam Shared, 8 vCPU and 16 GiB). */
  max: Size | null;
  /**
   * What the estimate assumes where the price table or the site's billing
   * evidence (lib/cost.ts, billingBases) leaves it open, such as rounding to
   * the second, or rates read as applying to the whole size.
   */
  assumed: readonly string[];
  /** What its CPU price counts. Modal counts a physical core; the calculator prices one per vCPU asked for, as the benchmark does. */
  cpuUnit: "vCPU" | "CPU (a physical core)";
  /** The smallest CPU it bills, where it has one (Modal's 0.125). */
  minCpu: number | null;
  /** Shortest time billed per sandbox, and the step billing rounds up to, in seconds. */
  minimumSeconds: number;
  incrementSeconds: number;
  /** A fee per sandbox created, in the card's currency. */
  perSandbox: number;
  idle: IdleCharge;
  /** The billing increment as people say it: "per second", "per millisecond". */
  billed: string;
  /** Charges and allowances the price table names but the estimate leaves out, in its words. */
  notIncluded: readonly string[];
  /** A plan fee, minimum or free allowance the price table names; null when it names none. */
  plan: string | null;
  source: string;
  /** The day the harness read the source (yyyy-mm-dd). */
  checked: string;
}

const perSecond = { minimumSeconds: 0, incrementSeconds: 1, perSandbox: 0, minCpu: null, billed: "per second", cpuUnit: "vCPU", max: null } as const;

/** The site's billing evidence leaves open whether these rates apply to the allocation or to use (lib/cost.ts, billingBases). */
const basisOpen = "the rates apply to the whole size (not confirmed: they may apply only to what is used)";
const secondAssumed = "one-second rounding (the price table's assumption)";

/** Upstash Box's per-box-hour sizes; the bench prices Ephemeral Box at the same rates. */
const upstashSizes = [
  { cpu: 2, memoryGiB: 4, hourly: 0.1 },
  { cpu: 4, memoryGiB: 8, hourly: 0.2 },
  { cpu: 8, memoryGiB: 16, hourly: 0.4 },
] as const;

const upstashCard = (id: "upstash" | "upstash-ephemeral"): RateCard => ({
  id,
  currency: "USD",
  rates: { kind: "size", sizes: upstashSizes },
  sizes: null,
  ...perSecond,
  billed: "per active box-hour",
  idle: "none",
  assumed: ["no minimum or rounding (not in the price table)"],
  notIncluded: ["disk at $0.10 per GB-month of allocated capacity"],
  plan: null,
  source: "https://upstash.com/pricing/box",
  checked: "2026-10-21",
});

export const rateCards: readonly RateCard[] = [
  {
    id: "e2b",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.0504, memoryGiBHour: 0.0162 },
    sizes: null,
    ...perSecond,
    idle: "full",
    assumed: [],
    notIncluded: ["the plan subscription", "disk beyond what the plan includes (10 GiB on Hobby, 20 GiB on Pro)"],
    plan: null,
    source: "https://e2b.dev/pricing",
    checked: "2026-10-21",
  },
  {
    id: "daytona",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.0504, memoryGiBHour: 0.0162 },
    sizes: null,
    ...perSecond,
    idle: "full",
    assumed: [basisOpen, secondAssumed, "no minimum or creation fee (not in the price table)"],
    notIncluded: ["disk past 5 GiB at $0.000108 per GiB-hour", "snapshot storage"],
    plan: null,
    source: "https://www.daytona.io/pricing",
    checked: "2026-10-21",
  },
  {
    id: "modal",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.141912, memoryGiBHour: 0.024012 },
    sizes: null,
    ...perSecond,
    minCpu: 0.125,
    cpuUnit: "CPU (a physical core)",
    idle: "full",
    assumed: ["one Modal CPU per vCPU entered, as the benchmark prices it", "use within the request (it bills the larger of the two)"],
    notIncluded: ["a pinned region, which multiplies the price by 1.15 (broad, such as us) or 1.75 (narrow, such as us-east)", "plan credits"],
    plan: null,
    source: "https://modal.com/pricing",
    checked: "2026-11-09",
  },
  {
    id: "vercel",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.128, memoryGiBHour: 0.0212 },
    sizes: [1, 2, 4, 6, 8].map((cpu) => ({ cpu, memoryGiB: cpu * 2 })),
    minimumSeconds: 60,
    incrementSeconds: 60,
    perSandbox: 0.6 / 1_000_000,
    minCpu: null,
    cpuUnit: "vCPU",
    billed: "active CPU per second, memory in whole minutes",
    max: null,
    idle: "memory",
    assumed: ["Pro plan prices in the iad1 region", "every vCPU busy while the sandbox works", "memory rounded up to whole minutes (Vercel's docs leave rounding after the first minute open; this is the dearer reading)"],
    notIncluded: ["data transfer at $0.15 per GB", "snapshot storage"],
    plan: "Pro includes a $20 credit, not counted here",
    source: "https://vercel.com/docs/sandbox/pricing",
    checked: "2026-11-09",
  },
  upstashCard("upstash"),
  upstashCard("upstash-ephemeral"),
  {
    id: "boat",
    currency: "USD",
    rates: {
      kind: "size",
      sizes: [
        { cpu: 2, memoryGiB: 4, hourly: 0.018 },
        { cpu: 4, memoryGiB: 8, hourly: 0.036 },
        { cpu: 8, memoryGiB: 16, hourly: 0.072 },
        { cpu: 16, memoryGiB: 32, hourly: 0.2 },
      ],
    },
    sizes: null,
    ...perSecond,
    idle: "full",
    assumed: [],
    notIncluded: [],
    plan: "$20 monthly minimum or packs, not counted here",
    source: "https://docs.boat.dev/machines",
    checked: "2026-10-21",
  },
  {
    id: "boxd",
    currency: "EUR",
    rates: { kind: "resource", cpuHour: 0.039, memoryGiBHour: 0.012 },
    sizes: [
      { cpu: 1, memoryGiB: 4 },
      { cpu: 2, memoryGiB: 8 },
      { cpu: 4, memoryGiB: 16 },
      { cpu: 8, memoryGiB: 32 },
    ],
    ...perSecond,
    billed: "per second, settled every 15 minutes",
    idle: "memory",
    assumed: ["every vCPU busy and all memory in use while the sandbox works"],
    notIncluded: ["written disk at €0.00008 per GiB-hour"],
    plan: null,
    source: "https://boxd.sh/pricing",
    checked: "2026-10-21",
  },
  {
    id: "freestyle",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.04032, memoryGiBHour: 0.0129 },
    sizes: null,
    ...perSecond,
    idle: "full",
    assumed: [basisOpen, secondAssumed, "no minimum or creation fee (not in the price table)"],
    notIncluded: ["allowances and subscriptions", "transfer at $0.02 per GB", "disk at $0.000086 per GiB-hour"],
    plan: null,
    source: "https://www.freestyle.sh/pricing",
    checked: "2026-10-21",
  },
  {
    id: "superserve",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.0504, memoryGiBHour: 0.0162 },
    sizes: null,
    ...perSecond,
    idle: "full",
    assumed: [basisOpen, secondAssumed, "no minimum charge (not in the price table)"],
    notIncluded: ["credits", "snapshot storage, disk and transfer"],
    plan: null,
    source: "https://www.superserve.ai/pricing",
    checked: "2026-10-21",
  },
  {
    id: "tenki",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.0504, memoryGiBHour: 0.0162 },
    sizes: null,
    ...perSecond,
    idle: "full",
    assumed: [basisOpen],
    notIncluded: ["credits", "persistent storage"],
    plan: null,
    source: "https://luxor.ai/pricing",
    checked: "2026-10-21",
  },
  {
    id: "baseten",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.0655, memoryGiBHour: 0.0211 },
    sizes: [
      { cpu: 1, memoryGiB: 2 },
      { cpu: 2, memoryGiB: 4 },
      { cpu: 4, memoryGiB: 8 },
      // Memory sets CPU: 2 GiB per vCPU up to 4 vCPUs, and 16 GiB gives 6 (the price table's note).
      { cpu: 6, memoryGiB: 16 },
    ],
    ...perSecond,
    idle: "full",
    assumed: [basisOpen, secondAssumed, "no minimum (not in the price table)"],
    notIncluded: ["volume storage at $0.16 per GB-month", "a free promotional period"],
    plan: null,
    source: "https://www.baseten.co/pricing/",
    checked: "2026-10-21",
  },
  {
    id: "instabox",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.004, memoryGiBHour: 0.00225 },
    sizes: [
      { cpu: 2, memoryGiB: 4 },
      { cpu: 4, memoryGiB: 8 },
      { cpu: 8, memoryGiB: 16 },
      { cpu: 16, memoryGiB: 32 },
    ],
    ...perSecond,
    idle: "full",
    assumed: [],
    notIncluded: ["egress at $0.02 per GiB past the plan's", "disk past the plan's at $0.08 per GiB-month"],
    plan: "Plan fee and monthly credits (Pro $20, Builder $100), not counted here",
    source: "https://instabox.sh/docs/account/pricing.md",
    checked: "2026-11-18",
  },
  {
    id: "beam",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.05, memoryGiBHour: 0.01 },
    sizes: null,
    ...perSecond,
    incrementSeconds: 0.001,
    billed: "per millisecond",
    idle: "full",
    assumed: [basisOpen],
    notIncluded: ["credits"],
    plan: null,
    source: "https://www.beam.cloud/pricing",
    checked: "2026-11-18",
  },
  {
    id: "beam-shared",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.011, memoryGiBHour: 0.0055 },
    sizes: null,
    ...perSecond,
    max: { cpu: 8, memoryGiB: 16 },
    incrementSeconds: 0.001,
    billed: "per millisecond",
    idle: "full",
    assumed: [basisOpen],
    notIncluded: ["credits"],
    plan: null,
    source: "https://www.beam.cloud/pricing",
    checked: "2026-11-20",
  },
  {
    id: "beam-spot",
    currency: "USD",
    rates: { kind: "resource", cpuHour: 0.0063, memoryGiBHour: 0.00135 },
    sizes: null,
    ...perSecond,
    incrementSeconds: 0.001,
    billed: "per millisecond",
    idle: "full",
    assumed: [basisOpen],
    notIncluded: ["credits"],
    plan: null,
    source: "https://www.beam.cloud/pricing",
    checked: "2026-11-20",
  },
];
