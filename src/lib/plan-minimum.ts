import { regionNote } from "@/lib/cost";
import { tracks } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

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
