"use client";

import { useEffect } from "react";

import { captureEvent, viewedSections } from "@/lib/analytics";

/**
 * Sends `section_viewed` once per page load for each tracked home section,
 * when it crosses the middle of the window. Funnels and the methodology goal read it.
 */
export function SectionViews() {
  useEffect(() => {
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const section = viewedSections.find((id) => id === entry.target.id);
          if (!entry.isIntersecting || !section || seen.has(section)) continue;
          seen.add(section);
          observer.unobserve(entry.target);
          captureEvent("section_viewed", { section });
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const id of viewedSections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);
  return null;
}
