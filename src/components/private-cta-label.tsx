"use client";

import { useFlagDetails } from "@databuddy/sdk/react";

import { privateCtaCopy, privateCtaLabel } from "@/lib/flags";

/** The private benchmarks link text, by the visitor's `private-cta-copy` variant; the control copy until flags load. */
export function PrivateCtaLabel() {
  const { variant } = useFlagDetails(privateCtaCopy);
  return privateCtaLabel(variant);
}
