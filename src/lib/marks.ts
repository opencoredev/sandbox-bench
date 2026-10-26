import type { CSSProperties } from "react";

/**
 * How a chart mark is painted. Marks are flat: `solid` is the series colour,
 * `striped` is the one texture, 45° stripes of the same colour, for a part
 * that has to read apart without a second hue (resume under pause, our
 * overhead beside the provider's time).
 */
export type MarkFill = "solid" | "striped";

export const markFill = (fill: MarkFill, color: string): CSSProperties =>
  fill === "solid"
    ? { backgroundColor: color }
    : { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in oklch, ${color} 28%, transparent) 2px 6px)` };
