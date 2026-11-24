import { locationTabs } from "@/components/by-location";
import { expandedTabs } from "@/components/expanded-benchmarks";
import { homeTabSets } from "@/components/home-sections";
import { taskCostTabs } from "@/components/realistic";
import { scoreTabs } from "@/components/scores";
import type { Tab } from "@/components/tabs";
import { tracks } from "@/lib/data";
import type { Track } from "@/lib/data";
import { expanded } from "@/lib/expanded-data";
import type { TrackId } from "@/lib/tracks";

/**
 * Every tabbed card whose later tabs are built in the browser, by name: the
 * server sends a card's first tab (components/lazy-tabs.tsx) and this module,
 * loaded when another tab first opens, builds that tab the same way.
 */
export const tabSets = {
  ...homeTabSets,
  "task-cost": (track: Track) => taskCostTabs(track),
  scores: (track: Track) => scoreTabs(track),
  locations: () => locationTabs(),
  expanded: () => expandedTabs(expanded),
} satisfies Record<string, (track: Track) => Tab[]>;
export type TabSetId = keyof typeof tabSets;

/** The tab with this id in a set, as the server would have built it. */
export function TabSetContent({ set, track, tab }: { set: TabSetId; track: TrackId; tab: string }) {
  const found = tabSets[set](tracks[track]).find((t) => t.id === tab);
  return found && "content" in found ? found.content : null;
}
