import type { DatabuddyProviderProps } from "@databuddy/sdk/react";

/** Public client ID of the "AI Sandbox Bench" website in Databuddy (Leo's Workspace). Safe to ship. */
export const databuddyClientId = "9ba806bf-df8d-4a9c-a97b-b058d3733026";

/**
 * DatabuddyProvider's settings: the tracker (pageviews, web vitals, outgoing
 * links, errors, `data-track` clicks), session replay and feature flags.
 * Only production builds load anything, so `next dev` and tests send nothing
 * and every flag serves its default. Runs alongside PostHog, which stays the
 * source the SEO agent reads.
 */
export function databuddyOptions({ nodeEnv }: { nodeEnv: string | undefined }) {
  return {
    clientId: databuddyClientId,
    disabled: nodeEnv !== "production",
    replay: true,
    autocapture: { webVitals: true, outgoingLinks: true, errors: true, attributes: true },
  } as const satisfies Omit<DatabuddyProviderProps, "children">;
}
