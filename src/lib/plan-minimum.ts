import { regionNote } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * A provider's monthly plan minimum, read from the pricing notes the site
 * already publishes for it (the harness's pricing.ts, "$20 monthly minimum"),
 * never typed here. Per-task costs are usage only, so a minimum is always
 * outside them and has to be said beside the number.
 */
export interface PlanMinimum {
  usdPerMonth: number;
  source: string | null;
}

export function planMinimum(id: ProviderId): PlanMinimum | null {
  for (const t of trackIds) {
    const p = tracks[t].providers.find((x) => x.id === id);
    const m = p?.pricingNotes ? /\$(\d+(?:\.\d+)?) monthly minimum/.exec(p.pricingNotes) : null;
    if (p && m?.[1]) return { usdPerMonth: Number(m[1]), source: p.pricingSource };
  }
  return null;
}

/** Beside the provider's bar and row. */
export const minimumShort = "usage only; monthly minimum excluded";

/** In the provider's details and the agent files. */
export const minimumLong = (id: ProviderId, m: PlanMinimum) =>
  `Usage only: ${providerName(id)}'s $${m.usdPerMonth} monthly plan minimum isn't in these costs (from its pricing notes${m.source ? `, ${m.source}` : ""}).`;

/**
 * The pinned-region note the quick-task charts already show (regionNote in
 * lib/cost.ts), for a provider on one site track, or null where no multiplier
 * applies. "short" fits beside a bar: "us-east rate, 1.75× base price".
 */
export function regionFor(id: ProviderId, track: TrackId) {
  const p = tracks[track].providers.find((x) => x.id === id);
  const long = p ? regionNote(p) : null;
  if (!p || !long) return null;
  return { long, short: `${p.pricingRegion ?? "pinned-region"} rate, ${Number(p.regionMultiplier.toFixed(3))}× base price` };
}
