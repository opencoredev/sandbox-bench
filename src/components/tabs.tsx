"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Tabs } from "@graphical";

import { parseTabHash } from "@/components/jump";

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

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
 * Untitled theme's Tabs. Panels stay mounted so every chart is in the static
 * page; arrow keys, Home and End move between tabs.
 */
export function TabCard({ tabs, label, section }: { tabs: readonly Tab[]; label: string; /** The section id a `#section/tab` hash names to open one of these tabs. */ section?: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  useEffect(() => {
    if (!section) return;
    const open = () => {
      const request = parseTabHash(window.location.hash);
      if (request?.section !== section || !tabs.some((t) => t.id === request.tab)) return;
      setActive(request.tab);
      // No element has the combined id, so the browser does not scroll; do it here.
      document.getElementById(section)?.scrollIntoView();
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [section, tabs]);
  const scroller = useScrollFade<HTMLDivElement>();
  return (
    <Tabs.Root value={active} onValueChange={(value) => setActive(String(value))} className="surface">
      <div className="px-m pt-xs sm:px-l">
        <Tabs.List
          ref={scroller}
          activateOnFocus
          aria-label={label}
          // Phones wrap the tabs onto more lines so every one is visible; wider screens scroll with a fade.
          className="scroll-fade flex-wrap gap-x-l gap-y-0 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none]"
        >
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id} className="shrink-0 whitespace-nowrap">
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </div>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.id} value={tab.id} keepMounted className="mt-0 rounded-b-m p-m sm:p-l">
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

/** The same card without tabs. */
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`surface p-m sm:p-l ${className}`}>{children}</div>
);
