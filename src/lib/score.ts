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
 * Rounded down, so only a result equal to the best (up to float noise) scores 100. A provider
 * with no reading scores nothing ("not measured"), never 0.
 */

export type Better = "lower" | "higher";

/** One provider's number in a category, in the unit the linked chart shows. */
export interface Reading {
  provider: ProviderId;
  value: number;
  /** How the cell prints the reading when its value alone can't say it, such as "18/20" runs completed. Never used to score. */
  display?: string;
  /** Words said beside the reading, such as "usage cost, unsettled" on a provider-reported usage cost. Never used to score. */
  tag?: string;
}

/** A reading the linked chart shows but doesn't count, such as a cost run on the wrong machine size, with why. */
export interface Excluded {
  provider: ProviderId;
  why: string;
}

export type Score =
  | { kind: "scored"; provider: ProviderId; score: number; value: number; best: boolean }
  | { kind: "excluded"; provider: ProviderId; why: string }
  | { kind: "not-measured"; provider: ProviderId };

/** A usable reading: finite and not negative. Anything else counts as not measured rather than as a bad score. */
const isUsable = (r: Reading) => Number.isFinite(r.value) && r.value >= 0;

/** Equal up to float noise: a relative difference of at most one part in a billion. */
const isTie = (value: number, best: number) => Math.abs(value - best) <= 1e-9 * Math.max(Math.abs(value), Math.abs(best));

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
 * usable reading is "not measured"; one in `excluded` is "excluded" and never
 * sets the best. With a reading listed twice, the first counts.
 */
export function scoreReadings({ providers, readings, excluded = [], better }: { providers: readonly ProviderId[]; readings: readonly Reading[]; excluded?: readonly Excluded[]; better: Better }): Score[] {
  const left = new Map(excluded.map((e) => [e.provider, e.why]));
  const usable = new Map<ProviderId, number>();
  for (const r of readings) if (isUsable(r) && !usable.has(r.provider) && !left.has(r.provider)) usable.set(r.provider, r.value);
  const values = [...usable.values()];
  const best = values.length === 0 ? null : better === "lower" ? Math.min(...values) : Math.max(...values);
  return providers.map((provider): Score => {
    const why = left.get(provider);
    if (why !== undefined) return { kind: "excluded", provider, why };
    const value = usable.get(provider);
    if (value === undefined || best === null) return { kind: "not-measured", provider };
    // A tie is equal up to float noise (0.1 + 0.2 against 0.3); it scores 100 and is marked best. Anything else
    // is capped at 99, and the epsilon keeps a float like 28.999999999999996 from flooring to 28.
    const tie = isTie(value, best);
    const score = tie ? 100 : Math.min(99, Math.floor(100 * ratio(value, best, better) + 1e-9));
    return { kind: "scored", provider, score, value, best: tie };
  });
}

/**
 * Anything a category ranks: a measured reading, scored or shown as its value,
 * or no usable result.
 */
export type Ranked =
  | { kind: "scored" | "valued"; provider: ProviderId; value: number }
  | { kind: "excluded" | "not-measured"; provider: ProviderId };

/**
 * Measured providers best first by the raw number (ties keep the given
 * order), then the excluded and not measured, so a sort never ranks them. A
 * score only falls as the number gets worse, so this is also highest score
 * first.
 */
export function rankScores<S extends Ranked>(scores: readonly S[], better: Better): S[] {
  const order = new Map(scores.map((s, i) => [s.provider, i]));
  const byOrder = (a: Ranked, b: Ranked) => (order.get(a.provider) ?? 0) - (order.get(b.provider) ?? 0);
  const valueOf = (s: Ranked) => (s.kind === "scored" || s.kind === "valued" ? s.value : null);
  return [...scores].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va === null || vb === null) return (va === null ? 1 : 0) - (vb === null ? 1 : 0) || byOrder(a, b);
    return (better === "lower" ? va - vb : vb - va) || byOrder(a, b);
  });
}
