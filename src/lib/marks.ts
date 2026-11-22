import type { CSSProperties } from "react";

import { tierOf } from "@/lib/providers";
import type { CpuClass, ProviderId } from "@/lib/providers";

/**
 * How a chart mark is painted. Marks are flat: `solid` is the series colour,
 * `striped` is the one texture, 45° stripes of the same colour, for a part
 * that has to read apart without a second hue (resume under pause, our
 * overhead beside the provider's time).
 */
export type MarkFill = "solid" | "striped" | "light" | "hatched";

/**
 * `light` and `hatched` are for CPU tiers, which keep their provider's hue:
 * `light` (a shared CPU) is a lighter, softer shade of the colour, and
 * `hatched` (preemptible spot capacity) is that shade in wide diagonal bands,
 * so the three read apart in greyscale too.
 */
export function markFill(fill: MarkFill, color: string): CSSProperties {
  switch (fill) {
    case "solid":
      return { backgroundColor: color };
    case "striped":
      return { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in oklch, ${color} 28%, transparent) 2px 6px)` };
    case "light":
      return { backgroundColor: lighter(color) };
    case "hatched":
      return { backgroundImage: `repeating-linear-gradient(135deg, ${lighter(color)} 0 4px, color-mix(in oklch, ${color} 35%, transparent) 4px 7px)` };
    default: {
      const _exhaustive: never = fill;
      return _exhaustive;
    }
  }
}

/** The same hue, lighter and less saturated. */
const lighter = (color: string) => `color-mix(in oklch, ${color} 62%, white)`;

const tierFills = { dedicated: "solid", shared: "light", spot: "hatched" } as const satisfies Record<CpuClass, MarkFill>;

/** A row's own fill: a provider's solid mark, drawn as its CPU tier's fill for a tier row. Other fills (a striped part) stay. */
export const rowFill = (id: ProviderId, fill: MarkFill): MarkFill => {
  const tier = tierOf(id);
  return fill === "solid" && tier ? tierFills[tier.cpu] : fill;
};
