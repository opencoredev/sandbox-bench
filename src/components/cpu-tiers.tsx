import type { CSSProperties } from "react";

import { Footnotes } from "@/components/metric-chart";
import type { Track } from "@/lib/data";
import { formatMoney, formatValue } from "@/lib/format";
import type { Unit } from "@/lib/format";
import { markFill, rowFill } from "@/lib/marks";
import { cpuTiers, providerColor, providerName, tierHourly, tierSources } from "@/lib/providers";
import type { CpuTier, ProviderId, TieredProvider } from "@/lib/providers";
import { headlineRows, profileInfo, runTrackOf } from "@/lib/realistic";
import type { ProfileId, RealisticData } from "@/lib/realistic";
import type { RealtaskBurst } from "@/lib/realtask-burst";

/** One cell: a number, or why there isn't one. */
type Reading = { kind: "value"; value: number; text: string } | { kind: "none"; why: string };

interface Line {
  label: string;
  better: "lower" | "higher";
  /** Group heading the line sits under. */
  group: string;
  readings: readonly Reading[];
}

/** The quick tests that a CPU tier can move: start-up, agent steps, and the machine itself. */
const quick = [
  ["cold", "Cold start"],
  ["command", "Run a command"],
  ["tool-replay", "100 tool calls"],
  ["files-10mb", "Write + read 10 MB"],
  ["git-clone", "git clone"],
  ["npm-install", "npm install"],
  ["pip-install", "pip install"],
  ["cpu-single", "CPU, one core"],
  ["cpu-all", "CPU, all cores"],
  ["memory", "Memory bandwidth"],
  ["disk-write", "Disk write"],
] as const;

const notYet: Reading = { kind: "none", why: "Not run yet" };

function metricReading(track: Track, metricId: string, id: ProviderId): Reading {
  const metric = track.metric(metricId);
  const v = metric.values.find((x) => x.provider === id);
  if (!v || v.n === 0 || v.p50 === null) return notYet;
  return { kind: "value", value: v.p50, text: formatValue(v.p50, metric.unit) };
}

const seconds = (s: number) => formatValue(s, "s" satisfies Unit);
const perThousand = (usd: number) => formatMoney(usd * 1000, "USD");

function taskReadings(realistic: RealisticData, track: Track, profile: ProfileId, tiers: readonly CpuTier[]) {
  const { costed, uncosted } = headlineRows(realistic, runTrackOf[track.id], profile);
  const row = (id: ProviderId) => costed.find((r) => r.provider === id) ?? uncosted.find((r) => r.provider === id);
  const time = tiers.map((t): Reading => {
    const r = row(t.id);
    return r?.medianWallS != null ? { kind: "value", value: r.medianWallS, text: seconds(r.medianWallS) } : notYet;
  });
  const cost = tiers.map((t): Reading => {
    const r = costed.find((x) => x.provider === t.id);
    return r ? { kind: "value", value: r.cost.usdPerCompleted, text: perThousand(r.cost.usdPerCompleted) } : notYet;
  });
  return { time, cost };
}

function burstReadings(burst: RealtaskBurst, tiers: readonly CpuTier[]): Reading[] {
  return tiers.map((t) => {
    const p = burst.providers.find((x) => x.provider === t.id);
    if (!p) return notYet;
    if (p.status === "not-run") return { kind: "none", why: "Not run" };
    return p.medianWallS === null ? { kind: "none", why: "None finished" } : { kind: "value", value: p.medianWallS, text: seconds(p.medianWallS) };
  });
}

