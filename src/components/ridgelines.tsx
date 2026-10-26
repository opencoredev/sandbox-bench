import { ProviderName } from "@/components/provider-name";
import { formatValue } from "@/lib/format";
import { isProviderId, providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

// Axis stops run 1, 2, 5 × 10ⁿ. The plot spans the closest stops around every
// sample, at least one step wide and never past MAX_S.
const MAX_S = 50;

/** A log axis with 0 < min < max; build it only through domainOf. */
interface Domain {
  min: number;
  max: number;
}

const stopAtOrBelow = (s: number) => {
  const decade = 10 ** Math.floor(Math.log10(s));
  return [5, 2, 1].map((m) => m * decade).find((t) => t <= s * (1 + 1e-9)) ?? decade;
};
const stopAbove = (s: number) => {
  const decade = 10 ** Math.floor(Math.log10(s));
  return [1, 2, 5, 10].map((m) => m * decade).find((t) => t > s * (1 + 1e-9)) ?? 10 * decade;
};
const stopBelow = (s: number) => {
  const decade = 10 ** Math.floor(Math.log10(s * (1 - 1e-9)));
  return [5, 2, 1, 0.5].map((m) => m * decade).find((t) => t < s * (1 - 1e-9)) ?? decade / 2;
};

function domainOf(values: readonly [number, ...number[]]): Domain {
  const min = stopAtOrBelow(Math.min(...values));
  const hi = Math.max(...values);
  const max = Math.min(MAX_S, hi <= min ? stopAbove(min) : stopAtOrBelow(hi) < hi ? stopAbove(hi) : hi);
  // Every sample past MAX_S: keep one step below it so the axis still has width.
  return min < max ? { min, max } : { min: stopBelow(max), max };
}

function ticksOf({ min, max }: Domain): number[] {
  const ticks = [min];
  for (let t = stopAbove(min); t <= max * (1 + 1e-9); t = stopAbove(t)) ticks.push(t);
  return ticks;
}

interface Layout {
  W: number;
  ROW: number;
  PEAK: number;
  TOP: number;
}
// Rows sit about two thirds of a peak apart, so each ridge overlaps the next one only a little.
// On phones the plot draws at about half scale, so rows sit further apart to leave room for a two-line name.
const desktop: Layout = { W: 1000, ROW: 66, PEAK: 96, TOP: 104 };
const phone: Layout = { W: 400, ROW: 112, PEAK: 92, TOP: 112 };

const toX = (s: number, W: number, { min, max }: Domain) =>
  ((Math.log(s) - Math.log(min)) / (Math.log(max) - Math.log(min))) * W;

/** Gaussian kernel density in log-seconds, sampled across the plot. */
function density(values: readonly number[], { min, max }: Domain, steps = 160) {
  const logs = values.map((v) => Math.log(v));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length) || 0.1;
  const h = 0.9 * sd * logs.length ** -0.2;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const x = Math.log(min) + ((Math.log(max) - Math.log(min)) * i) / steps;
    const y = logs.reduce((sum, l) => sum + Math.exp(-0.5 * ((x - l) / h) ** 2), 0);
    return { s: Math.exp(x), y };
  });
  const peak = Math.max(...points.map((p) => p.y));
  return points.map((p) => ({ s: p.s, y: p.y / peak }));
}

const median = (xs: readonly number[]) => xs[Math.floor((xs.length - 1) / 2)] ?? 0;

/**
 * Every successful cold start as a ridge: one row per provider, fastest at the
 * top, on a log time axis fitted to the samples. The tick is the median.
 * Starts slower than MAX_S are counted at the right end of their ridge. Each ridge is a
 * line over a light wash of its provider's colour.
 */
