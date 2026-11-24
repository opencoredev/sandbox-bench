import { LazyHomeTab } from "@/components/home-lazy";
import type { Tab } from "@/components/tabs";
import type { TabSetId } from "@/components/tab-sets";
import { landingTrack } from "@/lib/tracks";
import type { TrackId } from "@/lib/tracks";

const onServer = typeof window === "undefined";

/**
 * A tabbed card's tabs as the server sends them: the first with its chart,
 * the rest as stand-ins that build themselves from components/tab-sets.tsx
 * when first opened, so the page carries one chart per card. In the browser
 * (a card built after the page loaded) every tab keeps its chart.
 */
export function deferTabs(tabs: readonly Tab[], set: TabSetId, track: TrackId = landingTrack): Tab[] {
  if (!onServer) return [...tabs];
  const first = tabs.find((t) => "content" in t)?.id;
  return tabs.map((t) => ("content" in t && t.id !== first ? { ...t, content: <LazyHomeTab set={set} track={track} tab={t.id} /> } : t));
}