/** Every line of the comparison for one provider's tiers on one track. */
export function tierLines({ track, tiers, realistic, burst }: { track: Track; tiers: readonly CpuTier[]; realistic: RealisticData; burst: RealtaskBurst }): Line[] {
  const lines: Line[] = quick.map(([id, label]) => ({
    label,
    better: track.metric(id).better,
    group: "Quick tests",
    readings: tiers.map((t) => metricReading(track, id, t.id)),
  }));
  for (const profile of ["fix-and-test", "build"] as const) {
    const { time, cost } = taskReadings(realistic, track, profile, tiers);
    lines.push({ label: `${profileInfo[profile].label}, time`, better: "lower", group: "Real tasks", readings: time });
    lines.push({ label: `${profileInfo[profile].label}, cost per 1,000`, better: "lower", group: "Real tasks", readings: cost });
  }
  // Bursts of real tasks ran on the same-machine track only, one run at a time; the line shows once every tier has one in the published run.
  const burstLine = burstReadings(burst, tiers);
  if (track.id === "same-spec" && burstLine.every((r) => r.kind === "value"))
    lines.push({ label: `${profileInfo["fix-and-test"].label}, 5 at once`, better: "lower", group: "Real tasks", readings: burstLine });
  return lines;
}

/**
 * How a tier compares with the provider's first: "2.4× slower", "same". A
 * difference under 5% is called the same: run-to-run spread on one tier is
 * about that much.
 */
export function relative(base: Reading | undefined, r: Reading, better: "lower" | "higher", cost: boolean): string | null {
  if (!base || base.kind !== "value" || r.kind !== "value" || base.value <= 0 || r.value <= 0) return null;
  const worse = better === "lower" ? r.value / base.value : base.value / r.value;
  if (Math.abs(worse - 1) < 0.05) return "same";
  if (cost) return r.value < base.value ? `${Math.round((1 - r.value / base.value) * 100)}% less` : `${(r.value / base.value).toFixed(1)}× more`;
  const times = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(1));
  return worse > 1 ? `${times(worse)}× slower` : `${times(1 / worse)}× faster`;
}

/** The share of the line's longest bar this reading fills. */
const share = (line: Line, r: Reading) => {
  const max = Math.max(...line.readings.flatMap((x) => (x.kind === "value" ? [x.value] : [])));
  return r.kind === "value" && max > 0 ? r.value / max : 0;
};

const Swatch = ({ id }: { id: ProviderId }) => (
  <span aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px]" style={markFill(rowFill(id, "solid"), providerColor(id))} />
);

/** Phones: the tiers side by side, a line's label above them. Wider: the label in its own first column. */
const gridClass = "grid grid-cols-[repeat(var(--tiers),minmax(0,1fr))] sm:grid-cols-[minmax(9rem,1.1fr)_repeat(var(--tiers),minmax(0,1fr))]";
const grid = (n: number): CSSProperties => ({ "--tiers": n });

/**
 * One provider's CPU tiers side by side on the same machine and the same
 * tests: a column per tier, a line per test, each value with how it compares
 * to the tier a new account gets. Every tier shows here whatever the tier switch says.
 */
