import { trackIds, tracks } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

export const site = "https://aisandboxbench.com";

/**
 * Providers with a page at /providers/<id>/, in the order they shipped. Pages
 * roll out a few at a time, and only for providers with published results on
 * the live site.
 */
export const providerPages = ["e2b", "daytona"] as const satisfies readonly ProviderId[];
export type ProviderPageId = (typeof providerPages)[number];
export const isProviderPage = (id: string): id is ProviderPageId => (providerPages as readonly string[]).includes(id);

export type ProviderPath = `/providers/${ProviderPageId}/`;
export const providerPath = (id: ProviderPageId): ProviderPath => `/providers/${id}/`;

/** Every public page. Adding a provider page without a content date below fails to compile. */
export type SitePath = "/" | "/results.md" | "/llms.txt" | ProviderPath;

/**
 * The last day each page's own words or layout changed (yyyy-mm-dd, from git).
 * Bump the date in the same commit that changes the page. Data changes are
 * picked up on their own: see lastModified.
 */
const contentDates = {
  "/": "2026-10-26",
  "/results.md": "2026-10-26",
  "/llms.txt": "2026-10-28",
  "/providers/e2b/": "2026-10-28",
  "/providers/daytona/": "2026-10-28",
} as const satisfies Record<SitePath, string>;

/** When the published results last changed: the end of the newest run window across both tracks. */
export const dataDate = trackIds
  .map((id) => tracks[id].window.end)
  .reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
  .slice(0, 10);

/** A page changes when its content does or when the results it renders do, whichever came last. */
export const lastModified = (path: SitePath) => {
  const own = contentDates[path];
  return own > dataDate ? own : dataDate;
};

/** Every public page, for the sitemap. results.json is left out: it is data for scripts, not a page to rank. */
export const sitePaths: readonly SitePath[] = ["/", ...providerPages.map(providerPath), "/results.md", "/llms.txt"];
