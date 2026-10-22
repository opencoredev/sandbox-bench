/**
 * The two ways the benchmark compares providers. Kept apart from data.ts so
 * client components can name tracks without bundling the data.
 */
export const trackIds = ["default", "same-spec"] as const;
export type TrackId = (typeof trackIds)[number];
export const isTrackId = (value: string): value is TrackId => (trackIds as readonly string[]).includes(value);

export const trackInfo = {
  default: {
    label: "Default machines",
    tab: "Default machines",
    short: "Default",
    description: "Each provider's default sandbox, so machine sizes differ.",
  },
  "same-spec": {
    label: "Same machine: 4 vCPU, 8 GB",
    tab: "Same machine",
    short: "4 vCPU, 8 GB",
    description: "Every provider asked for Boat's machine, 4 vCPU and 8 GB, or its nearest size.",
  },
} as const satisfies Record<TrackId, { label: string; tab: string; short: string; description: string }>;

/** The id and rules of the style element that shows the same-machine track. React leaves foreign <head> nodes alone, unlike attributes on <html>. */
export const trackStyle = {
  id: "track-same-spec",
  css: '[data-track-view="default"]{display:none!important}[data-track-view="same-spec"]{display:contents!important}',
} as const;
