export type Unit = "s" | "ms" | "ops/s" | "MB/s" | "IOPS" | "files/s" | "queries/s" | "spawns/s";

/** The units the expanded benchmarks report in (the harness's bench/src/expanded/types.ts). */
export type ExpandedUnit = Extract<Unit, "s" | "ops/s" | "MB/s" | "files/s" | "queries/s" | "spawns/s">;

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Compact throughput formatting that keeps two decimals for positive rates below 1 so small rates never round to 0. */
const formatRate = (value: number) => (value > 0 && value < 1 ? value.toFixed(2) : compact.format(value));

export function formatValue(value: number, unit: Unit) {
  switch (unit) {
    case "s":
      return `${value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : value.toFixed(0)} s`;
    case "ms":
      return `${value.toFixed(value < 10 ? 1 : 0)} ms`;
    case "ops/s":
      return `${formatRate(value)}/s`;
    case "MB/s":
      return value >= 1000
        ? `${(value / 1000).toFixed(1)} GB/s`
        : value > 0 && value < 1
          ? `${value.toFixed(2)} MB/s`
          : value < 10
            ? `${value.toFixed(1)} MB/s`
            : `${value.toFixed(0)} MB/s`;
    case "IOPS":
      return `${formatRate(value)} IOPS`;
    case "files/s":
    case "queries/s":
    case "spawns/s":
      return `${formatRate(value)} ${unit}`;
  }
}

/** The number alone, for a column label whose unit the chart subtitle already gives. */
export function formatShort(value: number, unit: Unit) {
  switch (unit) {
    case "s":
    case "ms":
      return value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : value.toFixed(0);
    case "ops/s":
    case "MB/s":
    case "IOPS":
    case "files/s":
    case "queries/s":
    case "spawns/s":
      return formatRate(value);
  }
}

/** How a chart subtitle names a unit. */
export const unitName = {
  s: "seconds",
  ms: "milliseconds",
  "ops/s": "operations per second",
  "MB/s": "MB per second",
  IOPS: "operations per second",
  "files/s": "files per second",
  "queries/s": "queries per second",
  "spawns/s": "process spawns per second",
} as const satisfies Record<Unit, string>;

export const formatPercent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;

export function formatMoney(value: number, currency: string | null) {
  const symbol = currency === "EUR" ? "€" : "$";
  // Three decimals under a dollar: several hourly prices sit within a few cents of each other.
  return `${symbol}${value < 1 ? value.toFixed(3) : value.toFixed(2)}`;
}

export const formatCount = (value: number) => value.toLocaleString("en-US");

export function formatGiB(value: number) {
  if (value < 1) return `${Math.round(value * 1024)} MB`;
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)} GB`;
}

const shortDate = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** "Oct 19, 2026", or "Oct 19–21, 2026" when runs span several days in one month. */
export function dayRange(window: { start: string; end: string }) {
  const start = new Date(window.start);
  const end = new Date(window.end);
  if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) return shortDate(start, { month: "short", day: "numeric", year: "numeric" });
  if (start.getUTCMonth() === end.getUTCMonth())
    return `${shortDate(start, { month: "short", day: "numeric" })}–${shortDate(end, { day: "numeric" })}, ${start.getUTCFullYear()}`;
  return `${shortDate(start, { month: "short", day: "numeric" })} – ${shortDate(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st: a rank in words. */
export function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
