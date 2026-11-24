import type { ProviderId } from "@/lib/providers";
import type { RateCard, Size } from "@/lib/pricing/rates";

/**
 * The calculator's arithmetic, shared by the server (the default scenario in
 * the page's HTML) and the browser (every change after). No benchmark data:
 * list prices only, from lib/pricing/rates.ts.
 */

/** A month of sandboxes: how many, how long each is busy and how long it then sits open, and the size asked for. */
export interface Workload {
  sandboxes: number;
  activeMinutes: number;
  idleMinutes: number;
  cpu: number;
  memoryGiB: number;
}

/** Days in the month the "always on" view multiplies by. */
export const DAYS_PER_MONTH = 30;

/** Sandboxes running all day: `running` at once for `hoursPerDay`, each day of the month, as one workload. */
export const alwaysOn = ({ running, hoursPerDay, cpu, memoryGiB }: { running: number; hoursPerDay: number; cpu: number; memoryGiB: number }): Workload => ({
  sandboxes: running * DAYS_PER_MONTH,
  activeMinutes: hoursPerDay * 60,
  idleMinutes: 0,
  cpu,
  memoryGiB,
});

export type Mode = "tasks" | "always";

/** The calculator's starting point, also the scenario the page's text and FAQ quote. */
export const defaultInputs = { mode: "tasks" as Mode, sandboxes: 10_000, activeMinutes: 5, idleMinutes: 0, running: 5, hoursPerDay: 8, cpu: 2, memoryGiB: 4 };
export type Inputs = typeof defaultInputs;

/** The inputs as a month's workload, whichever way the sandboxes run. */
export const workloadOf = (i: Inputs): Workload =>
  i.mode === "tasks"
    ? { sandboxes: i.sandboxes, activeMinutes: i.activeMinutes, idleMinutes: i.idleMinutes, cpu: i.cpu, memoryGiB: i.memoryGiB }
    : alwaysOn({ running: i.running, hoursPerDay: i.hoursPerDay, cpu: i.cpu, memoryGiB: i.memoryGiB });

export type Estimate =
  | {
      kind: "priced";
      id: ProviderId;
      /** The month's bill in US dollars. */
      monthlyUsd: number;
      /** The size priced: the one asked for, or the smallest listed size that fits it. */
      size: Size;
      /** True when that size is bigger than the one asked for. */
      roundedUp: boolean;
      /** The priced size's list price per hour, in US dollars. */
      hourlyUsd: number;
      /** True where the provider bills use rather than the allocation, so the estimate is the most its CPU and memory would charge. */
      atMost: boolean;
    }
  | { kind: "no-size"; id: ProviderId; largest: Size };

const fits = (s: Size, w: Pick<Workload, "cpu" | "memoryGiB">) => s.cpu >= w.cpu && s.memoryGiB >= w.memoryGiB;

/** The price of one size per hour, split into CPU and memory where the provider prices them apart, in the card's currency. */
function hourlyParts(card: RateCard, size: Size): { cpu: number; memory: number } | null {
  switch (card.rates.kind) {
    case "resource":
      return { cpu: size.cpu * card.rates.cpuHour, memory: size.memoryGiB * card.rates.memoryGiBHour };
    case "size": {
      const listed = card.rates.sizes.find((s) => s.cpu === size.cpu && s.memoryGiB === size.memoryGiB);
      return listed ? { cpu: listed.hourly, memory: 0 } : null;
    }
    default: {
      const _exhaustive: never = card.rates;
      return _exhaustive;
    }
  }
}

/** The sizes a provider sells, smallest first, or null where any size can be asked for. */
function menu(card: RateCard): readonly Size[] | null {
  const listed = card.rates.kind === "size" ? card.rates.sizes : card.sizes;
  return listed ? [...listed].sort((a, b) => a.cpu - b.cpu || a.memoryGiB - b.memoryGiB) : null;
}

/** Billed seconds for one created sandbox's wall time: at least the minimum, rounded up to the increment. */
export function billedSeconds(card: Pick<RateCard, "minimumSeconds" | "incrementSeconds">, seconds: number) {
  if (seconds <= 0) return card.minimumSeconds;
  // Round to a microsecond first, so 0.1 + 0.2 style float noise never bills one more increment.
  const steps = Math.ceil(Math.round((seconds / card.incrementSeconds) * 1e6) / 1e6);
  return Math.max(card.minimumSeconds, steps * card.incrementSeconds);
}

/**
 * One provider's bill for a month of this workload, at list price. Busy time
 * bills the whole size. Idle time bills what the provider charges an idle
 * sandbox (RateCard.idle). Rounding and per-sandbox fees apply per sandbox.
 */
export function estimate(card: RateCard, w: Workload, eurUsd: number): Estimate {
  const sizes = menu(card);
  const asked: Size = { cpu: Math.max(w.cpu, card.minCpu ?? 0), memoryGiB: w.memoryGiB };
  const size = sizes ? sizes.find((s) => fits(s, asked)) : card.max && !fits(card.max, asked) ? undefined : asked;
  const largest = sizes?.at(-1) ?? card.max;
  if (!size) return { kind: "no-size", id: card.id, largest: largest ?? asked };
  const parts = hourlyParts(card, size);
  if (!parts) return { kind: "no-size", id: card.id, largest: largest ?? asked };
  const fx = card.currency === "EUR" ? eurUsd : 1;
  const active = w.activeMinutes * 60;
  const idle = w.idleMinutes * 60;
  const perHour = (usd: number) => (usd * fx) / 3600;
  const one = (() => {
    switch (card.idle) {
      case "full":
        return billedSeconds(card, active + idle) * perHour(parts.cpu + parts.memory);
      case "memory":
        return active * perHour(parts.cpu) + billedSeconds(card, active + idle) * perHour(parts.memory);
      case "none":
        return billedSeconds(card, active) * perHour(parts.cpu + parts.memory);
      default: {
        const _exhaustive: never = card.idle;
        return _exhaustive;
      }
    }
  })();
  return {
    kind: "priced",
    id: card.id,
    monthlyUsd: w.sandboxes * (one + card.perSandbox * fx),
    size,
    roundedUp: size.cpu !== w.cpu || size.memoryGiB !== w.memoryGiB,
    hourlyUsd: (parts.cpu + parts.memory) * fx,
    atMost: card.idle !== "full",
  };
}

/** Every provider's estimate, cheapest first, then those with no size that fits. */
export function estimateAll(cards: readonly RateCard[], w: Workload, eurUsd: number): Estimate[] {
  const all = cards.map((c) => estimate(c, w, eurUsd));
  const priced = all.filter((e) => e.kind === "priced").sort((a, b) => a.monthlyUsd - b.monthlyUsd);
  return [...priced, ...all.filter((e) => e.kind === "no-size")];
}

/** "$1,234" over $100, "$12.34" over $1, "$0.0123" under: enough figures to tell providers apart. */
export function formatUsd(usd: number) {
  if (usd >= 100) return `$${Math.round(usd).toLocaleString("en-US")}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "under $0.0001";
  return `$${usd.toPrecision(2)}`;
}

/** "2 vCPU, 4 GB". */
export const sizeText = (s: Size) => `${s.cpu} vCPU, ${s.memoryGiB} GB`;
