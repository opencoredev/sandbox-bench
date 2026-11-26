import type { Provider, Track } from "@/lib/data";
import { autoStandby, noRealPause } from "@/lib/notes";

/**
 * What a provider's pause result is, in one place, so the charts, the stat
 * strip and the agent files can't disagree:
 * - split: a pause call and a resume call, timed apart.
 * - total: pause and resume timed only together.
 * - standby: no pause call; the sandbox goes on standby by itself when idle
 *   (Baseten), so only the resume, the first command after standby, is timed.
 *   It is never a pause + resume total, and there is no pause time.
 * - restart: stop and start restarts the sandbox, which is not a pause.
 * - none: no result.
 */
export type PauseResult =
  | { kind: "split"; pause: number; resume: number; n: number }
  | { kind: "total"; total: number }
  | { kind: "standby"; resume: number; idleS: number; n: number; note: string }
  | { kind: "restart"; note: string }
  | { kind: "none" };

export function pauseOf(track: Track, p: Provider): PauseResult {
  const restart = noRealPause[p.id];
  if (restart) return { kind: "restart", note: restart };
  const standby = autoStandby[p.id];
  // A standby resume without its note would be drawn as an ordinary resume with nothing said about the missing pause.
  if (p.standbyResume && !standby) throw new Error(`${p.id} has a standby resume but no autoStandby note`);
  if (standby) return p.standbyResume ? { kind: "standby", resume: p.standbyResume.resume, idleS: p.standbyResume.idleS, n: p.standbyResume.n, note: standby } : { kind: "none" };
  if (p.pauseSplit) return { kind: "split", ...p.pauseSplit };
  const total = track.findMetric("pause-resume")?.values.find((v) => v.provider === p.id)?.p50 ?? null;
  return total === null ? { kind: "none" } : { kind: "total", total };
}

/** Every provider in a track with its pause result. */
export const pauses = (track: Track) => track.providers.map((p) => ({ p, r: pauseOf(track, p) }));

/** The resume time a provider has, from a pause call or after standby, or null. */
export function resumeOf(r: PauseResult): number | null {
  switch (r.kind) {
    case "split":
    case "standby":
      return r.resume;
    case "total":
    case "restart":
    case "none":
      return null;
    default: {
      const _exhaustive: never = r;
      return _exhaustive;
    }
  }
}
