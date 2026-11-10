import type { Provider } from "@/lib/data";
import { formatMoney } from "@/lib/format";

/** ECB euro reference rate used to put euro prices on the dollar charts. */
export const eurUsd = {
  rate: 1.1234,
  date: "October 21, 2026",
  source: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
} as const;

export type PriceKey = "hourly" | "perVcpuHour";

/**
 * A provider's price in dollars, converted from euros where it bills in euros.
 * `bound` says whether it is a lower bound (both keys come from the same
 * priced allocation, so they share it).
 */
export function usdPrice(p: Provider, key: PriceKey) {
  const value = p[key];
  if (value === null) return null;
  return p.currency === "EUR"
    ? { usd: value * eurUsd.rate, converted: true, original: formatMoney(value, "EUR"), bound: p.pricingBound }
    : { usd: value, converted: false, original: formatMoney(value, p.currency), bound: p.pricingBound };
}

/** The footnote for a converted price. */
export const conversionNote = (original: string, per: string) =>
  `bills in euros, ${original} ${per}, converted at the ECB rate of ${eurUsd.rate} dollars per euro on ${eurUsd.date}.`;

/** The common allocation; providers without this exact size have no price. */
export const commonSize = { vcpu: 4, memoryGiB: 8, label: "4 vCPU, 8 GB" } as const;

/** Compute-only price from the harness's audited size model, converted to USD. */
export function commonPrice(p: Provider) {
  if (p.commonHourly === null) return null;
  return {
    usd: p.currency === "EUR" ? p.commonHourly * eurUsd.rate : p.commonHourly,
  };
}
