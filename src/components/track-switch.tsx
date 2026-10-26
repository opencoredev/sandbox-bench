"use client";

import { useSyncExternalStore } from "react";
import type { MouseEvent } from "react";

import { themePart } from "@graphical/components/library/component-theme";

import { landingTrack, linkedTrack, trackFromParam, trackIds, trackInfo, trackStyle } from "@/lib/tracks";
import type { TrackId } from "@/lib/tracks";

const EVENT = "sandbox-bench:track";

function subscribe(onChange: () => void) {
  // Back and forward restore the URL; follow it.
  const onPop = () => {
    show(trackFromParam(new URLSearchParams(window.location.search).get("track")));
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("popstate", onPop);
  };
}

const current = (): TrackId => (document.getElementById(trackStyle.id) ? linkedTrack : landingTrack);

/** Shows a track by adding or removing the style element trackScript would have added. */
function show(id: TrackId) {
  const existing = document.getElementById(trackStyle.id);
  if (id === landingTrack) existing?.remove();
  else if (!existing) {
    const style = document.createElement("style");
    style.id = trackStyle.id;
    style.textContent = trackStyle.css;
    document.head.appendChild(style);
  }
}

/** `?track=default`, or no query for the landing track, keeping the hash. */
const hrefFor = (id: TrackId) => (id === landingTrack ? "./" : `?track=${id}`);

/** Switches the whole page to a track without a reload, and keeps the URL shareable. */
function select(event: MouseEvent<HTMLAnchorElement>, id: TrackId) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  const url = new URL(window.location.href);
  if (id === landingTrack) url.searchParams.delete("track");
  else url.searchParams.set("track", id);
  show(id);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(EVENT));
}

// The theme's toggle group: a segment per track, the current one pressed. Links, not toggles, so they work without scripts.
const Segment = themePart("a", "toggle-group", "control", "ui-button");

/**
 * The one control that picks which results every chart shows. Plain links
 * underneath, so it works before scripts load and in a new tab.
 */
export function TrackSwitch({ size = "large" }: { size?: "large" | "small" }) {
  const active = useSyncExternalStore(subscribe, current, (): TrackId => landingTrack);
  const large = size === "large";
  return (
    <nav aria-label="Machines compared" className={large ? "w-full sm:w-fit" : "w-fit"}>
      <ul className={`surface flex gap-xxs p-xxs ${large ? "w-full sm:w-fit" : ""}`}>
        {trackIds.map((id) => {
          const on = id === active;
          return (
            <li key={id} className={large ? "flex-1 sm:flex-none" : ""}>
              <Segment
                href={hrefFor(id)}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => select(event, id)}
                aria-current={on ? "page" : undefined}
                // Short labels fit the header; the full one is the tooltip and the accessible name.
                title={large ? undefined : trackInfo[id].label}
                aria-label={large ? undefined : trackInfo[id].label}
                data-pressed={on ? "" : undefined}
                className={`w-full ${on ? "" : "text-neutral-7"}`}
              >
                {large ? (
                  <>
                    <span className="sm:hidden">{trackInfo[id].tab}</span>
                    <span className="hidden sm:inline">{trackInfo[id].label}</span>
                  </>
                ) : (
                  trackInfo[id].short
                )}
              </Segment>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
