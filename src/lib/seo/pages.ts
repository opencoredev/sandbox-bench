import { trackIds, tracks } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

export const site = "https://aisandboxbench.com";

/**
 * Providers with a page at /providers/<id>/, in the order they shipped. Pages
 * roll out a few at a time, and only for providers with published results on
 * the live site.
 */
export const providerPages = ["e2b", "daytona", "superserve", "upstash", "upstash-ephemeral", "boat", "freestyle"] as const satisfies readonly ProviderId[];
export type ProviderPageId = (typeof providerPages)[number];
export const isProviderPage = (id: string): id is ProviderPageId => (providerPages as readonly string[]).includes(id);

/** The index of every provider page. */
export const providersPath = "/providers/";

export type ProviderPath = `/providers/${ProviderPageId}/`;
export const providerPath = (id: ProviderPageId): ProviderPath => `/providers/${id}/`;

/**
 * Pairs with a page at /compare/<a>-vs-<b>/. Only pairs people search for, and
 * only when both have published results on the same track.
 */
export const comparePages = [
  { slug: "e2b-vs-daytona", a: "e2b", b: "daytona" },
  { slug: "upstash-box-vs-e2b", a: "upstash", b: "e2b" },
  { slug: "upstash-box-vs-daytona", a: "upstash", b: "daytona" },
] as const satisfies readonly { slug: string; a: ProviderId; b: ProviderId }[];
export type ComparePage = (typeof comparePages)[number];
export type CompareSlug = ComparePage["slug"];
export const comparePage = (slug: string): ComparePage | null => comparePages.find((p) => p.slug === slug) ?? null;

export type ComparePath = `/compare/${CompareSlug}/`;
export const comparePath = (slug: CompareSlug): ComparePath => `/compare/${slug}/`;

/** Comparison pages that include one provider, for its page's links. */
export const comparisonsWith = (id: ProviderId) => comparePages.filter((p) => p.a === id || p.b === id);

/** Every public page. Adding a provider or comparison page without a content date below fails to compile. */
export type SitePath = "/" | typeof providersPath | ProviderPath | ComparePath;

/**
 * The last day each page's own words or layout changed (yyyy-mm-dd, from git).
 * Bump the date in the same commit that changes the page. Data changes are
 * picked up on their own: see lastModified.
 */
const contentDates = {
  "/": "2026-10-26",
  "/providers/e2b/": "2026-10-31",
  "/providers/": "2026-11-01",
  "/providers/daytona/": "2026-10-31",
  "/providers/superserve/": "2026-10-31",
  "/providers/upstash/": "2026-10-31",
  "/providers/upstash-ephemeral/": "2026-10-31",
  "/providers/boat/": "2026-10-31",
  "/providers/freestyle/": "2026-11-01",
  "/compare/e2b-vs-daytona/": "2026-10-30",
  "/compare/upstash-box-vs-e2b/": "2026-10-30",
  "/compare/upstash-box-vs-daytona/": "2026-10-30",
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

/** Every public page, for the sitemap. results.json, results.md and llms.txt are left out: they are data for scripts and agents, not pages to rank. */
export const sitePaths: readonly SitePath[] = [
  "/",
  providersPath,
  ...providerPages.map(providerPath),
  ...comparePages.map((p) => comparePath(p.slug)),
];
