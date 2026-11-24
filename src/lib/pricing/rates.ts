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
  /** The sizes it sells, where it lists them; null where any size can be asked for. */
  sizes: readonly Size[] | null;
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

const perSecond = { minimumSeconds: 0, incrementSeconds: 1, perSandbox: 0, minCpu: null, billed: "per second", cpuUnit: "vCPU" } as const;

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
  notIncluded: ["disk at $0.10 per GB-month of allocated capacity", "billing increment and minimum not stated"],
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
    notIncluded: ["disk past 5 GiB at $0.000108 per GiB-hour", "snapshot storage", "minimum and creation fee not stated"],
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
    idle: "memory",
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
    notIncluded: ["allowances and subscriptions", "transfer at $0.02 per GB", "disk at $0.000086 per GiB-hour", "increment and minimum not stated"],
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
    notIncluded: ["credits", "snapshot storage, disk and transfer", "any minimum charge"],
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
    ],
    ...perSecond,
    idle: "full",
    notIncluded: ["volume storage at $0.16 per GB-month", "a free promotional period", "increment and minimum not stated"],
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
    incrementSeconds: 0.001,
    billed: "per millisecond",
    idle: "full",
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
    notIncluded: ["credits"],
    plan: null,
    source: "https://www.beam.cloud/pricing",
    checked: "2026-11-20",
  },
];
