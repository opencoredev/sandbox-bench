/** Where a call to action leads. */
export type Cta = "private_benchmarks" | "contact_jump" | "github" | "data_download";

/** Where on the site the call to action sits. */
export type CtaPlacement = "home_section" | "home_hero" | "home_footer" | "home_method" | "provider_page" | "page_footer" | "for_providers_hero";

/**
 * Attributes that make the Databuddy tracker send `cta_clicked` with `cta` and
 * `placement` when the element is clicked (DatabuddyProvider turns on
 * attribute autocapture). The tracker sends every `data-*` attribute on the
 * element, so put these on elements with no other data attributes.
 */
export const ctaAttributes = ({ cta, placement }: { cta: Cta; placement: CtaPlacement }) =>
  ({ "data-track": "cta_clicked", "data-cta": cta, "data-placement": placement }) as const;
