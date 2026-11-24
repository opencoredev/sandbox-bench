import type { ReactNode } from "react";

import { TrackOnly } from "@/components/track-only";
import { trackIds, tracks } from "@/lib/data";
import type { Track } from "@/lib/data";
import { landingTrack, linkedTrack, trackStyle } from "@/lib/tracks";

/**
 * Renders a part of the page once per track. The static export has no
 * server to read `?track=`, so globals.css shows the landing track and
 * trackStyle, added to <head> by trackScript or the switch, flips it.
 *
 * The HTML carries the landing track only; the other track's part is drawn
 * in the browser when it is shown, so the page doesn't ship every chart twice.
 * `eager` ships both, for a line of text that must not flash in on `?track=`.
 */
export function Tracked({ children, eager = false }: { children: (track: Track) => ReactNode; eager?: boolean }) {
  return (
    <>
      {trackIds.map((id) => (
        <div key={id} data-track-view={id}>
          {eager || id === landingTrack ? children(tracks[id]) : <TrackOnly track={id}>{children(tracks[id])}</TrackOnly>}
        </div>
      ))}
    </>
  );
}

/**
 * Runs in <head> before the page paints: reads `?track=` and adds trackStyle,
 * so a shared default-machines link never flashes the same-machine results first.
 */
export const trackScript = `(function(){try{if(new URLSearchParams(location.search).get("track")===${JSON.stringify(linkedTrack)}){var s=document.createElement("style");s.id=${JSON.stringify(trackStyle.id)};s.textContent=${JSON.stringify(trackStyle.css)};document.head.appendChild(s)}}catch(e){}})()`;
