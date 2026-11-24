import { detailText } from "@/components/hover-card";
import { HoverCardOnDemand } from "@/components/hover-card-on-demand";
import type { DetailLine } from "@/components/hover-card";
import { ProviderName } from "@/components/provider-name";
import { formatPerThousand, perPriceLabel } from "@/lib/cost";
import { formatValue } from "@/lib/format";
import { markFill, rowFill } from "@/lib/marks";
import { isExtraTier, providerBrand, providerColor, providerName, tierOf, tiersOf } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

export interface ScatterPoint {
  provider: ProviderId;
  /** Seconds. */
  x: number;
  /** US dollars per task. */
  y: number;
  /** Hover-card lines after the name and the two values, such as the machine it ran on. */
  detail: readonly DetailLine[];
  /** Words said beside the cost, such as "usage cost, unsettled" on a provider-reported usage cost (Archil's). */
  tag?: string;
}

/** "$8.87", or "$8.87 (usage cost, unsettled)" for a point whose cost has a tag. */
const costText = (p: Pick<ScatterPoint, "y" | "tag">) => (p.tag === undefined ? formatPerThousand(p.y) : `${formatPerThousand(p.y)} (${p.tag})`);

// Plot insets in px: room for tick labels on the left and bottom.
const INSET = { left: 56, right: 18, top: 14, bottom: 30 };
// The attractive quadrant: the theme's success colour.
const QUADRANT = "var(--success)";
/** Plot height in px between the insets on a phone (h-[340px]). */
const PHONE_PLOT_PX = 340 - INSET.top - INSET.bottom;
/** Plot width in px between the insets on a 360 px phone, the narrowest the phone numbers are placed for; wider phones only spread the dots. */
const PHONE_PLOT_W = 202;
/** Half a dot plus its ring, in px. */
const DOT_HALF = 8;

/** The x axis starts here instead of at the first tick when no point sits below it. */
const X_FLOOR = 2.5;

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Overlap area in px² of two boxes given by their centres and sizes. */
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)) *
  Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));

/**
 * Below 640 px the names don't fit beside the dots, so each dot gets a
 * number and a legend under the plot names it. (From 640 px up the names show
 * as before; Instabox's and Upstash Box's names touch below about 1310 px on
 * Same machine, as they did before Archil was added.) Numbers run left to
 * right over each provider's first CPU tier, then over the other tiers, so
 * the default view has no gaps. Each number takes the first spot beside its
 * dot (right, left, above, below, then the corners) that clears every dot
 * and every number already placed, on a 360 px phone's plot; where none
 * does, the spot with the least overlap. Offsets are px from the dot.
 */