export function Ridgelines({ samples }: { samples: Partial<Record<ProviderId, readonly number[]>> }) {
  const rows = Object.entries(samples)
    .flatMap(([provider, values]) =>
      isProviderId(provider) && values && values.length > 0
        ? [{ provider, values, p50: median([...values].sort((a, b) => a - b)) }]
        : [],
    )
    .sort((a, b) => a.p50 - b.p50);
  const [first, ...rest] = rows.flatMap((r) => r.values);
  if (first === undefined) return null;
  const domain = domainOf([first, ...rest]);
  const ticks = ticksOf(domain);
  return (
    <>
      <div className="sm:hidden">
        <Plot rows={rows} layout={phone} domain={domain} ticks={ticks} />
      </div>
      <div className="hidden sm:block">
        <Plot rows={rows} layout={desktop} domain={domain} ticks={ticks} />
      </div>
    </>
  );
}

type Row = { provider: ProviderId; values: readonly number[]; p50: number };

const over = (row: Row, { max }: Domain) => row.values.filter((v) => v > max).length;

function Plot({ rows, layout, domain, ticks }: { rows: Row[]; layout: Layout; domain: Domain; ticks: number[] }) {
  const { W, ROW, PEAK, TOP } = layout;
  const lx = (s: number) => toX(s, W, domain);
  const height = TOP + ROW * (rows.length - 1) + 30;
  return (
    <figure className="grid grid-cols-[6.75rem_1fr] gap-x-s sm:grid-cols-[9.5rem_1fr] sm:gap-x-5">
      <div className="relative">
        {rows.map((row, i) => (
          <div
            key={row.provider}
            className="absolute right-0 left-0 flex -translate-y-full flex-col items-end pb-0.5 text-right"
            style={{ top: `${((TOP + i * ROW) / height) * 100}%` }}
          >
            <span className="flex items-center gap-xxs text-xs text-neutral-8 sm:text-s">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: providerColor(row.provider) }} />
              <ProviderName id={row.provider} />
            </span>
            <span className="font-mono text-xxs whitespace-nowrap text-neutral-7 tabular-nums sm:text-xs">
              {formatValue(row.p50, "s")}
              {` · n = ${row.values.length}`}
            </span>
          </div>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={`Cold start time distributions. Medians: ${rows.map((r) => `${providerName(r.provider)} ${formatValue(r.p50, "s")} (n = ${r.values.length})`).join(", ")}.`}
        >
          {ticks.map((t) => (
            <line
              key={t}
              x1={lx(t)}
              x2={lx(t)}
              y1={0}
              y2={height - 22}
              stroke="var(--neutral-3)"
            />
          ))}
          {rows.map((row, i) => {
            const base = TOP + i * ROW;
            const pts = density(row.values, domain).map((p) => [lx(p.s), base - p.y * PEAK] as const);
            const line = pts.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
            const area = `${line}L${W},${base}L0,${base}Z`;
            const color = providerColor(row.provider);
            return (
              <g key={row.provider}>
                {/* The card colour first, so a ridge hides the one behind it; then a light wash and a 2px line. */}
                <path d={area} fill="var(--neutral-2)" />
                <path d={area} fill={color} fillOpacity={0.14} />
                <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <line x1={0} x2={W} y1={base} y2={base} stroke="var(--neutral-3)" />
              </g>
            );
          })}
          {rows.map((row, i) => (
            <line
              key={row.provider}
              x1={lx(row.p50)}
              x2={lx(row.p50)}
              y1={TOP + i * ROW - 12}
              y2={TOP + i * ROW + 4}
              stroke="var(--neutral-10)"
              strokeWidth={2.5}
            />
          ))}
        </svg>
        {rows.map((row, i) =>
          over(row, domain) > 0 ? (
            <span
              key={row.provider}
              className="absolute right-0 -translate-y-[calc(100%+3px)] rounded-[3px] bg-neutral-2 px-xxs font-mono text-xxs whitespace-nowrap text-neutral-7 tabular-nums"
              // The tick row below the plot is 1.25rem tall.
              style={{ top: `calc((100% - 1.25rem) * ${(TOP + i * ROW) / height})` }}
            >
              {over(row, domain)} over {Number(domain.max.toPrecision(3))} s →
            </span>
          ) : null,
        )}
        <div className="relative h-5">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 font-mono text-xxs whitespace-nowrap text-neutral-7"
              style={{ left: `${(lx(t) / W) * 100}%` }}
            >
              {Number(t.toPrecision(3))}
              {t === ticks.at(-1) ? " s" : ""}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
