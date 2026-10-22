"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useScrollFade } from "@/components/tabs";

type Sections = readonly (readonly [id: string, label: string])[];

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
 * The section row of the wide-screen header: plain links, the current one
 * lit with an underline that grows in, as on Artificial Analysis.
 */
export function SectionLinks({ sections }: { sections: Sections }) {
  const current = useCurrentSection(sections);
  const scroller = useScrollFade<HTMLElement>();
  return (
    <nav ref={scroller} aria-label="Sections" className="scroll-fade -mx-3 min-w-0 overflow-x-auto [scrollbar-width:none]">
      <ul className="flex w-max">
        {sections.map(([id, label]) => {
          const active = id === current;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active ? "location" : undefined}
                className={`relative flex h-10 items-center px-3 text-[13px] whitespace-nowrap transition-colors duration-150 outline-none focus-visible:text-[var(--foreground)] focus-visible:underline motion-reduce:transition-none ${
                  active ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
                <span
                  aria-hidden
                  className={`absolute inset-x-3 -bottom-px h-0.5 origin-left bg-[var(--brand)] transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${
                    active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
                  }`}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Section navigation for narrower screens: one button naming the current
 * section that opens a full-width menu, so nothing hides off the edge.
 */
export function SectionMenu({
  sections,
  extra,
  menuTop,
}: {
  sections: Sections;
  extra?: { href: string; label: string };
  /** Shown above the links in the menu, such as the track switch. */
  menuTop?: ReactNode;
}) {
  const current = useCurrentSection(sections);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const currentLabel = sections.find(([id]) => id === current)?.[1] ?? "Sections";

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const outside = !(event.target instanceof Node && menu.current?.contains(event.target));
      if (event instanceof KeyboardEvent ? event.key === "Escape" : outside) {
        setOpen(false);
        if (event instanceof KeyboardEvent) button.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  return (
    <div ref={menu} className="ml-auto">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--band)] px-4 text-[13.5px] font-medium"
      >
        <span className="max-w-[11rem] truncate">{currentLabel}</span>
        <span aria-hidden className={`text-[var(--muted)] transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
        <span className="sr-only">, open the section menu</span>
      </button>
      {open ? (
        <div id={panel} className="absolute inset-x-0 top-full border-b border-[var(--line)] bg-[var(--background)] px-4 pt-2 pb-4 shadow-[0_16px_32px_rgb(0_0_0/0.6)] sm:px-6">
          {menuTop ? <div className="mb-3">{menuTop}</div> : null}
          <nav aria-label="Sections">
            <ul className="grid grid-cols-2 gap-1">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={() => setOpen(false)}
                    aria-current={id === current ? "location" : undefined}
                    className={`flex h-11 items-center gap-2 rounded-lg px-3 text-[14.5px] ${
                      id === current ? "bg-[var(--chip)] font-medium" : "text-[var(--muted)] active:bg-[var(--band)]"
                    }`}
                  >
                    {id === current ? <span aria-hidden className="size-1.5 shrink-0 bg-[var(--brand)]" /> : null}
                    {label}
                  </a>
                </li>
              ))}
              {extra ? (
                <li>
                  <a href={extra.href} onClick={() => setOpen(false)} className="flex h-11 items-center rounded-lg px-3 text-[14.5px] text-[var(--muted)] active:bg-[var(--band)]">
                    {extra.label}
                  </a>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
