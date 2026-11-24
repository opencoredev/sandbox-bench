import raw from "@/data/sustained-cpu.json";

import { parseSustainedCpu } from "@/lib/sustained-cpu";

/**
 * Sustained CPU over 15 minutes, parsed once when the module loads so a
 * malformed file stops the build. The harness writes src/data/sustained-cpu.json;
 * until it does, the file holds no providers and the section shows nothing.
 */
export const sustainedCpu = parseSustainedCpu(raw);
