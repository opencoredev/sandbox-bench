"use client";

import type { ReactNode } from "react";

import { Collapsible, ThemedIcon } from "@graphical";

/**
 * A summary that opens to more, on the theme's Collapsible: a full-width
 * trigger with a right chevron, then the panel. Closed panels stay in the page
 * (hidden until found), so find in page and crawlers still see them.
 */
export function Disclosure({
  summary,
  children,
  className = "",
  triggerClassName = "",
  panelClassName = "",
  indicatorClassName = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  indicatorClassName?: string;
}) {
  return (
    <Collapsible.Root className={className}>
      <Collapsible.Trigger className={`whitespace-normal ${triggerClassName}`}>
        {summary}
        <Collapsible.Indicator className={`text-neutral-7 ${indicatorClassName}`}>
          <ThemedIcon name="chevronRight" semantic />
        </Collapsible.Indicator>
      </Collapsible.Trigger>
      <Collapsible.Panel hiddenUntilFound className={panelClassName}>
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
