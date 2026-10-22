"use client";

import { useSyncExternalStore } from "react";
import type { MouseEvent } from "react";

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

/**
 * The one control that picks which results every chart shows. Plain links
 * underneath, so it works before scripts load and in a new tab.
 */
export function TrackSwitch({ size = "large" }: { size?: "large" | "small" }) {
  const active = useSyncExternalStore(subscribe, current, (): TrackId => landingTrack);
  const large = size === "large";
  return (
    <nav aria-label="Machines compared" className={large ? "w-full sm:w-auto" : ""}>
      <ul className={`flex rounded-lg border border-[var(--line)] bg-[var(--band)] p-1 ${large ? "w-full sm:w-auto" : ""}`}>
        {trackIds.map((id) => {
          const on = id === active;
          return (
            <li key={id} className={large ? "flex-1 sm:flex-none" : ""}>
              <a
                href={hrefFor(id)}
                onClick={(event) => select(event, id)}
                aria-current={on ? "page" : undefined}
                className={`flex items-center justify-center rounded-md whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/60 motion-reduce:transition-none ${
                  large ? "h-11 px-4 text-[14px] sm:h-10" : "h-8 px-2.5 text-[12.5px]"
                } ${on ? "bg-[var(--foreground)] font-medium text-[var(--background)]" : "text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--foreground)]"}`}
              >
                {large ? (
                  <>
                    <span className="sm:hidden">{trackInfo[id].tab}</span>
                    <span className="hidden sm:inline">{trackInfo[id].label}</span>
                  </>
                ) : (
                  trackInfo[id].short
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
