import type { PostHogConfig } from "posthog-js";

/** Public project key for the "Sandbox bench" PostHog project (681867). Safe to ship. */
export const posthogKey = "phc_yts4KuazLqhoULdroEXgKNxDMeGUyHEWNDsptwQUzGni";

/**
 * Web analytics only: pageviews, page leaves and web vitals. No session replay,
 * no surveys, and nothing for visitors who send Do Not Track.
 */
export const posthogConfig = {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-08-30",
  capture_pageview: "history_change",
  capture_pageleave: true,
  capture_performance: { web_vitals: true, network_timing: false },
  autocapture: { capture_copied_text: false },
  disable_session_recording: true,
  disable_surveys: true,
  enable_heatmaps: false,
  capture_dead_clicks: false,
  respect_dnt: true,
  person_profiles: "identified_only",
} satisfies Partial<PostHogConfig>;
