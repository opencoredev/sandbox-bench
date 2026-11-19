import raw from "@/data/realtask-burst.json";

import { parseRealtaskBurst } from "@/lib/realtask-burst";

/**
 * "Real tasks at once", parsed once when the module loads so a malformed file
 * stops the build. Written by `bun scripts/realtask-burst-site-data.ts`.
 */
export const realtaskBurst = parseRealtaskBurst(raw);
