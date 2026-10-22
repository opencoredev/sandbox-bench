import raw from "@/data/sdk-setup.json";
import { isProviderId } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import type { TrackId } from "@/lib/tracks";

/**
 * Our SDK's setup after create, measured on the faster SDK in a separate,
 * smaller run (bench/scripts/sdk-overhead.ts). It is never part of cold start;
 * the waterfall shows it beside the provider's time. Default machines only.
 */
const ms: Partial<Record<ProviderId, number>> = {};
for (const [id, value] of Object.entries(raw.medianMs)) if (isProviderId(id)) ms[id] = value;

export const sdkSetup = { commit: raw.sdkCommit, date: raw.date, creates: raw.createsPerProvider, ms };

export const sdkSetupFor = (track: TrackId, provider: ProviderId): number | undefined => (track === "default" ? sdkSetup.ms[provider] : undefined);
