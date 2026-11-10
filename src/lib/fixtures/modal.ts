import { parseProvider, readCostPerTask, tracks } from "@/lib/data";
import type { Track } from "@/lib/data";
import type { SiteProviderExport } from "@/lib/inputs";

/**
 * Test fixtures only, never published: a Modal row shaped like the SBX-103
 * harness export (bench/src/site-data.ts), with a default-track lower bound
 * and the us-east 1.75x multiplier. The amounts are made up and chosen to sit
 * below every published cost, so a test fails if a lower bound is ever ranked
 * or picked as if it were exact.
 */

const base = tracks["same-spec"];
const template = base.providers[0];
if (!template) throw new Error("fixture needs a published provider to copy");

/** A Modal export row; `bound` sets both the hourly price's and the cost's bound. */
export function modalExport(bound: "lower" | "exact" | null, usd = 0.000001): SiteProviderExport {
  const { pricingBound: _b, pricingRegion: _r, regionMultiplier: _m, ...rest } = template;
  return {
    ...rest,
    id: "modal",
    track: base.id,
    currency: "USD",
    hourly: 0.0362,
    commonHourly: 1.3293,
    pricingBound: bound,
    pricingRegion: "us-east",
    regionMultiplier: 1.75,
    costPerTask: { usd, kind: "estimate", source: "Modal list price (fixture)", confidence: "low", n: 10, settled: true, bound },
  };
}

/** The published same-machine track with the Modal fixture added. */
export function withModal(bound: "lower" | "exact" | null, usd?: number): Track {
  const row = modalExport(bound, usd);
  return {
    ...base,
    // The published data has Modal too; the fixture replaces it.
    providers: [...base.providers.filter((p) => p.id !== "modal"), ...parseProvider(row)],
    costs: { ...base.costs, modal: readCostPerTask(row) },
  };
}

/** A track whose only costs are Modal's lower bound. */
export function onlyModalLowerBound(): Track {
  const t = withModal("lower");
  return { ...t, costs: { modal: t.costs.modal } };
}
