"use client";

import { Suspense, lazy } from "react";

import type { HomeSectionId } from "@/components/home-sections";
import type { TabSetId } from "@/components/tab-sets";
import { useActiveTrack } from "@/components/track-switch";
import type { TrackId } from "@/lib/tracks";

/*
 * The homepage's charts that aren't on screen when it loads, the other
 * machine track and every tab past a card's first, are built here in the
 * browser from components/home-sections.tsx and components/tab-sets.tsx,
 * loaded the first time one opens.
 * The HTML and its payload carry only what the page shows first.
 */
const Section = lazy(() => import("@/components/home-sections").then((m) => ({ default: m.HomeSection })));
const TabContent = lazy(() => import("@/components/tab-sets").then((m) => ({ default: m.TabSetContent })));

const Loading = ({ tall = false }: { tall?: boolean }) => (
  <p role="status" className={`text-s text-neutral-7 ${tall ? "min-h-[480px]" : "min-h-[320px]"}`}>
    Loading the chart…
  </p>
);

/** A tab's chart, built when its tab first opens. */
export function LazyHomeTab({ set, track, tab }: { set: TabSetId; track: TrackId; tab: string }) {
  return (
    <Suspense fallback={<Loading />}>
      <TabContent set={set} track={track} tab={tab} />
    </Suspense>
  );
}

/** A part of the page for a track that isn't the landing one, built while the switch shows that track. */
export function LazyTrackSection({ section, track }: { section: HomeSectionId; track: TrackId }) {
  if (useActiveTrack() !== track) return null;
  return (
    <Suspense fallback={<Loading tall />}>
      <Section section={section} track={track} />
    </Suspense>
  );
}
