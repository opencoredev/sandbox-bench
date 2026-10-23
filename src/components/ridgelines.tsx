import { ProviderName } from "@/components/provider-name";
import { FillPattern } from "@/lib/dither";
import { formatValue } from "@/lib/format";
import { isProviderId, providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import type { TrackId } from "@/lib/data";

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
 * Starts slower than MAX_S are counted at the right end of their ridge. Each fill is sparse and half see-through
 * so the ridge behind still shows.
 */
export function Ridgelines({ track, samples }: { track: TrackId; samples: Partial<Record<ProviderId, readonly number[]>> }) {
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
        <Plot rows={rows} layout={phone} domain={domain} ticks={ticks} id={`${track}-p`} />
      </div>
      <div className="hidden sm:block">
        <Plot rows={rows} layout={desktop} domain={domain} ticks={ticks} id={`${track}-d`} />
      </div>
    </>
  );
}

type Row = { provider: ProviderId; values: readonly number[]; p50: number };

const over = (row: Row, { max }: Domain) => row.values.filter((v) => v > max).length;

function Plot({ rows, layout, domain, ticks, id }: { rows: Row[]; layout: Layout; domain: Domain; ticks: number[]; id: string }) {
  const { W, ROW, PEAK, TOP } = layout;
  const lx = (s: number) => toX(s, W, domain);
  const height = TOP + ROW * (rows.length - 1) + 30;
  return (
    <figure className="grid grid-cols-[6.75rem_1fr] gap-x-3 sm:grid-cols-[9.5rem_1fr] sm:gap-x-5">
      <div className="relative">
        {rows.map((row, i) => (
          <div
            key={row.provider}
            className="absolute right-0 left-0 flex -translate-y-full flex-col items-end pb-0.5 text-right leading-tight"
            style={{ top: `${((TOP + i * ROW) / height) * 100}%` }}
          >
            <span className="text-[12px] font-medium sm:text-[14px]" style={{ color: providerColor(row.provider) }}>
              <ProviderName id={row.provider} />
            </span>
            <span className="font-mono text-[11px] whitespace-nowrap text-[var(--muted)] tabular-nums sm:text-[12px]">
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
          <defs>
            {rows.map((row, i) => (
              <FillPattern
                key={row.provider}
                id={`ridge-${id}-${row.provider}`}
                fill="gradient"
                color={providerColor(row.provider)}
                cell={3}
                floor={0.03}
                level={0.45}
                ramp={{ edge: "top", at: TOP + i * ROW - PEAK, length: PEAK * 1.1 }}
              />
            ))}
          </defs>
          {ticks.map((t) => (
            <line
              key={t}
              x1={lx(t)}
              x2={lx(t)}
              y1={0}
              y2={height - 22}
              stroke="var(--line)"
              strokeDasharray="2 4"
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
                <path d={area} fill="var(--surface)" fillOpacity={0.45} />
                <path d={area} fill={`url(#ridge-${id}-${row.provider})`} />
                <path d={line} fill="none" stroke={color} strokeWidth={1.5} />
                <line x1={0} x2={W} y1={base} y2={base} stroke="var(--line)" />
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
              stroke="var(--foreground)"
              strokeWidth={2.5}
            />
          ))}
        </svg>
        {rows.map((row, i) =>
          over(row, domain) > 0 ? (
            <span
              key={row.provider}
              className="absolute right-0 -translate-y-[calc(100%+3px)] rounded-[3px] bg-[var(--surface)] px-1 font-mono text-[11px] whitespace-nowrap text-[var(--muted)] tabular-nums"
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
              className="absolute -translate-x-1/2 font-mono text-[11px] whitespace-nowrap text-[var(--muted)]"
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
