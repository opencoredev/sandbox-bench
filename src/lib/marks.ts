import type { CSSProperties } from "react";

import { tierOf } from "@/lib/providers";
import type { CpuClass, ProviderId } from "@/lib/providers";

/**
 * How a chart mark is painted. Marks are flat: `solid` is the series colour,
 * `striped` is the one texture, 45° stripes of the same colour, for a part
 * that has to read apart without a second hue (resume under pause, our
 * overhead beside the provider's time).
 */
export type MarkFill = "solid" | "striped" | "tint" | "hollow";

/**
 * `tint` and `hollow` are for CPU tiers, which keep their provider's colour:
 * `tint` (a shared CPU) is the colour at half strength inside a solid edge,
 * `hollow` (preemptible spot capacity) is a faint fill inside a dashed edge.
 */
export function markFill(fill: MarkFill, color: string): CSSProperties {
  switch (fill) {
    case "solid":
      return { backgroundColor: color };
    case "striped":
      return { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in oklch, ${color} 28%, transparent) 2px 6px)` };
    case "tint":
      return { backgroundColor: `color-mix(in oklch, ${color} 50%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${color}` };
    case "hollow":
      return { backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`, outline: `1.5px dashed ${color}`, outlineOffset: "-1.5px" };
    default: {
      const _exhaustive: never = fill;
      return _exhaustive;
    }
  }
}

const tierFills = { dedicated: "solid", shared: "tint", spot: "hollow" } as const satisfies Record<CpuClass, MarkFill>;

/** A row's own fill: a provider's solid mark, drawn as its CPU tier's fill for a tier row. Other fills (a striped part) stay. */
export const rowFill = (id: ProviderId, fill: MarkFill): MarkFill => {
  const tier = tierOf(id);
  return fill === "solid" && tier ? tierFills[tier.cpu] : fill;
};
