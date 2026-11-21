import raw from "@/data/expanded.json";

import { parseExpanded } from "@/lib/expanded";

/**
 * The expanded benchmarks, parsed once when the module loads so a malformed
 * file stops the build. Copy the sweep's site-data.json over src/data/expanded.json.
 */
export const expanded = parseExpanded(raw);
