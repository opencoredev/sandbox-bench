import type { ProviderId } from "@/lib/providers";

/**
 * Providers with a page at /providers/<id>/, in the order they shipped. Pages
 * roll out a few at a time, and only for providers with published results on
 * the live site.
 *
 * Kept apart from lib/seo/pages.ts, which reads the benchmark data, so client
 * components (the score table, the trace panel) can link a provider to its
 * page without shipping that data to the browser.
 */
export const providerPages = ["e2b", "daytona", "superserve", "upstash", "upstash-ephemeral", "boat", "freestyle", "tenki", "baseten", "instabox", "beam", "modal", "styne"] as const satisfies readonly ProviderId[];
export type ProviderPageId = (typeof providerPages)[number];
export const isProviderPage = (id: string): id is ProviderPageId => (providerPages as readonly string[]).includes(id);

/** The index of every provider page. */
export const providersPath = "/providers/";

export type ProviderPath = `/providers/${ProviderPageId}/`;
export const providerPath = (id: ProviderPageId): ProviderPath => `/providers/${id}/`;

/** A provider's page, or null for a provider without one yet. */
export const providerPageOf = (id: ProviderId): ProviderPath | null => (isProviderPage(id) ? providerPath(id) : null);
