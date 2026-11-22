import type { ScriptHTMLAttributes } from "react";

/** Public client ID of the "AI Sandbox Bench" website in Databuddy (Leo's Workspace). Safe to ship. */
export const databuddyClientId = "9ba806bf-df8d-4a9c-a97b-b058d3733026";

/** A `<script>` tag's props, including the `data-*` attributes Databuddy reads its settings from. */
export type DatabuddyScriptProps = ScriptHTMLAttributes<HTMLScriptElement> & Record<`data-${string}`, string> & { src: string };

/**
 * The tracker (pageviews, web vitals, outgoing links, errors) and session replay, loaded async from
 * Databuddy's CDN, as on cicdbench.com. Runs alongside PostHog, which stays the source the SEO agent reads.
 */
export const databuddyScriptTags = [
  {
    src: "https://cdn.databuddy.cc/databuddy.js",
    "data-client-id": databuddyClientId,
    "data-track-web-vitals": "true",
    "data-track-outgoing-links": "true",
    "data-track-errors": "true",
    crossOrigin: "anonymous",
    async: true,
  },
  {
    src: "https://cdn.databuddy.cc/replay.js",
    "data-client-id": databuddyClientId,
    crossOrigin: "anonymous",
    async: true,
  },
] as const satisfies readonly DatabuddyScriptProps[];

/** The script tags for the page head: only production builds load Databuddy, so `next dev` and tests send nothing. */
export function databuddyScripts({ nodeEnv }: { nodeEnv: string | undefined }): readonly DatabuddyScriptProps[] {
  return nodeEnv === "production" ? databuddyScriptTags : [];
}
