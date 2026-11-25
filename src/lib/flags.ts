import { defineFlag } from "@databuddy/sdk";

/** The home page's private benchmarks link copy, A/B tested in Databuddy (multivariant flag `private-cta-copy`). */
export const privateCtaCopy = defineFlag("private-cta-copy", { default: "control" });

export const privateCtaLabels = {
  control: "What's included, and get in touch",
  direct: "Get a private benchmark",
} as const;

/** The label for a served variant; an unknown or missing variant gets the control copy. */
export function privateCtaLabel(variant: string | undefined): string {
  return variant === "direct" ? privateCtaLabels.direct : privateCtaLabels.control;
}