export function TierTable({ brand, track, realistic, burst }: { brand: TieredProvider; track: Track; realistic: RealisticData; burst: RealtaskBurst }) {
  const tiers: readonly CpuTier[] = cpuTiers[brand];
  const lines = tierLines({ track, tiers, realistic, burst });
  const machine = track.providers.find((p) => p.id === brand)?.measuredAllocations[0];
  const groups = [...new Set(lines.map((l) => l.group))];
  const source = tierSources[brand];
  // The hardware and place each tier's sandboxes ran on, from the main run's fingerprints.
  const where = tiers.flatMap((t) => {
    const h = track.providers.find((p) => p.id === t.id)?.hardware;
    const place = h?.location[0]?.value;
    return h && place ? [`${t.name} on ${h.vendor} hosts in ${place}`] : [];
  });
  return (
    <figure aria-label={`${providerName(brand)}'s CPU tiers compared`} className="flex flex-col gap-m">
      {/* Phones: one block per line, the tiers side by side under its label. Wider: one grid, a column per tier. */}
      <div role="table" aria-label={`${providerName(brand)} CPU tiers`} className="text-s">
        <div role="row" className={`${gridClass} items-end gap-x-s pb-s sm:gap-x-m`} style={grid(tiers.length)}>
          <span role="columnheader" className="sr-only text-xs text-neutral-7 sm:not-sr-only">
            {machine ? `${machine.cpu} vCPU, ${machine.memoryGiB} GB` : "Tier"}
          </span>
          {tiers.map((t) => (
            <span role="columnheader" key={t.id} className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-neutral-10">
                <Swatch id={t.id} />
                {t.name}
              </span>
              <span className="font-mono text-xs text-neutral-8 tabular-nums">
                {machine ? `${formatMoney(tierHourly(t, machine), "USD")}/h` : null}
              </span>
              <span className="hidden text-xxs leading-tight text-pretty text-neutral-7 sm:block">{t.promise}</span>
            </span>
          ))}
        </div>
        {groups.map((group) => (
          <div key={group} role="rowgroup" className="border-t border-neutral-3">
            <div role="row" className="pt-s pb-xxs text-xs text-neutral-7">
              <span role="rowheader" aria-colspan={tiers.length + 1}>
                {group}
              </span>
            </div>
            {lines
              .filter((l) => l.group === group)
              .map((line) => (
                <div key={line.label} role="row" className={`${gridClass} items-center gap-x-s gap-y-1 py-1.5 sm:gap-x-m`} style={grid(tiers.length)}>
                  <span role="rowheader" className="col-span-full min-w-0 text-xs text-neutral-8 sm:col-span-1 sm:text-s">
                    {line.label}
                  </span>
                  {line.readings.map((r, i) => {
                    const t = tiers[i];
                    if (!t) return null;
                    const rel = i === 0 ? null : relative(line.readings[0], r, line.better, line.label.includes("cost"));
                    return (
                      <span role="cell" key={t.id} className="flex min-w-0 flex-col gap-1">
                        {r.kind === "value" ? (
                          <>
                            <span className="flex flex-wrap items-baseline gap-x-xs">
                              <span className="font-mono text-xs text-neutral-10 tabular-nums sm:text-s">{r.text}</span>
                              {rel ? <span className="text-xxs whitespace-nowrap text-neutral-7">{rel}</span> : null}
                            </span>
                            <span aria-hidden className="block h-2.5 rounded-r-xs" style={{ width: `${Math.max(share(line, r) * 100, 2)}%`, ...markFill(rowFill(t.id, "solid"), providerColor(t.id)) }} />
                          </>
                        ) : (
                          <span className="text-xs text-neutral-6">{r.why}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
          </div>
        ))}
      </div>
      <Footnotes
        items={[
          { text: <>Medians. Each tier runs the same tests on the same 4 vCPU, 8 GB sandbox, chosen with Beam&apos;s per-sandbox CPU tier setting. Prices are list rates from <a className="underline decoration-neutral-6 underline-offset-2 hover:text-neutral-10" href={source.url}>{source.url.replace(/^https:\/\//, "")}</a>, checked {source.checked}.</> },
          { text: source.note },
          ...(where.length > 1 ? [{ text: <>Where each tier ran, from our runs&apos; fingerprints: {where.join("; ")}. A tier can land on different hardware and in a different place, so calls that cross the network (commands, files, clones, tool calls) also reflect distance from our server in Florida.</> }] : []),
          { text: "Bars are sized within each line, so they show how far apart the tiers are, not which provider is fastest. Faster or slower is against the first tier, the one a new account gets." },
          { text: <>Ranks, headline numbers and Cheapest elsewhere on the site use {tiers[0]?.name ?? "the first tier"}. {tiers.filter((t) => t.preemptible).map((t) => `${providerName(t.id)} can be stopped before a task ends. `).join("")}</> },
        ]}
      />
    </figure>
  );
}

/** The providers with more than one tier that have results for at least two tiers on this track. */
export function tieredWithData(track: Track): TieredProvider[] {
  const brands = Object.keys(cpuTiers).filter((b): b is TieredProvider => Object.hasOwn(cpuTiers, b));
  return brands.filter((b) => cpuTiers[b].filter((t) => track.providers.some((p) => p.id === t.id)).length >= 2);
}

