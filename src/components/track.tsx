import type { ReactNode } from "react";

import { trackIds, tracks } from "@/lib/data";
import type { Track } from "@/lib/data";
import { trackStyle } from "@/lib/tracks";

/**
 * Renders a part of the page once per track. The static export has no
 * server to read `?track=`, so both versions ship. globals.css shows the
 * default; trackStyle, added to <head> by trackScript or the switch, flips it.
 */
export function Tracked({ children }: { children: (track: Track) => ReactNode }) {
  return (
    <>
      {trackIds.map((id) => (
        <div key={id} data-track-view={id}>
          {children(tracks[id])}
        </div>
      ))}
    </>
  );
}

/**
 * Runs in <head> before the page paints: reads `?track=` and adds trackStyle,
 * so a shared same-machine link never flashes the default results first.
 */
export const trackScript = `(function(){try{if(new URLSearchParams(location.search).get("track")==="same-spec"){var s=document.createElement("style");s.id=${JSON.stringify(trackStyle.id)};s.textContent=${JSON.stringify(trackStyle.css)};document.head.appendChild(s)}}catch(e){}})()`;
