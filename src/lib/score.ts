import type { ProviderId } from "@/lib/providers";

/**
 * Per-category scores: a 0–100 transform of one number the page already
 * shows, relative to the best provider in that category. Pure, so the page,
 * the tests and any export read the same rule. Categories are never added
 * together: there is no overall score.
 *
 *   lower is better:  score = floor(100 × best ÷ value)
 *   higher is better: score = floor(100 × value ÷ best)
 *
 * Rounded down, so only a result equal to the best scores 100. A provider
 * with no reading scores nothing ("not measured"), never 0.
 */

export type Better = "lower" | "higher";

/** One provider's number in a category, in the unit the linked chart shows. */
export interface Reading {
  provider: ProviderId;
  value: number;
}

export type Score =
  | { kind: "scored"; provider: ProviderId; score: number; value: number; best: boolean }
  | { kind: "not-measured"; provider: ProviderId };

/** A usable reading: finite and not negative. Anything else counts as not measured rather than as a bad score. */
const isUsable = (r: Reading) => Number.isFinite(r.value) && r.value >= 0;

/** How close a value is to the best, from 0 to 1. Total: a best of 0 is handled, so no division by zero. */
function ratio(value: number, best: number, better: Better): number {
  if (value === best) return 1;
  switch (better) {
    // best ≤ value here, and value > 0 because value ≠ best ≥ 0.
    case "lower":
      return best / value;
    // value < best here, so best > 0.
    case "higher":
      return value / best;
    default: {
      const _exhaustive: never = better;
      return _exhaustive;
    }
  }
}

/**
 * Scores every provider in `providers`, in that order. A provider with no
 * usable reading is "not measured". With a reading listed twice, the first counts.
 */
export function scoreReadings({ providers, readings, better }: { providers: readonly ProviderId[]; readings: readonly Reading[]; better: Better }): Score[] {
  const usable = new Map<ProviderId, number>();
  for (const r of readings) if (isUsable(r) && !usable.has(r.provider)) usable.set(r.provider, r.value);
  const values = [...usable.values()];
  const best = values.length === 0 ? null : better === "lower" ? Math.min(...values) : Math.max(...values);
  return providers.map((provider): Score => {
    const value = usable.get(provider);
    if (value === undefined || best === null) return { kind: "not-measured", provider };
    // The epsilon keeps a float like 99.99999999 from rounding an exact tie down to 99.
    const score = Math.floor(100 * ratio(value, best, better) + 1e-9);
    return { kind: "scored", provider, score, value, best: value === best };
  });
}

/**
 * Scored providers highest first (ties by the raw number, then the given
 * order), then the not measured, so a sort never ranks a missing result.
 */
export function rankScores<S extends Score>(scores: readonly S[], better: Better): S[] {
  const order = new Map(scores.map((s, i) => [s.provider, i]));
  const byOrder = (a: Score, b: Score) => (order.get(a.provider) ?? 0) - (order.get(b.provider) ?? 0);
  return [...scores].sort((a, b) => {
    if (a.kind === "not-measured" || b.kind === "not-measured") return (a.kind === "not-measured" ? 1 : 0) - (b.kind === "not-measured" ? 1 : 0) || byOrder(a, b);
    const byValue = better === "lower" ? a.value - b.value : b.value - a.value;
    return b.score - a.score || byValue || byOrder(a, b);
  });
}
