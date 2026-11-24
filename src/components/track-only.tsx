"use client";

import type { ReactNode } from "react";

import { useActiveTrack } from "@/components/track-switch";
import type { TrackId } from "@/lib/tracks";

/**
 * Builds its part of the page only while its track is on screen. The other
 * track's results stay out of the HTML, so the page carries one set of
 * charts; they are drawn from the page's data when the switch opens them.
 */
export function TrackOnly({ track, children }: { track: TrackId; children: ReactNode }) {
  return useActiveTrack() === track ? children : null;
}
