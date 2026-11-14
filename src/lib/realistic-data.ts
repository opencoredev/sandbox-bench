import raw from "@/data/realistic.json";

import { parseRealistic } from "@/lib/realistic";

/**
 * The realistic-workload results the page and the agent files read. Parsed
 * once when the module loads, so a malformed file stops the build instead of
 * reaching the page. Written by `bun scripts/realistic-site-data.ts`.
 */
export const realistic = parseRealistic(raw);
