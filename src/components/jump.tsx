"use client";

import type { ReactNode } from "react";

export interface TabRequest {
  section: string;
  tab: string;
}

/** `#state/create-from-snapshot`: a section and one of its tabs, so a shared or reloaded link opens the same tab. */
export const tabHash = ({ section, tab }: TabRequest) => `#${section}/${tab}`;

/** Reads a tab hash, or null for a plain `#section` or no hash. */
export function parseTabHash(hash: string): TabRequest | null {
  const match = /^#([\w-]+)\/([\w-]+)$/.exec(hash);
  return match?.[1] && match[2] ? { section: match[1], tab: match[2] } : null;
}

/**
 * A link to a section that opens one of its tabs. The hash names both; the
 * section's TabCard picks the tab and scrolls to the section, on click,
 * reload or a shared link.
 */
export function JumpLink({ section, tab, className, children }: TabRequest & { className?: string; children: ReactNode }) {
  const href = tabHash({ section, tab });
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // A modified or middle click opens a new tab or window; leave this page where it is.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        // The same hash again fires no hashchange, so send one: the section's TabCard reopens the tab
        // (it may have been switched since) and scrolls to it.
        if (window.location.hash === href) window.dispatchEvent(new HashChangeEvent("hashchange"));
      }}
    >
      {children}
    </a>
  );
}
