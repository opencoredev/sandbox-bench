import type { Provider, Track } from "@/lib/data";
import { noRealPause } from "@/lib/notes";

/** The tests a provider's success rate counts, in page order. The machine tests run in one probe, so cpu-single stands for them. */
export const countedTests = [
  "cold", "command", "files-1kb", "files-10mb", "reconnect", "pause-resume", "destroy",
  "snapshot", "create-from-snapshot", "git-clone", "npm-install", "pip-install", "dev-server",
  "preview-first-byte", "edit-loop", "tool-replay", "cpu-single", "burst-10", "burst-25",
] as const;

/**
 * Plain success rate over the counted tests: every attempt counts, whatever
 * made it fail. A pause that is really a restart is not a pause test, so it
 * is left out for the providers in noRealPause.
 */
export function successRate(track: Track, provider: Provider) {
  let attempts = 0;
  let succeeded = 0;
  for (const id of countedTests) {
    if (id === "pause-resume" && noRealPause[provider.id]) continue;
    const v = track.metric(id).values.find((x) => x.provider === provider.id);
    if (!v) continue;
    attempts += v.n + v.failures;
    succeeded += v.n;
  }
  return { attempts, succeeded, rate: attempts ? succeeded / attempts : null };
}
