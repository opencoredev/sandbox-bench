/**
 * Sends one PostHog event through the instance PostHogProvider starts. Does
 * nothing outside production builds or before PostHog has loaded (Do Not
 * Track, blocked script), and never throws. Properties must hold no personal
 * details: no names, emails or free text.
 */
export function captureEvent(event: string, properties: Readonly<Record<string, string | number | boolean>>) {
  if (process.env.NODE_ENV !== "production") return;
  void import("posthog-js")
    .then(({ default: posthog }) => {
      if (posthog.__loaded) posthog.capture(event, properties);
    })
    .catch(() => undefined);
}
