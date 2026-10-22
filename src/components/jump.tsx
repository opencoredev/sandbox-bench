"use client";

import type { ReactNode } from "react";

/** Asks the tab card in a section to show one tab. TabCard listens for it. */
export const TAB_EVENT = "sandbox-bench:tab";

export interface TabRequest {
  section: string;
  tab: string;
}

/** Reads a TAB_EVENT, or null for any other event. */
export function tabRequest(event: Event): TabRequest | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  if (typeof detail !== "object" || detail === null || !("section" in detail) || !("tab" in detail)) return null;
  const { section, tab } = detail;
  return typeof section === "string" && typeof tab === "string" ? { section, tab } : null;
}

/**
 * A link to a section that also opens one of its tabs. The browser scrolls
 * to the section as for any anchor; the event picks the tab first.
 */
export function JumpLink({ section, tab, className, children }: TabRequest & { className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${section}`}
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent<TabRequest>(TAB_EVENT, { detail: { section, tab } }))}
    >
      {children}
    </a>
  );
}
