import type { Metadata } from "next";

import { openGraphImages, twitterImages } from "@/lib/seo/social";

export const siteTitle = "Sandbox bench: cloud sandboxes for agents, measured";
export const siteDescription =
  "8 cloud sandbox providers for AI agents (E2B, Daytona, Upstash Box and Ephemeral Box, Boat, boxd, Freestyle, Tenki, Superserve) timed on cold start, real agent tasks, bursts, reliability and cost, on each default machine and on the same 4 vCPU, 8 GB machine.";

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
