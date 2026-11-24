"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Tabs } from "@graphical";

import { parseTabHash } from "@/components/jump";

/** The hash each section last scrolled to, shared by the cards of both tracks. */
const scrolledFor = new Map<string, string>();

/** A tab with a panel, or one shown greyed out with why it has none, such as a location not measured yet. */
export type Tab = { id: string; label: string; content: ReactNode } | { id: string; label: string; unavailable: string };

const isOpenable = (tab: Tab): tab is Extract<Tab, { content: ReactNode }> => "content" in tab;

/**
 * Marks a horizontal scroller with `data-fade-start` and `data-fade-end`
 * while content is hidden past either edge; the `scroll-fade` utility turns
 * those into a fading mask. Attributes, not state, so scrolling never re-renders.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const end = el.scrollWidth - el.clientWidth;
      el.toggleAttribute("data-fade-start", el.scrollLeft > 1);
      el.toggleAttribute("data-fade-end", el.scrollLeft < end - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return ref;
}

/**
 * A card with its tabs along the top, as on Artificial Analysis, built on the
 * Untitled theme's Tabs. Every tab's panel is in the page, but a panel's
 * chart is drawn only once its tab opens, from the page's data, so the HTML
 * carries the first chart of each card; arrow keys, Home and End move between tabs.
 */
export function TabCard({ tabs, label, section }: { tabs: readonly Tab[]; label: string; /** The section id a `#section/tab` hash names to open one of these tabs. */ section?: string }) {
  const openable = tabs.filter(isOpenable);
  const [active, setActive] = useState(openable[0]?.id);
  // Panels are built the first time they open and kept after, so the HTML holds the first tab's chart only.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(active === undefined ? [] : [active]));
  const openTab = (id: string) => {
    setActive(id);
    setOpened((seen) => (seen.has(id) ? seen : new Set([...seen, id])));
  };
  const scroller = useScrollFade<HTMLDivElement>();
  // The ids as one string, so a re-render that builds a new but equal tab list doesn't replay the hash.
  const openableIds = openable.map((t) => t.id).join("\n");
  useEffect(() => {
    if (!section) return;
    const ids = openableIds.split("\n");
    const open = (event?: HashChangeEvent) => {
      const request = parseTabHash(window.location.hash);
      if (request?.section !== section || !ids.includes(request.tab)) return;
      setActive(request.tab);
      setOpened((seen) => (seen.has(request.tab) ? seen : new Set([...seen, request.tab])));
      // No element has the combined id, so the browser does not scroll; do it here: on every hash change,
      // but on mount only once per section and hash, so a card built later (the other track) opens the
      // same tab without pulling the page back to it. Only a card on screen scrolls or claims the hash: on a
      // ?track= link the hidden track's card mounts first, and the visible one, built later, scrolls.
      if (!scroller.current?.getClientRects().length) return;
      if (event || scrolledFor.get(section) !== window.location.hash) document.getElementById(section)?.scrollIntoView();
      scrolledFor.set(section, window.location.hash);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [section, openableIds]);
  return (
    <Tabs.Root value={active} onValueChange={(value) => openTab(String(value))} className="surface">
      <div className="px-m pt-xs sm:px-l">
        <Tabs.List
          ref={scroller}
          activateOnFocus
          aria-label={label}
          // Phones wrap the tabs onto more lines so every one is visible; wider screens scroll with a fade.
          className="scroll-fade flex-wrap gap-x-m gap-y-0 sm:flex-nowrap sm:gap-x-l sm:overflow-x-auto sm:[scrollbar-width:none]"
        >
          {tabs.map((tab) =>
            isOpenable(tab) ? (
              <Tabs.Tab key={tab.id} value={tab.id} className="shrink-0 whitespace-nowrap">
                {tab.label}
              </Tabs.Tab>
            ) : (
              <Tabs.Tab key={tab.id} value={tab.id} disabled title={tab.unavailable} className="shrink-0 cursor-not-allowed whitespace-nowrap opacity-50">
                {tab.label} <span className="ml-1 text-xxs text-neutral-7">{tab.unavailable}</span>
              </Tabs.Tab>
            ),
          )}
        </Tabs.List>
      </div>
      {openable.map((tab) => (
        <Tabs.Panel key={tab.id} value={tab.id} keepMounted className="mt-0 rounded-b-m p-m sm:p-l">
          {opened.has(tab.id) ? tab.content : null}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

/** The same card without tabs. */
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`surface p-m sm:p-l ${className}`}>{children}</div>
);
