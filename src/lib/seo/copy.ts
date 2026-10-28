import type { ProviderPageId } from "@/lib/seo/pages";

/**
 * The caveats every results page carries, worded as the live /llms.txt and
 * /results.md word them (src/lib/agent-data.ts). Re-read those when the data
 * changes and keep these in step: these lines restate the site's notes, they
 * never add claims of their own.
 */
export const caveats = [
  "Every call starts from one server in Florida, US. Providers hosted farther away pay that round trip on every call; Boat (France) and boxd (Germany) pay a transatlantic one.",
  "There are two tracks. The same-machine track asks every provider for 4 vCPU and 8 GB, or its nearest size; a provider marked “machine differs” measured something else inside. The default track compares each provider's default sandbox, so sizes differ.",
  "Cost per task has a kind. Billed comes from the provider's bill, metered from its usage records at published rates, and estimate from our measured time at list price. Kinds are not directly comparable. Prices cover compute only at list rates: disk, transfer, subscriptions and credits are excluded.",
  "Pause and resume times come from the previous SDK run, because the newest runs skipped them. A burst size is published only when all three bursts finished.",
  "Failures caused by our own code are set aside, not counted. Every provider-side failure is kept.",
  "Ranks compare medians. Medians inside each other's 95% intervals count as tied, so a close rank can be noise.",
] as const;

/** Notes that apply to one provider only, again restating the live /llms.txt. */
export const providerCaveats: Record<ProviderPageId, readonly string[]> = {
  e2b: [],
  daytona: [
    "Daytona was re-collected on Oct 22 after its account quota was raised from 10 vCPU / 10 GiB; earlier Daytona numbers were limited by that quota. Its billed cost can still change for up to 48 hours.",
  ],
};

/** Who runs the bench, said plainly on every page. */
export const disclosure =
  "Sandbox bench runs on Sandbox SDK, which the same team (opencoredev) builds. We may work with some of these providers. No provider paid for these results or decided how they were tested.";
