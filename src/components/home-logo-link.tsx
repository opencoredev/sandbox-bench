"use client";

import type { MouseEvent, ReactNode } from "react";

/**
 * The home page's logo: back to the very top of the page. The `#top` anchor
 * sits above the sticky header, so without scripts the jump lands at y = 0;
 * with them, a click scrolls there (smoothly unless the reader asked for less
 * motion) and drops any hash from the URL, so it works again on every click,
 * however far the page has scrolled since.
 */
export function HomeLogoLink({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click (new tab, new window) keeps the browser's own behaviour.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    if (window.location.hash) window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  };
  return (
    <a href="#top" className={className} aria-label={label} onClick={onClick}>
      {children}
    </a>
  );
}
