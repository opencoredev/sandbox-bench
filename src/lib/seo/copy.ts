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
  `Cost per task comes from each provider's bill or usage records where it gives one, and otherwise from our measured time at list price. Cheapest requires a provider bill or usage meter: list-price estimates are shown on the chart but not picked.${lowerBoundCaveat} Prices cover compute only at list rates: disk, transfer, subscriptions and credits are excluded.`,
  "Pause and resume times come from the previous SDK run, because the newest runs skipped them; boxd's come from its Nov 19 re-run in New York, Baseten's resume from its own run on Nov 17 (Baseten has no pause call, so only its resume is timed), and Instabox's, like all its results, from its own runs on Nov 18. Beam's results come from its own runs on Nov 18; Beam sandboxes have no pause call. Maritime's, like all its results, come from its own runs on Nov 23 and 24, each burst started a minute apart to stay inside its create rate (30 a minute per API key). Styne's, like all its results, come from its own runs on Nov 23. Buddy's, like all its results, come from its own runs on Nov 25, spread across UTC hours to stay inside its limit of 5,000 API requests an hour per route. A burst size is published only when all three bursts finished.",
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
