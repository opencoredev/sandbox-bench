"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { NavigationMenu, Popover } from "@graphical";
import { themePart } from "@graphical/components/library/component-theme";

import { useScrollFade } from "@/components/tabs";

/** id, label, and optionally the tab a click opens (`#id/tab`). */
type Sections = readonly (readonly [id: string, label: string, tab?: string])[];

const hrefOf = ([id, , tab]: Sections[number]) => (tab ? `#${id}/${tab}` : `#${id}`);

/** The same hash again fires no hashchange, so scroll to the section by hand. */
const rescroll = (entry: Sections[number]) => {
  if (window.location.hash === hrefOf(entry)) document.getElementById(entry[0])?.scrollIntoView();
};

/** The section whose top has passed a line a third of the way down the screen, or the last one at the bottom of the page. */
function useCurrentSection(sections: Sections) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      // A third of the way down the screen: a section counts once its heading is well into view.
      const line = Math.max(140, window.innerHeight * 0.33);
      let found: string | null = null;
      for (const [id] of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) found = id;
      }
      // At the bottom the last section may never reach the line; it is the one in view.
      const bottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setCurrent(bottom ? (sections.at(-1)?.[0] ?? found) : found);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);
  return current;
}

/**
 * The wide-screen navbar: every section in one bar, as on Artificial
 * Analysis, the one you are in lit.
 */
export function SectionLinks({ sections }: { sections: Sections }) {
  const current = useCurrentSection(sections);
  const scroller = useScrollFade<HTMLUListElement>();
  return (
    <NavigationMenu.Root aria-label="Sections" className="min-w-0">
      <NavigationMenu.List ref={scroller} className="surface scroll-fade max-w-full overflow-x-auto p-xxs [scrollbar-width:none]">
        {sections.map((entry) => {
          const [id, label] = entry;
          return (
            <NavigationMenu.Item key={id}>
              <NavigationMenu.Link href={hrefOf(entry)} active={id === current} onClick={() => rescroll(entry)} className="whitespace-nowrap">
                {label}
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}

// The navigation menu's link part on its own: a popover has no navigation menu root for Base UI's links to join.
const MenuLink = themePart("a", "navigation-menu", "link", "ui-option ui-link");

/**
 * Section navigation for narrower screens: one button naming the current
 * section that opens every section, so nothing hides off the edge.
 */
export function SectionMenu({
  sections,
  menuTop,
}: {
  sections: Sections;
  /** Shown above the links in the menu, such as the track switch. */
  menuTop?: ReactNode;
}) {
  const current = useCurrentSection(sections);
  const [open, setOpen] = useState(false);
  const currentLabel = sections.find(([id]) => id === current)?.[1] ?? "Sections";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="max-w-full min-w-0 shrink bg-neutral-2">
        <span className="min-w-0 truncate">{currentLabel}</span>
        <ChevronDown aria-hidden className={`shrink-0 text-neutral-7 transition-transform duration-[var(--motion-duration)] ease-[var(--motion-easing)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        <span className="sr-only">, open the section menu</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16} className="z-40">
          <Popover.Popup className="w-[min(calc(100vw-2*var(--space-m)),26rem)]">
            {menuTop ? <div className="mb-s">{menuTop}</div> : null}
            <nav aria-label="Sections">
              <ul className="grid grid-cols-2 gap-xxs">
                {sections.map((entry) => {
                  const [id, label] = entry;
                  const active = id === current;
                  return (
                    <li key={id}>
                      <MenuLink
                        href={hrefOf(entry)}
                        aria-current={active ? "location" : undefined}
                        data-active={active ? "" : undefined}
                        onClick={() => {
                          setOpen(false);
                          rescroll(entry);
                        }}
                        className="justify-start"
                      >
                        {label}
                      </MenuLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
