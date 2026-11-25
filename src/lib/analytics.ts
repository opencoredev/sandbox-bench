import { track } from "@databuddy/sdk";

import type { ContactResult } from "@/lib/contact";
import type { TierView } from "@/lib/tiers";
import type { TrackId } from "@/lib/tracks";

/** The section ids SectionViews reports, from the home page's sections. */
export const viewedSections = ["real-tasks", "task-cost", "reliability", "method", "private-benchmarks"] as const;
export type ViewedSection = (typeof viewedSections)[number];

/**
 * Every event the site sends from code, with its properties. Properties hold
 * no personal details: no names, emails or free text, only these labels.
 * CTA clicks are sent by the Databuddy tracker from `ctaAttributes` instead.
 */
type Events = {
  private_benchmarks_contact_submitted: { outcome: "invalid" | ContactResult["kind"] };
  track_switched: { track: TrackId };
  tiers_switched: { view: TierView };
  section_viewed: { section: ViewedSection };
};

/**
 * Sends one event to Databuddy and PostHog. Does nothing outside production
 * builds, and never throws: Databuddy queues it until its tracker loads, and
 * PostHog drops it until loaded (Do Not Track, blocked script).
 */
export function captureEvent<E extends keyof Events>(event: E, properties: Events[E]) {
  if (process.env.NODE_ENV !== "production") return;
  track(event, properties);
  void import("posthog-js")
    .then(({ default: posthog }) => {
      if (posthog.__loaded) posthog.capture(event, properties);
    })
    .catch(() => undefined);
}
