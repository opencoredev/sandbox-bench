/**
 * The two ways the benchmark compares providers. Kept apart from data.ts so
 * client components can name tracks without bundling the data.
 */
/** In switch order: the same machine leads, because it is the fair comparison. */
export const trackIds = ["same-spec", "default"] as const;
export type TrackId = (typeof trackIds)[number];
export const isTrackId = (value: string): value is TrackId => (trackIds as readonly string[]).includes(value);

/** The track the bare URL shows. */
export const landingTrack = "same-spec" satisfies TrackId;
/** The track only `?track=default` shows. */
export const linkedTrack = "default" satisfies TrackId;
/** Which track a `?track=` value opens; anything but the linked track, old same-spec links included, lands on the landing track. */
export const trackFromParam = (value: string | null): TrackId => (value === linkedTrack ? linkedTrack : landingTrack);

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

/** The id and rules of the style element that shows the linked track. React leaves foreign <head> nodes alone, unlike attributes on <html>. */
export const trackStyle = {
  id: `track-${linkedTrack}`,
  css: `[data-track-view="${landingTrack}"]{display:none!important}[data-track-view="${linkedTrack}"]{display:contents!important}`,
} as const;
