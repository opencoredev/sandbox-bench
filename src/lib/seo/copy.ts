import { hasLowerBounds } from "@/lib/cost";
import { trackIds, tracks } from "@/lib/data";
import { trackInfo } from "@/lib/tracks";

/** Said once the data has a lower-bound cost or price; absent until then, so current pages read as before. */
const lowerBoundCaveat = hasLowerBounds(trackIds.map((id) => tracks[id]))
  ? " A lower bound is shown as “at least” its amount, because the provider also bills use above the resources it counts; it is never ranked against exact costs or picked."
  : "";

/**
 * The caveats every results page carries, worded as the live /llms.txt and
 * /results.md word them (src/lib/agent-data.ts). Re-read those when the data
 * changes and keep these in step: these lines restate the site's notes, they
 * never add claims of their own.
 */
export const caveats = [
  "Every call starts from one server in Florida, US. Providers hosted farther away pay that round trip on every call; Boat (France) pays a transatlantic one.",
  `There are two tracks. ${trackInfo["same-spec"].label}: ${trackInfo["same-spec"].description} A provider marked “machine differs” measured something else inside. ${trackInfo.default.label}: ${trackInfo.default.description}`,
  `Cost per task has a kind. Billed comes from the provider's bill, metered from its usage records at published rates, and estimate from our measured time at list price. Kinds are not directly comparable. There is no overall cheapest pick: the cost pick is the lowest verified cost among eligible providers, and a cost is eligible only if it is billed and settled, and not flagged provisional. Metered costs stay unreconciled until checked against the provider's settled charges, which none has been yet. Provisional, unreconciled, unsettled and estimated costs are shown with their status, never picked. Each cost names its provider's billing model, or says the billing basis is not confirmed.${lowerBoundCaveat} Prices cover compute only at list rates: disk, transfer, subscriptions and credits are excluded.`,
  "Pause and resume times come from the previous SDK run, because the newest runs skipped them; boxd's come from its Nov 4 re-run in New York. A burst size is published only when all three bursts finished.",
  "Failures caused by our own code are set aside, not counted. Every provider-side failure is kept.",
  "Ranks compare medians. Medians inside each other's 95% intervals count as tied, so a close rank can be noise.",
] as const;

/** Who runs the bench, said plainly on every page. */
export const disclosure =
  "Sandbox bench runs on Sandbox SDK, which the same team (opencoredev) builds. We may work with some of these providers. No provider paid for these results or decided how they were tested.";

/**
 * Sandbox providers people ask about that the bench has not run. Pages say so
 * plainly and publish no numbers for them. Names match providerName, so
 * copy.test.ts fails once one of them has data: remove it here then.
 */
export const untested = ["Cloudflare Sandbox", "Runloop", "Northflank", "Blaxel", "Fly Sprites", "CodeSandbox", "Morph"] as const;
