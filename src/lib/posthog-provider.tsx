"use client";

import { useEffect } from "react";

import { posthogConfig, posthogKey } from "@/lib/posthog";

/**
 * Starts PostHog after hydration. The import is dynamic so the SDK stays out of
 * the first paint, and `next dev` sends nothing.
 */
export function PostHogProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    void import("posthog-js").then(({ default: posthog }) => {
      if (!posthog.__loaded) posthog.init(posthogKey, posthogConfig);
    });
  }, []);
  return null;
}
