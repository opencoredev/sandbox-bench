import type { DatabuddyProviderProps } from "@databuddy/sdk/react";

/** Public client ID of the "AI Sandbox Bench" website in Databuddy (Leo's Workspace). Safe to ship. */
export const databuddyClientId = "9ba806bf-df8d-4a9c-a97b-b058d3733026";

/** The browser's privacy signals and Databuddy's stored opt-out, as the tracker reads them. */
export type PrivacySignals = {
  doNotTrack: string | null | undefined;
  globalPrivacyControl: boolean | undefined;
  stored: (key: string) => string | null;
};

/**
 * Whether the visitor declined tracking: Do Not Track, Global Privacy Control,
 * or Databuddy's opt-out. The tracker stops itself on these; this also keeps the
 * flags request, which carries the visitor id, from leaving the browser.
 */
export function hasOptedOut({ doNotTrack, globalPrivacyControl, stored }: PrivacySignals): boolean {
  return doNotTrack === "1" || globalPrivacyControl === true || stored("databuddy_opt_out") === "true" || stored("databuddy_disabled") === "true";
}

/**
 * DatabuddyProvider's settings: the tracker (pageviews, web vitals, outgoing
 * links, errors, `data-track` clicks), session replay and feature flags.
 * Only production builds for visitors who haven't opted out load anything, so
 * `next dev`, tests and opted-out visitors send nothing and every flag serves
 * its default. Runs alongside PostHog, which stays the source the SEO agent reads.
 */
export function databuddyOptions({ nodeEnv, optedOut }: { nodeEnv: string | undefined; optedOut: boolean }) {
  return {
    clientId: databuddyClientId,
    disabled: nodeEnv !== "production" || optedOut,
    replay: true,
    autocapture: { webVitals: true, outgoingLinks: true, errors: true, attributes: true },
  } as const satisfies Omit<DatabuddyProviderProps, "children">;
}
