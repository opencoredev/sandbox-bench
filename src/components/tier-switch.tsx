"use client";

import { useSyncExternalStore } from "react";
import type { MouseEvent } from "react";

import { themePart } from "@graphical/components/library/component-theme";

import { allTiersValue, tierParam, tierStyle, tierViewInfo, tierViews } from "@/lib/tiers";
import type { TierView } from "@/lib/tiers";

const EVENT = "sandbox-bench:tiers";

function subscribe(onChange: () => void) {
  // Back and forward restore the URL; follow it.
  const onPop = () => {
    show(new URLSearchParams(window.location.search).get(tierParam) === allTiersValue ? "all" : "one");
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("popstate", onPop);
  };
}

const current = (): TierView => (document.getElementById(tierStyle.id) ? "all" : "one");

function show(view: TierView) {
  const existing = document.getElementById(tierStyle.id);
  if (view === "one") existing?.remove();
  else if (!existing) {
    const style = document.createElement("style");
    style.id = tierStyle.id;
    document.head.appendChild(style);
  }
}

/** The link without scripts: the bare page or `?tiers=all`. With scripts, select keeps the other parameters, such as `?track=`. */
const hrefFor = (view: TierView) => (view === "all" ? `?${tierParam}=${allTiersValue}` : "./");

function select(event: MouseEvent<HTMLAnchorElement>, view: TierView) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  const url = new URL(window.location.href);
  if (view === "all") url.searchParams.set(tierParam, allTiersValue);
  else url.searchParams.delete(tierParam);
  show(view);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(EVENT));
}

const Segment = themePart("a", "toggle-group", "control", "ui-button");

/**
 * Shows each provider once, on the tier a new account gets, or every CPU tier
 * a provider sells as its own row. Plain links underneath, like the machine switch.
 */
export function TierSwitch() {
  const active = useSyncExternalStore(subscribe, current, (): TierView => "one");
  return (
    <nav aria-label="CPU tiers shown" data-tier-switch="" className="w-full sm:w-fit">
      <ul className="surface flex w-full gap-xxs p-xxs sm:w-fit">
        {tierViews.map((view) => {
          const on = view === active;
          return (
            <li key={view} className="flex-1 sm:flex-none">
              <Segment
                href={hrefFor(view)}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => select(event, view)}
                aria-current={on ? "true" : undefined}
                data-pressed={on ? "" : undefined}
                className={`w-full ${on ? "" : "text-neutral-7"}`}
              >
                <span className="sm:hidden">{tierViewInfo[view].short}</span>
                <span className="hidden sm:inline">{tierViewInfo[view].label}</span>
              </Segment>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
