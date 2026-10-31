import type { Metadata } from "next";

type OpenGraphImages = NonNullable<Metadata["openGraph"]>["images"];
type TwitterImages = NonNullable<Metadata["twitter"]>["images"];

const alt = "Sandbox bench: cloud sandboxes for AI agents, measured";

/**
 * The site's own card for SEO pages. A page that sets openGraph gets no image
 * from the root segment, so each one passes these. The trailing slash matters:
 * with trailingSlash on, /opengraph-image answers 308 before the PNG, and some
 * card scrapers don't follow redirects.
 */
export const openGraphImages = [{ url: "/opengraph-image/", type: "image/png", width: 1200, height: 630, alt }] satisfies OpenGraphImages;
export const twitterImages = [{ url: "/twitter-image/", type: "image/png", width: 1200, height: 630, alt }] satisfies TwitterImages;
