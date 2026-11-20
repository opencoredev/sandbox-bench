"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";

import { HoverCard } from "@/components/hover-card";

/**
 * A chart's hover card, rendered only while its column or point is hovered or
 * focused. The page has about 1,800 of them; built up front they made up a
 * third of the home page's weight, so the page ships only their text and
 * builds the one in use. The parent element is the hover and focus target,
 * as with the CSS-shown cards before; the card keeps the chart's own
 * placement and its group-hover and group-focus visibility classes.
 */
export function HoverCardOnDemand(props: ComponentProps<typeof HoverCard>) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const host = anchor.current?.parentElement;
    if (!host) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    const focusIn = () => setFocused(true);
    const focusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node && host.contains(event.relatedTarget))) setFocused(false);
    };
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", focusIn);
    host.addEventListener("focusout", focusOut);
    // A column hovered or focused before the page hydrated fired its event before these listeners existed.
    if (host.contains(document.activeElement)) setFocused(true);
    if (host.matches(":hover")) setHovered(true);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", focusIn);
      host.removeEventListener("focusout", focusOut);
    };
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      {hovered || focused ? <HoverCard {...props} /> : null}
    </>
  );
}