export function phoneNumbers({ points, at }: { points: readonly ScatterPoint[]; at: (p: ScatterPoint) => { x: number; y: number } }) {
  const order = [...points].sort((a, b) => Number(isExtraTier(a.provider)) - Number(isExtraTier(b.provider)) || a.x - b.x);
  const dots: Box[] = points.map((p) => ({ ...at(p), w: DOT_HALF * 2, h: DOT_HALF * 2 }));
  const placed: Box[] = [];
  return new Map(
    order.map((p, i) => {
      const n = i + 1;
      // Geist Mono at text-xxs is about 6 px a digit and 10 px tall.
      const w = String(n).length * 6 + 2;
      const h = 11;
      const gap = 3;
      const side = DOT_HALF + gap + w / 2;
      const up = DOT_HALF + gap + h / 2;
      const corner = { x: DOT_HALF - 2 + w / 2, y: DOT_HALF - 2 + h / 2 };
      const spots = [
        { x: side, y: 0 },
        { x: -side, y: 0 },
        { x: 0, y: -up },
        { x: 0, y: up },
        { x: corner.x, y: -corner.y },
        { x: -corner.x, y: -corner.y },
        { x: corner.x, y: corner.y },
        { x: -corner.x, y: corner.y },
      ];
      const centre = at(p);
      // A number may sit in the right inset but not over the axis labels.
      const inside = (b: Box) => b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= PHONE_PLOT_W + INSET.right && b.y - b.h / 2 >= -INSET.top && b.y + b.h / 2 <= PHONE_PLOT_PX;
      const scored = spots.map((o) => {
        const b = { x: centre.x + o.x, y: centre.y + o.y, w, h };
        const cost = [...dots, ...placed].reduce((sum, d) => sum + overlap(b, d), 0) + (inside(b) ? 0 : 1e6);
        return { o, b, cost };
      });
      const best = scored.find((c) => c.cost === 0) ?? scored.reduce((a, c) => (c.cost < a.cost ? c : a));
      placed.push(best.b);
      return [p.provider, { n, dx: best.o.x, dy: best.o.y }] as const;
    }),
  );
}

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
  // The quadrant and the summary use each provider's first CPU tier, so they don't move when the tier switch shows the rest.
  const firsts = points.filter((p) => !isExtraTier(p.provider));
  const mx = fx(median(firsts.map((p) => p.x)));
  const my = fy(median(firsts.map((p) => p.y)));
  // Whether p's label, `nudge` px below its dot on the `flip` side, crosses another dot. Measured on the
  // phone plot, the shortest, where a label spans up to about 0.4 of the width.
  const runsOver = ({ p, flip, nudge }: { p: ScatterPoint; flip: boolean; nudge: number }) =>
    points.some((q) => {
      if (q === p) return false;
      const dx = fx(q.x) - fx(p.x);
      return (flip ? dx < 0 : dx > 0) && Math.abs(dx) < 0.4 && Math.abs((fy(q.y) - fy(p.y)) * PHONE_PLOT_PX + nudge) < 10;
    });
  // A provider's CPU tiers, joined in the provider's own tier order, so the trade between them reads as one line.
  const tierLines = [...new Set(points.filter((p) => tierOf(p.provider)).map((p) => providerBrand(p.provider)))].flatMap((brand) => {
    const order = tiersOf(brand).map((t) => t.id);
    const own = points.filter((p) => providerBrand(p.provider) === brand && order.includes(p.provider)).sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
    return own.length > 1 ? [{ brand, own }] : [];
  });
  const numbers = phoneNumbers({ points, at: (p) => ({ x: fx(p.x) * PHONE_PLOT_W, y: (1 - fy(p.y)) * PHONE_PLOT_PX }) });
  const legend = [...points].sort((a, b) => (numbers.get(a.provider)?.n ?? 0) - (numbers.get(b.provider)?.n ?? 0));
  const summary = firsts
    .map((p) => `${providerName(p.provider)}: ${formatValue(p.x, "s")}, ${formatPerThousand(p.y)} ${perPriceLabel}${p.tag === undefined ? "" : ` (${p.tag})`}`)
    .join("; ");

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
          {tierLines.map(({ brand, own }) =>
            // Every segment past the first tier leads to a hidden row, so the line hides with them under "One per provider".
            <svg
              key={brand}
              aria-hidden
              data-tier-extra=""
              className="pointer-events-none absolute overflow-visible"
              style={{ left: INSET.left, right: INSET.right, top: INSET.top, bottom: INSET.bottom, width: `calc(100% - ${INSET.left + INSET.right}px)`, height: `calc(100% - ${INSET.top + INSET.bottom}px)` }}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <polyline
                points={own.map((p) => `${fx(p.x)},${1 - fy(p.y)}`).join(" ")}
                fill="none"
                stroke={providerColor(brand)}
                strokeOpacity={0.55}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {points.map((p) => {
            const px = fx(p.x);
            const py = fy(p.y);
            // Labels point away from the right edge, and inside the quadrant toward the side
            // with more room, so they never run over its dashed edge.
            const inside = px < mx && py < my;
            const flip = px > 0.62 || (inside && mx - px < px);
            // Two points at nearly the same price print their labels on one line, and on a
            // narrow plot they collide whatever the gap: the dearer label moves above, the cheaper below,
            // so neither runs over the other's dot. At exactly one price the further-right one moves below.
            // Only a neighbour close enough across to share the label's line counts.
            const twin = points
              .filter((q) => q !== p && Math.abs(fy(q.y) - py) < 0.08 && Math.abs(fx(q.x) - px) < 0.3)
              .sort((a, b) => Math.abs(fy(a.y) - py) - Math.abs(fy(b.y) - py))[0];
            const above = twin && (twin.y === p.y ? fx(twin.x) > px : p.y > twin.y);
            // Moving off the line can put the label on a third dot's line instead; then it stays put,
            // as long as its own line is clear of every other dot.
            const moved = twin ? (above ? -15 : 15) : 0;
            const nudge = moved !== 0 && runsOver({ p, flip, nudge: moved }) && !runsOver({ p, flip, nudge: 0 }) ? 0 : moved;
            const color = providerColor(p.provider);
            const num = numbers.get(p.provider);
            const lines: DetailLine[] = [["Cost per 1,000 tasks", formatPerThousand(p.y)], ["100 tool calls", formatValue(p.x, "s")], ...p.detail];
            // A tagged cost (Archil's usage cost) is said beside the amount in the accessible name, and on a line of
            // its own in the card, where a long value would squeeze the labels. Untagged points are as before.
            const said: DetailLine[] = p.tag === undefined ? lines : [["Cost per 1,000 tasks", costText(p)], ...lines.slice(1)];
            const shown: DetailLine[] = p.tag === undefined ? lines : [...lines.slice(0, 2), p.tag.replace(/^\w/, (c) => c.toUpperCase()), ...lines.slice(2)];
            return (
              <div
                key={p.provider}
                {...(isExtraTier(p.provider) ? { "data-tier-extra": "" } : {})}
                tabIndex={0}
                role="img"
                aria-label={`${providerName(p.provider)}: ${said.map(detailText).join(", ")}`}
                className="group/pt absolute size-0 outline-none"
                style={{ left: along(px, "x"), top: along(py, "y") }}
              >
                {/* The dot and its number sit above every point's wider invisible target (z-10), so a neighbour's target can't take
                    them, even while that neighbour is hovered or focused: only its card rises above them (z-30), never its target. */}
                <span
                  aria-hidden
                  className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-neutral-2 transition-[scale] duration-[var(--motion-duration)] group-hover/pt:scale-125 group-focus-visible/pt:scale-125 group-focus-visible/pt:outline-2 group-focus-visible/pt:outline-offset-4 group-focus-visible/pt:outline-accent motion-reduce:transition-none"
                  style={markFill(rowFill(p.provider, "solid"), color)}
                />
                {/* A wider invisible target than the 12px dot. */}
                <span aria-hidden className="absolute size-8 -translate-x-1/2 -translate-y-1/2" />
                <span
                  aria-hidden
                  className={`absolute -translate-y-1/2 text-xs leading-none whitespace-nowrap text-neutral-8 max-sm:hidden ${flip ? "right-3" : "left-3"}`}
                  style={{ top: nudge }}
                >
                  <ProviderName id={p.provider} layout="stacked" />
                </span>
                {num ? (
                  <span
                    aria-hidden
                    className="absolute z-10 -translate-x-1/2 -translate-y-1/2 font-mono text-xxs leading-none text-neutral-9 tabular-nums sm:hidden"
                    style={{ left: num.dx, top: num.dy }}
                  >
                    {num.n}
                  </span>
                ) : null}
                <HoverCardOnDemand
                  provider={p.provider}
                  detail={shown}
                  className={`left-0 opacity-0 group-hover/pt:opacity-100 group-focus/pt:opacity-100 motion-reduce:transition-none ${py > 0.5 ? "top-3" : "bottom-3"}`}
                  // Slide the card along its own width as the dot moves right, so it stays inside the plot at any width.
                  style={{ translate: `${-px * 100}% 0`, zIndex: 30 }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-s pl-5 text-center text-xs text-neutral-7">{xTitle}</p>
      {/* Below 640 px only: the names the numbers on the dots stand for. */}
      <ol aria-hidden className="mt-m grid grid-cols-2 gap-x-m gap-y-xxs pl-5 text-xs text-neutral-8 sm:hidden">
        {legend.map((p) => (
          <li key={p.provider} {...(isExtraTier(p.provider) ? { "data-tier-extra": "" } : {})} className="flex min-w-0 items-center gap-xs">
            <span className="w-4 shrink-0 text-right font-mono text-xxs tabular-nums text-neutral-9">{numbers.get(p.provider)?.n}</span>
            <span className="size-2 shrink-0 rounded-full" style={markFill(rowFill(p.provider, "solid"), providerColor(p.provider))} />
            <span className="min-w-0">
              <ProviderName id={p.provider} />
            </span>
          </li>
        ))}
      </ol>
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
