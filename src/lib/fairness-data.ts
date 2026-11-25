import raw from "@/data/fairness.json";

import { parseFairness } from "@/lib/fairness";

/**
 * The like-for-like checks, parsed once when the module loads so a malformed
 * file stops the build. scripts/fairness-site-data.ts writes src/data/fairness.json.
 */
export const fairness = parseFairness(raw);
