import type { Metadata } from "next";

import { trackIds, tracks } from "@/lib/data";
import { providerBrand, providerInfo, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { openGraphImages, twitterImages } from "@/lib/seo/social";

export const siteTitle = "Sandbox bench: cloud sandboxes for agents, measured";

/**
 * "E2B, Daytona, Upstash Box and Ephemeral Box, …": every published provider
 * once, a second product named after its sibling, in page order. Counted the
 * way the facts line counts them, by brand.
 */
export function publishedProviders() {
  const ids = [...new Set(trackIds.flatMap((t) => tracks[t].providers.map((p) => p.id)))];
  const byBrand = new Map<ProviderId, ProviderId[]>();
  for (const id of ids) byBrand.set(providerBrand(id), [...(byBrand.get(providerBrand(id)) ?? []), id]);
  const names = [...byBrand.values()].map(([first, ...rest]) => {
    if (!first) return "";
    const more = rest.map((id) => {
      const info: { name: string; short?: string } = providerInfo[id];
      return info.short ? info.name.replace(`${info.short} `, "") : info.name;
    });
    return [providerName(first), ...more].join(" and ");
  });
  return { count: byBrand.size, names };
}

const published = publishedProviders();
export const siteDescription = `${published.count} cloud sandbox providers for AI agents (${published.names.join(", ")}) timed on cold start, real agent tasks, bursts, reliability and cost, on each default machine and on the same 4 vCPU, 8 GB machine.`;

/** The site-wide cards, set in the root layout. */
export const homeOpenGraph = {
  title: siteTitle,
  description: siteDescription,
  type: "website",
  siteName: "Sandbox bench",
  url: "https://aisandboxbench.com",
} satisfies NonNullable<Metadata["openGraph"]>;
export const homeTwitter = {
  card: "summary_large_image",
  creator: "@leodev",
  title: siteTitle,
  description: siteDescription,
} satisfies NonNullable<Metadata["twitter"]>;

/**
 * The homepage's own metadata: the same cards with the image URLs in their
 * slash form. The root opengraph-image and twitter-image files otherwise give
 * /opengraph-image?<hash>, which answers 308 before the PNG, and a page's
 * openGraph replaces the layout's whole, so the fields are repeated.
 */
export const homeMetadata = {
  openGraph: { ...homeOpenGraph, images: openGraphImages },
  twitter: { ...homeTwitter, images: twitterImages },
} satisfies Metadata;
