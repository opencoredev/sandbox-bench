import { trackIds, trackInfo, tracks } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * Runs a provider's export set aside as our-side failures and reran, said in
 * one sentence beside its results and in full in the agent files. Every number
 * comes from the harness's exclusions block (src/data/benchmark.<track>.json).
 */

/** Each track's superseded entries for a provider, with the iteration count. */
export function setAside(id: ProviderId) {
  return trackIds.flatMap((track) =>
    (tracks[track].exclusions[id]?.superseded ?? []).map((s) => ({ track, ...s, runs: s.iterations.length })),
  );
}

/** "Modal's 200-deployed-App limit (one App per iteration) refused the App lookup, so no create reached Modal": the cause, without the journal detail. */
const cause = (reason: string) =>
  reason
    .replace(/^Our side:\s*/, "")
    .split(/\.\s/)[0]
    ?.replace(/\s*\(journal[^)]*\)/, "")
    .trim() ?? reason;

/** "88–99": iterations as ranges. */
export function iterationRanges(iterations: readonly number[]) {
  const sorted = [...iterations].sort((a, b) => a - b);
  const out: string[] = [];
  let start = sorted[0];
  let prev = start;
  for (const n of [...sorted.slice(1), Number.NaN]) {
    if (start === undefined || prev === undefined) break;
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return out.join(", ");
}

/**
 * "23 Modal main-suite runs (12 default, 11 same machine) were set aside as
 * our-side failures and rerun: Modal's 200-deployed-App limit … refused the App
 * lookup, so no create reached Modal." Null when nothing was set aside.
 */
export function setAsideSentence(id: ProviderId) {
  const entries = setAside(id);
  if (entries.length === 0) return null;
  const total = entries.reduce((n, e) => n + e.runs, 0);
  const byTrack = trackIds.flatMap((t: TrackId) => {
    const n = entries.filter((e) => e.track === t).reduce((s, e) => s + e.runs, 0);
    return n ? [`${n} ${t === "default" ? "default" : "same machine"}`] : [];
  });
  const suites = [...new Set(entries.map((e) => e.suite))].join(" and ");
  const causes = [...new Set(entries.map((e) => cause(e.reason)))].join("; ");
  return `${total} ${providerName(id)} ${suites}-suite runs (${byTrack.join(", ")}) were set aside as our-side failures and rerun: ${causes}.`;
}

/** Every provider with something set aside, in the agent files' words: one line per track entry. */
export function setAsideLines(id: ProviderId) {
  return setAside(id).map(
    (e) =>
      `${trackInfo[e.track].label}: ${providerName(id)} ${e.suite} suite, iterations ${iterationRanges(e.iterations)} of ${e.sourceRunId} set aside (${e.runs} runs) and rerun in ${e.rerunSourceRunIds.join(", ")}. ${e.reason}`,
  );
}
