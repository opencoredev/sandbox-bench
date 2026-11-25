"use client";

import { DatabuddyProvider } from "@databuddy/sdk/react";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { databuddyOptions, hasOptedOut } from "@/lib/databuddy";

// The tracker fires this when the visitor opts in or out in this tab; `storage` carries an opt-out from another tab.
const CONSENT_EVENT = "databuddy:consent";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const optedOutInBrowser = () =>
  window.databuddyOptedOut === true || window.databuddyDisabled === true || hasOptedOut({ doNotTrack: navigator.doNotTrack, globalPrivacyControl: navigator.globalPrivacyControl, stored });

/**
 * Databuddy's tracker, replay and flags. The static HTML and the first render
 * load nothing; once hydrated, it loads only for visitors who haven't opted out.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const optedOut = useSyncExternalStore(subscribe, optedOutInBrowser, () => true);
  return <DatabuddyProvider {...databuddyOptions({ nodeEnv: process.env.NODE_ENV, optedOut })}>{children}</DatabuddyProvider>;
}
