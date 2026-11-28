import { trackIds, tracks } from "@/lib/data";
import { providerPages, providerPath, providersPath } from "@/lib/provider-pages";
import type { ProviderPageId, ProviderPath } from "@/lib/provider-pages";
import type { ProviderId } from "@/lib/providers";
import { updates } from "@/lib/updates";
import type { UpdateSlug } from "@/lib/updates";

export const site = "https://aisandboxbench.com";

// Provider pages live in lib/provider-pages.ts, which client components can import without the benchmark data.
export { isProviderPage, providerPageOf, providerPages, providerPath, providersPath } from "@/lib/provider-pages";
export type { ProviderPageId, ProviderPath } from "@/lib/provider-pages";
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

/**
 * Providers with a page at /alternatives/<id>/: every other tested provider,
 * measured against this one. Only for providers people search alternatives to.
 */
export const alternativesPages = ["e2b"] as const satisfies readonly ProviderPageId[];
export type AlternativesPageId = (typeof alternativesPages)[number];
export const isAlternativesPage = (id: string): id is AlternativesPageId => (alternativesPages as readonly string[]).includes(id);

export type AlternativesPath = `/alternatives/${AlternativesPageId}/`;
export const alternativesPath = (id: AlternativesPageId): AlternativesPath => `/alternatives/${id}/`;

/** The index of every update, newest first. */
export const updatesPath = "/updates/";

/** One page per update in src/lib/updates.ts. */
export type UpdatePath = `/updates/${UpdateSlug}/`;
export const updatePath = (slug: UpdateSlug): UpdatePath => `/updates/${slug}/`;

/** The page where sandbox providers read about private benchmarks and get in touch. Outside /providers/, where every page is one provider's results. */
export const forProvidersPath = "/for-providers/";

/** Every public page. Adding a provider, comparison, alternatives or update page without a content date below fails to compile. */
export type SitePath = "/" | typeof providersPath | typeof forProvidersPath | ProviderPath | ComparePath | AlternativesPath | typeof updatesPath | UpdatePath;

/**
 * The last day each page's own words or layout changed (yyyy-mm-dd, from git).
 * Bump the date in the same commit that changes the page. Data changes are
 * picked up on their own: see lastModified.
 */
const contentDates = {
  "/": "2026-11-26",
  "/providers/e2b/": "2026-11-20",
  "/providers/": "2026-11-26",
  "/providers/daytona/": "2026-11-20",
  "/providers/superserve/": "2026-11-20",
  "/providers/upstash/": "2026-11-20",
  "/providers/upstash-ephemeral/": "2026-11-20",
  "/providers/boat/": "2026-11-20",
  "/providers/freestyle/": "2026-11-20",
  "/providers/tenki/": "2026-11-20",
  "/providers/baseten/": "2026-11-20",
  "/providers/instabox/": "2026-11-20",
  "/providers/beam/": "2026-11-20",
  "/providers/modal/": "2026-11-23",
  "/providers/maritime/": "2026-11-24",
  "/providers/buddy/": "2026-11-25",
  "/providers/microsandbox/": "2026-11-25",
  "/providers/archil/": "2026-11-26",
  "/compare/e2b-vs-daytona/": "2026-11-18",
  "/compare/upstash-box-vs-e2b/": "2026-11-18",
  "/compare/upstash-box-vs-daytona/": "2026-11-18",
  "/alternatives/e2b/": "2026-11-18",
  "/for-providers/": "2026-11-19",
  "/updates/": "2026-11-26",
  "/updates/every-provider-on-real-tasks/": "2026-11-19",
  "/updates/beam-added/": "2026-11-19",
  "/updates/real-tasks-timed/": "2026-11-19",
  "/updates/instabox-added/": "2026-11-19",
  "/updates/real-tasks-at-once/": "2026-11-19",
  "/updates/beam-cpu-tiers/": "2026-11-20",
  "/updates/maritime-added/": "2026-11-24",
  "/updates/like-for-like-checks/": "2026-11-24",
  "/updates/buddy-added/": "2026-11-25",
  "/updates/microsandbox-added/": "2026-11-25",
  "/updates/archil-added/": "2026-11-26",
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
  ...alternativesPages.map(alternativesPath),
  updatesPath,
  ...updates.map((u) => updatePath(u.slug)),
  forProvidersPath,
];
