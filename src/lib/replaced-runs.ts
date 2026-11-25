import type { TrackId } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

/**
 * Runs we replaced with a rerun before publishing, whose attempts are not in
 * the published counts. The harness's structured exclusions (lib/exclusions.ts)
 * cover iterations superseded inside a run; a whole run replaced before the
 * merge leaves no trace in the export, so its provider-side errors are listed
 * here by hand, from the replaced run's own results and in the same words as
 * the track's sourceNotes and the provider's update. Reliability answers and
 * the agent files read this, so a published success rate never reads as
 * "nothing ever failed" when an earlier run did.
 */
export interface ReplacedRun {
  /** Which run, in a few words: "its first bursts (Nov 25, 01:32 UTC)". */
  run: string;
  /** What failed in it, provider-side errors included. */
  failed: string;
  /** Why it was replaced and what replaced it. */
  replacedBy: string;
}

export const replacedRuns: Partial<Record<ProviderId, Partial<Record<TrackId, readonly ReplacedRun[]>>>> = {
  e2b: {
    "same-spec": [
      {
        run: "its first bursts of 10",
        failed: "two creates in one burst timed out on E2B's side",
        replacedBy: "rerun on Nov 18 on the same SDK commit",
      },
    ],
  },
  maritime: {
    default: [
      {
        run: "its first bursts, run back to back",
        failed: "Maritime refused the creates past its create rate (30 a minute per API key) with HTTP 429, and one create's first command found Maritime's service unreachable",
        replacedBy: "rerun on Nov 24 with each burst started a minute apart",
      },
    ],
    "same-spec": [
      {
        run: "its first main run",
        failed: "Maritime refused its first 27 creates with HTTP 429; 3 creates' first commands found Maritime's service unreachable and one pause got no response",
        replacedBy: "rerun on Nov 24 on the same SDK commit, started 70 s after the default machine's bursts",
      },
      {
        run: "its first bursts, run back to back",
        failed: "Maritime refused the creates past its create rate (30 a minute per API key) with HTTP 429, and one create's first command found Maritime's service unreachable",
        replacedBy: "rerun on Nov 24 with each burst started a minute apart",
      },
    ],
  },
  buddy: {
    default: [
      {
        run: "its first bursts (Nov 25, 01:32 UTC)",
        failed: "10 creates in its bursts of 10 failed: Buddy answered one status check with HTTP 429 (its limit is 5,000 API requests an hour per route), and 9 failed with a provider request error, their sandboxes' ownership unverified",
        replacedBy: "rerun at 02:01 UTC, after the hour turned",
      },
    ],
    "same-spec": [
      {
        run: "its first main run of 100 (Nov 25)",
        failed: "Buddy answered a status check (GET /sandboxes/{id}) on its 98th create with HTTP 429, and one preview's new hostname didn't resolve yet (3 DNS lookup failures on its retries)",
        replacedBy: "rerun as two halves of 50 in separate UTC hours (04:00 and 07:19 UTC)",
      },
      {
        run: "its first snapshot run (Nov 25)",
        failed:
          "our harness restored 6 snapshots at Buddy's default 2x4 size instead of 4x8, since fixed in harness commit 5afd423; Buddy also answered 12 status checks with HTTP 429, and one snapshot's cleanup couldn't be verified",
        replacedBy: "rerun at 08:00 UTC on harness commit 5afd423",
      },
    ],
  },
};

export const replacedFor = (id: ProviderId, track: TrackId): readonly ReplacedRun[] => replacedRuns[id]?.[track] ?? [];

/** "its first bursts (Nov 25, 01:32 UTC), where …, rerun at 02:01 UTC": one replaced run in a clause. */
export const replacedRunText = (r: ReplacedRun) => `${r.run}, where ${r.failed}; ${r.replacedBy}`;

/**
 * One sentence naming a provider's replaced runs on a track, or null with none:
 * "Not in these counts: runs we replaced, whose failures aren't counted: …".
 */
export function replacedSentence(id: ProviderId, track: TrackId): string | null {
  const runs = replacedFor(id, track);
  if (runs.length === 0) return null;
  const list = runs.map(replacedRunText).join("; and ");
  return `Not in these counts, because we replaced ${runs.length === 1 ? "the run" : "the runs"} and ${runs.length === 1 ? "its" : "their"} failures aren't counted: ${list}.`;
}
