"use client";

import { Component, Suspense, lazy, useState } from "react";
import type { ReactNode } from "react";

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

/** If the chunk that builds a chart can't load (offline, a deploy replaced it), say so instead of leaving a gap. */
class LoadFailed extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert" className="text-s text-neutral-7">
        This chart couldn&apos;t load.{" "}
        <button type="button" onClick={() => window.location.reload()} className="focus-ring rounded-xs text-accent underline decoration-dotted underline-offset-4 hover:text-neutral-10">
          Reload the page
        </button>
      </p>
    ) : (
      this.props.children
    );
  }
}

/** A tab's chart, built when its tab first opens. */
export function LazyHomeTab({ set, track, tab }: { set: TabSetId; track: TrackId; tab: string }) {
  return (
    <LoadFailed>
      <Suspense fallback={<Loading />}>
        <TabContent set={set} track={track} tab={tab} />
      </Suspense>
    </LoadFailed>
  );
}

/**
 * A part of the page for a track that isn't the landing one. It is built the
 * first time the switch shows that track and kept after, so its tabs stay as
 * they were left; globals.css hides it while the other track shows. Until
 * then the HTML holds a loading line, so a `?track=` link never shows a gap.
 */
export function LazyTrackSection({ section, track }: { section: HomeSectionId; track: TrackId }) {
  const active = useActiveTrack() === track;
  const [seen, setSeen] = useState(false);
  if (active && !seen) setSeen(true);
  if (!seen) return <Loading tall />;
  return (
    <LoadFailed>
      <Suspense fallback={<Loading tall />}>
        <Section section={section} track={track} />
      </Suspense>
    </LoadFailed>
  );
}
