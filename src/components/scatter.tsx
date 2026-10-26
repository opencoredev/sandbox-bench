import type { CSSProperties } from "react";

import { HoverCard, detailText } from "@/components/hover-card";
import type { DetailLine } from "@/components/hover-card";
import { ProviderName } from "@/components/provider-name";
import { formatPerThousand, perPriceLabel } from "@/lib/cost";
import { formatValue } from "@/lib/format";
import { providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

export interface ScatterPoint {
  provider: ProviderId;
  /** Seconds. */
  x: number;
  /** US dollars per task. */
  y: number;
  /** Hover-card lines after the name and the two values, such as the machine it ran on. */
  detail: readonly DetailLine[];
}

// Plot insets in px: room for tick labels on the left and bottom.
const INSET = { left: 56, right: 18, top: 14, bottom: 30 };
// The attractive quadrant: the theme's success colour.
const QUADRANT = "var(--success)";
/** Plot height in px between the insets on a phone (h-[340px]). */
const PHONE_PLOT_PX = 340 - INSET.top - INSET.bottom;
/** The plot's drawing width between its insets at 390px and 360px viewports: one label layout for each. */
const PLOT_W = { wide: 222, narrow: 192 } as const;

/** The x axis starts here instead of at the first tick when no point sits below it. */
const X_FLOOR = 2.5;

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/** CSS position of a 0 to 1 fraction along the plot area. */
const along = (f: number, axis: "x" | "y") =>
  axis === "x"
    ? `calc(${INSET.left}px + (100% - ${INSET.left + INSET.right}px) * ${f})`
    : `calc(${INSET.top}px + (100% - ${INSET.top + INSET.bottom}px) * ${1 - f})`;

/**
 * Artificial Analysis-style scatter, built in HTML so text stays crisp at
 * any width: log seconds across, price up, both lower is better, so the
 * attractive quadrant is the bottom left, split at the medians.
 */
export function Scatter({
  points,
  xTicks,
  yTicks,
  xTitle,
  yTitle,
}: {
  points: readonly ScatterPoint[];
  xTicks: readonly [number, ...number[]];
  yTicks: readonly [number, ...number[]];
  xTitle: string;
  yTitle: string;
}) {
  // Empty room left of the fastest point only squeezes the rest together.
  const trim = xTicks[0] < X_FLOOR && points.every((p) => p.x >= X_FLOOR);
  // No tick at the floor itself: on a phone it would collide with the next one.
  const xs = trim ? xTicks.filter((t) => t > X_FLOOR) : xTicks;
  const x0 = trim ? X_FLOOR : xTicks[0];
  const x1 = xTicks.at(-1) ?? x0 * 10;
  const y0 = yTicks[0];
  const y1 = yTicks.at(-1) ?? y0 + 1;
  const fx = (x: number) => (Math.log(x) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
  const fy = (y: number) => (y - y0) / (y1 - y0);
  const mx = fx(median(points.map((p) => p.x)));
  const my = fy(median(points.map((p) => p.y)));
  const summary = points
    .map((p) => `${providerName(p.provider)}: ${formatValue(p.x, "s")}, ${formatPerThousand(p.y)} ${perPriceLabel}`)
    .join("; ");

  // Labels point away from the right edge, and inside the quadrant toward the side with more room,
  // so they never run over its dashed edge. Up to 0.72 across, a phone still has about 85px on the
  // right (plot plus its 18px inset), enough for "Upstash Box".
  const flipOf = (p: ScatterPoint) => {
    const px = fx(p.x);
    return px > 0.72 || (px < mx && fy(p.y) < my && mx - px < px);
  };
  // Label placement, worked out on a phone plot, the tightest it gets (wider plots only add room
  // across): one layout at 390px that holds from there up, one at 360px for narrower phones. Each
  // label tries its dot's line first, then one line up or down, then two, on its preferred side and
  // then the other, and takes the first spot that crosses no dot, overlaps no label placed before
  // it, and stays inside the plot, clear of the x-axis. When none is clear it takes the spot with
  // the fewest clashes. Labels are placed bottom to top.
  type Box = { l: number; r: number; t: number; b: number };
  type Spot = { flip: boolean; nudge: number };
  const hit = (a: Box, c: Box) => a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
  const layout = (plotW: number) => {
    const at = (p: ScatterPoint) => ({ x: fx(p.x) * plotW, y: (1 - fy(p.y)) * PHONE_PLOT_PX });
    const dots = points.map((p) => { const { x, y } = at(p); return { p, box: { l: x - 7, r: x + 7, t: y - 7, b: y + 7 } }; });
    const labelBox = (p: ScatterPoint, { flip, nudge }: Spot): Box => {
      const { x, y } = at(p);
      const stacked = p.provider === "upstash-ephemeral";
      const w = stacked ? 70 : providerName(p.provider).length * 7.4 + 2;
      const h = stacked ? 34 : 14;
      const l = flip ? x - 12 - w : x + 12;
      return { l, r: l + w, t: y + nudge - h / 2, b: y + nudge + h / 2 };
    };
    const placed = new Map<ScatterPoint["provider"], Spot & { box: Box }>();
    for (const p of [...points].sort((a, b) => a.y - b.y || b.x - a.x)) {
      const preferred = flipOf(p);
      // A label over another label hides a name, so it counts double; one over a dot's edge only crowds it.
      const clashes = (box: Box) =>
        (box.t < -INSET.top || box.b > PHONE_PLOT_PX + 2 || box.l < -INSET.left + 8 || box.r > plotW + INSET.right ? 1 : 0) +
        dots.filter((d) => d.p !== p && hit(box, d.box)).length +
        2 * [...placed.values()].filter((o) => hit(box, o.box)).length;
      let choice = { flip: preferred, nudge: 0, box: labelBox(p, { flip: preferred, nudge: 0 }) };
      let fewest = Infinity;
      search: for (const nudge of [0, -15, 15, -30, 30]) {
        for (const flip of [preferred, !preferred]) {
          const box = labelBox(p, { flip, nudge });
          const n = clashes(box);
          if (n < fewest) { fewest = n; choice = { flip, nudge, box }; }
          if (n === 0) break search;
        }
      }
      placed.set(p.provider, choice);
    }
    return placed;
  };
  const wide = layout(PLOT_W.wide);
  const narrow = layout(PLOT_W.narrow);
  const spot = (p: ScatterPoint, from: Map<ScatterPoint["provider"], Spot>): Spot => from.get(p.provider) ?? { flip: flipOf(p), nudge: 0 };

  return (
    <figure aria-label={`${yTitle} against ${xTitle}. ${summary}.`}>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-xs text-xs text-neutral-7">
        <span className="flex items-center gap-xs">
          <span aria-hidden className="size-3 rounded-[2px] border" style={{ backgroundColor: `color-mix(in oklch, ${QUADRANT} 16%, transparent)`, borderColor: `color-mix(in oklch, ${QUADRANT} 45%, transparent)` }} />
          Faster and cheaper than the median
        </span>
      </div>

      <div className="flex">
        <div className="relative w-5 shrink-0">
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-xs whitespace-nowrap text-neutral-7">
            {yTitle}
          </span>
        </div>
        <div className="relative h-[340px] min-w-0 flex-1 sm:h-[420px]">
          <div
            aria-hidden
            className="absolute"
            style={{
              left: along(0, "x"),
              width: `calc((100% - ${INSET.left + INSET.right}px) * ${mx})`,
              top: along(my, "y"),
              bottom: INSET.bottom,
              backgroundColor: `color-mix(in oklch, ${QUADRANT} 13%, transparent)`,
              borderTop: `1px dashed color-mix(in oklch, ${QUADRANT} 40%, transparent)`,
              borderRight: `1px dashed color-mix(in oklch, ${QUADRANT} 40%, transparent)`,
            }}
          />
          {yTicks.map((t) => (
            <div aria-hidden key={`y${t}`} className="absolute right-[18px] left-[56px] border-t border-neutral-3" style={{ top: along(fy(t), "y") }}>
              <span className="absolute -left-2 -translate-x-full -translate-y-1/2 font-mono text-xxs text-neutral-7 tabular-nums">
                {formatPerThousand(t)}
              </span>
            </div>
          ))}
          {xs.map((t) => (
            <div aria-hidden key={`x${t}`} className="absolute top-[14px] bottom-[30px] border-l border-neutral-3" style={{ left: along(fx(t), "x") }}>
              <span className="absolute -bottom-6 -translate-x-1/2 font-mono whitespace-nowrap text-xxs text-neutral-7 tabular-nums">
                {t} s
              </span>
            </div>
          ))}
          <div aria-hidden className="absolute right-[18px] bottom-[30px] left-[56px] border-t border-neutral-5" />
          <div aria-hidden className="absolute top-[14px] bottom-[30px] left-[56px] border-l border-neutral-5" />
          {points.map((p) => {
            const px = fx(p.x);
            const py = fy(p.y);
            const big = spot(p, wide);
            const small = spot(p, narrow);
            const color = providerColor(p.provider);
            const lines: DetailLine[] = [["Cost per 1,000 tasks", formatPerThousand(p.y)], ["100 tool calls", formatValue(p.x, "s")], ...p.detail];
            return (
              <div
                key={p.provider}
                tabIndex={0}
                role="img"
                aria-label={`${providerName(p.provider)}: ${lines.map(detailText).join(", ")}`}
                className="group/pt absolute size-0 outline-none hover:z-20 focus:z-20"
                style={{ left: along(px, "x"), top: along(py, "y") }}
              >
                <span
                  aria-hidden
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-neutral-2 transition-[scale] duration-[var(--motion-duration)] group-hover/pt:scale-125 group-focus-visible/pt:scale-125 group-focus-visible/pt:outline-2 group-focus-visible/pt:outline-offset-4 group-focus-visible/pt:outline-accent motion-reduce:transition-none"
                  style={{ backgroundColor: color }}
                />
                {/* A wider invisible target than the 12px dot. */}
                <span aria-hidden className="absolute size-8 -translate-x-1/2 -translate-y-1/2" />
                <span
                  aria-hidden
                  className={`absolute top-(--nudge) -translate-y-1/2 text-xs leading-none whitespace-nowrap text-neutral-8 max-[389px]:top-(--nudge-narrow) ${big.flip ? "right-3" : "left-3"} ${small.flip === big.flip ? "" : small.flip ? "max-[389px]:left-auto max-[389px]:right-3" : "max-[389px]:right-auto max-[389px]:left-3"}`}
                  style={{ "--nudge": `${big.nudge}px`, "--nudge-narrow": `${small.nudge}px` } as CSSProperties}
                >
                  <ProviderName id={p.provider} layout="stacked" />
                </span>
                <HoverCard
                  provider={p.provider}
                  detail={lines}
                  className={`left-0 opacity-0 group-hover/pt:opacity-100 group-focus/pt:opacity-100 motion-reduce:transition-none ${py > 0.5 ? "top-3" : "bottom-3"}`}
                  // Slide the card along its own width as the dot moves right, so it stays inside the plot at any width.
                  style={{ translate: `${-px * 100}% 0` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-s pl-5 text-center text-xs text-neutral-7">{xTitle}</p>
    </figure>
  );
}

/** Evenly spaced ticks from 0 past `max`, at a 1, 2 or 5 step. */
export function linearTicks(max: number): readonly [number, ...number[]] {
  const raw = Math.max(max, Number.EPSILON) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const count = Math.ceil(max / step + 0.15);
  return [0, ...Array.from({ length: count }, (_, i) => Number(((i + 1) * step).toPrecision(6)))];
}

/** 1, 2, 5 steps covering `min` to `max`, for a log axis. */
export function logTicks(min: number, max: number): readonly [number, ...number[]] {
  const ladder = Array.from({ length: 8 }, (_, e) => [1, 2, 5].map((m) => m * 10 ** (e - 2))).flat();
  const lo = [...ladder].reverse().find((t) => t <= min) ?? ladder[0] ?? 0.01;
  const hi = ladder.find((t) => t >= max) ?? max;
  const inside = ladder.filter((t) => t > lo && t < hi);
  return [lo, ...inside, hi];
}
