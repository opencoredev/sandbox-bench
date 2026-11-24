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

export const sdkSetup = {
  commit: raw.sdkCommit,
  date: raw.date,
  creates: raw.createsPerProvider,
  ms,
};

export const sdkSetupFor = (track: TrackId, provider: ProviderId): number | undefined =>
  track === "default" ? sdkSetup.ms[provider] : undefined;

/** A provider whose SDK setup figure comes from its own named run, not the shared one at `sdkSetup.commit`. */
export interface SdkSetupRun {
  runId: string;
  sdkCommit: string;
  date: string;
}

/**
 * A `runs` entry may name its run (`runId`); one without names only a commit
 * and date, which the page's run notes already say, so it is left out here.
 */
export function parseSdkSetupRuns(runs: {
  readonly [id: string]: unknown;
}): Partial<Record<ProviderId, SdkSetupRun>> {
  const out: Partial<Record<ProviderId, SdkSetupRun>> = {};
  for (const [id, v] of Object.entries(runs)) {
    if (!isProviderId(id) || typeof v !== "object" || v === null) continue;
    const runId = "runId" in v ? v.runId : undefined;
    if (runId === undefined) continue;
    const sdkCommit = "sdkCommit" in v ? v.sdkCommit : undefined;
    const date = "date" in v ? v.date : undefined;
    if (typeof runId !== "string" || typeof sdkCommit !== "string" || typeof date !== "string")
      throw new Error(`sdk-setup.json: runs.${id} should have string runId, sdkCommit and date`);
    out[id] = { runId, sdkCommit, date };
  }
  return out;
}

export const sdkSetupRuns = parseSdkSetupRuns(raw.runs);

/** Providers with their own SDK setup run, in the data's order. */
export const sdkSetupRunProviders = Object.keys(sdkSetupRuns).filter(isProviderId);

/**
 * Providers whose SDK setup figure comes from their own commit and date but no named run (Baseten,
 * Instabox, Beam), in the data's order: not the shared run at `sdkSetup.commit` either.
 */
export function parseSdkSetupCommits(runs: {
  readonly [id: string]: unknown;
}): { id: ProviderId; sdkCommit: string; date: string }[] {
  const out: { id: ProviderId; sdkCommit: string; date: string }[] = [];
  for (const [id, v] of Object.entries(runs)) {
    if (!isProviderId(id) || typeof v !== "object" || v === null || "runId" in v) continue;
    const sdkCommit = "sdkCommit" in v ? v.sdkCommit : undefined;
    const date = "date" in v ? v.date : undefined;
    if (typeof sdkCommit !== "string" || typeof date !== "string")
      throw new Error(`sdk-setup.json: runs.${id} should have string sdkCommit and date`);
    out.push({ id, sdkCommit, date });
  }
  return out;
}

export const sdkSetupCommits = parseSdkSetupCommits(raw.runs);

/** "run sbx57-mwtux8wi (commit 1f1de78, Nov 23, 2026)". */
export const sdkSetupRunText = (r: SdkSetupRun) =>
  `run ${r.runId} (commit ${r.sdkCommit}, ${r.date})`;
