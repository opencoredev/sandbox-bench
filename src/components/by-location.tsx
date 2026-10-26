import { Disclosure } from "@/components/disclosure";
import { Empty, Grid, Place } from "@/components/location-table";
import { ChartHead, Who } from "@/components/metric-chart";
import { ProviderName } from "@/components/provider-name";
import { TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { dayRange, formatCount, formatValue } from "@/lib/format";
import { hardware } from "@/lib/hardware";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { regional, rowOf, sampleRange, standingOf } from "@/lib/regions";
import type { RegionCell, RegionId, RegionMetric, Vantage } from "@/lib/regions";

/**
 * The section for SBX-66: how each provider performs when called from
 * different client locations.
 *
 * Simplified per [t19u]:
 * - Default view and single-region tabs each lead with ONE compact visual
 *   (horizontal bars per provider + one headline number + one speed-multiplier
 *   chip).
 * - In-sandbox invariant metrics (CPU, memory, disk, npm, git) are omitted
 *   by default with a one-line quiet note.
 * - Tiny gray +/- cell deltas are dropped in favour of visual bars and chips.
 * - Fewer tabs: All locations / EU-Central / US-East / US-West (soon), with an
 *   optional Disclosure expander for the full network-sensitive table.
 */

const HEADLINE_IDS = ["cold", "command", "files-10mb", "tool-replay"] as const;

const cellTip = (c: RegionCell, m: RegionMetric) => {
  const attempts = c.n + c.failures;
  return [
    `median ${formatValue(c.p50, m.unit)}`,
    ...(c.p95 === null ? [] : [`p95 ${formatValue(c.p95, m.unit)}`]),
    `${formatCount(attempts)} ${attempts === 1 ? "attempt" : "attempts"}${c.failures ? `, ${formatCount(c.failures)} failed` : ""}`,
  ].join(" · ");
};

const sampleLine = () => {
  const range = sampleRange(regional);
  const runs = !range ? null : range.min === range.max ? `${range.min} runs per test` : `${range.min}–${range.max} runs per test`;
  return [dayRange(regional.window), runs].filter(Boolean).join(" · ");
};

/** Compact horizontal bar pair comparing EU-Central vs US-East for one provider and metric, plus a single winner chip. */
function ProviderLocationRow({
  provider,
  metric,
  regions,
  maxP50,
}: {
  provider: ProviderId;
  metric: RegionMetric;
  regions: readonly Vantage[];
  maxP50: number;
}) {
  const row = rowOf(regional, provider, metric.id);
  const standing = row ? standingOf(row, metric) : null;
  const labelOf = (id: RegionId) => regions.find((r) => r.id === id)?.label ?? id;
  const hw = hardware[provider];
  const color = providerColor(provider);

  const badge = (() => {
    if (!standing || standing.locations < 2 || standing.spread === null) {
      if (standing && standing.locations === 1) {
        return { text: `${labelOf(standing.fastest[0])} only`, fast: false };
      }
      return null;
    }
    if (standing.fastest.length > 1) {
      return { text: "Tied across locations", fast: false };
    }
    const winner = labelOf(standing.fastest[0]);
    return {
      text: `×${standing.spread.toFixed(1)} faster from ${winner}`,
      fast: true,
    };
  })();

  return (
    <div className="grid grid-cols-1 gap-s py-s sm:grid-cols-[11rem_1fr_11.5rem] sm:items-center sm:gap-5">
      <div>
        <span className="block text-s font-medium" style={{ color }}>
          <ProviderName id={provider} />
        </span>
        <span className="mt-0.5 block text-xs text-neutral-7">
          {hw.regionShort ? `Sandbox in ${hw.regionShort}` : "API in Virginia"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {regions.map((r) => {
          const cell = row?.cells.get(r.id);
          const isFastest = standing ? standing.fastest.includes(r.id) : false;
          const pct = cell && maxP50 > 0 ? Math.max(4, Math.min(100, (cell.p50 / maxP50) * 100)) : 0;
          return (
            <div key={r.id} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2.5 text-xs">
              <span className={`truncate ${isFastest ? "font-medium text-neutral-10" : "text-neutral-7"}`}>
                {r.label}
              </span>
              <div className="h-2 overflow-hidden rounded-xs bg-neutral-3">
                {cell ? (
                  <div
                    className="h-full rounded-xs"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isFastest ? color : "var(--neutral-6)",
                      opacity: isFastest ? 0.9 : 0.45,
                    }}
                    title={cellTip(cell, metric)}
                  />
                ) : null}
              </div>
              <span
                className={`text-right font-mono text-xs tabular-nums ${
                  cell ? (isFastest ? "font-medium text-neutral-10" : "text-neutral-7") : "text-neutral-7/50"
                }`}
                title={cell ? cellTip(cell, metric) : undefined}
              >
                {cell ? formatValue(cell.p50, metric.unit) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex sm:justify-end">
        {badge ? (
          <span
            className={`inline-flex items-center rounded-s px-2 py-1 font-mono text-xs tabular-nums ${
              badge.fast ? "bg-neutral-3 text-neutral-10" : "text-neutral-7"
            }`}
          >
            {badge.text}
          </span>
        ) : (
          <Empty />
        )}
      </div>
    </div>
  );
}

/** Compact overview: 1 primary bar comparison (Cold start) + 3 compact headline cards + optional Details expander. */
function OverviewPanel() {
  const { regions, metrics, providers } = regional;
  const vantageMetrics = metrics.filter((m) => m.sensitivity === "vantage");
  const primary = vantageMetrics.find((m) => m.id === "cold") ?? vantageMetrics[0];
  const secondary = HEADLINE_IDS.slice(1)
    .map((id) => vantageMetrics.find((m) => m.id === id))
    .filter((m): m is RegionMetric => m !== undefined);

  if (!primary) return null;

  const maxPrimary = Math.max(
    0,
    ...providers.flatMap((p) => {
      const r = rowOf(regional, p, primary.id);
      return r ? [...r.cells.values()].map((c) => c.p50) : [];
    }),
  );

  const labelOf = (id: RegionId) => regions.find((r) => r.id === id)?.label ?? id;

  return (
    <>
      <ChartHead
        title={`${primary.label} by caller location`}
        sub="Median time from each caller location · Colored bar marks the faster location · Lower is better"
        meta={sampleLine()}
      />

      <div className="flex flex-col">
        {providers.map((id) => (
          <ProviderLocationRow key={id} provider={id} metric={primary} regions={regions} maxP50={maxPrimary} />
        ))}
      </div>

      {secondary.length > 0 ? (
        <div className="mt-l grid grid-cols-1 gap-s sm:grid-cols-3">
          {secondary.map((m) => (
            <div key={m.id} className="rounded-m bg-neutral-3/60 p-m">
              <div className="flex items-baseline justify-between gap-xs">
                <h4 className="text-s font-medium">{m.label}</h4>
                <span className="text-xxs text-neutral-7">fastest location</span>
              </div>
              <dl className="mt-2.5 flex flex-col gap-1.5 text-xs">
                {providers.map((id) => {
                  const row = rowOf(regional, id, m.id);
                  const s = row ? standingOf(row, m) : null;
                  return (
                    <div key={id} className="flex items-baseline justify-between gap-xs">
                      <dt className="truncate">
                        <Who id={id} />
                      </dt>
                      <dd className="flex shrink-0 items-baseline gap-1.5 font-mono tabular-nums">
                        {s ? (
                          <>
                            <span>{formatValue(s.cell.p50, m.unit)}</span>
                            <Place>{s.fastest.length > 1 ? "tie" : labelOf(s.fastest[0])}</Place>
                            {s.spread !== null && s.fastest.length === 1 ? (
                              <span className="text-xxs text-neutral-7">×{s.spread.toFixed(1)}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="font-sans text-xxs text-neutral-7">—</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      ) : null}

      <DetailsExpander metrics={vantageMetrics} />

      <p className="mt-s text-xs text-neutral-7">
        In-sandbox CPU, memory, disk, and package install speed do not change with caller location and are omitted here.
      </p>
    </>
  );
}

/** Single-region tab: ONE compact visual (Cold start bar + HTTPS first byte + speed chip vs other location) + optional Details expander. */
function SingleLocationPanel({ region }: { region: Vantage }) {
  const { regions, metrics, providers, rtt } = regional;
  const vantageMetrics = metrics.filter((m) => m.sensitivity === "vantage");
  const primary = vantageMetrics.find((m) => m.id === "cold") ?? vantageMetrics[0];
  const place = [region.city, region.country].filter(Boolean).join(", ");
  const labelOf = (id: RegionId) => regions.find((r) => r.id === id)?.label ?? id;

  const entries = providers.map((id) => {
    const row = primary ? rowOf(regional, id, primary.id) : undefined;
    const cell = row?.cells.get(region.id) ?? null;
    const standing = row && primary ? standingOf(row, primary) : null;
    const probe = rtt.find((r) => r.region === region.id && r.provider === id);
    return { id, cell, standing, firstByteMs: probe?.firstByteMs ?? null };
  });

  // Sort measured providers fastest-first for this location, unmeasured last.
  const sorted = [...entries].sort((a, b) => {
    if (a.cell && b.cell) return a.cell.p50 - b.cell.p50;
    if (a.cell) return -1;
    if (b.cell) return 1;
    return (a.firstByteMs ?? 9999) - (b.firstByteMs ?? 9999);
  });

  const maxP50 = Math.max(0, ...sorted.map((e) => e.cell?.p50 ?? 0));

  return (
    <>
      <ChartHead
        title={`Cold start from ${region.label}${place ? ` (${place})` : ""}`}
        sub={`Median cold start and HTTPS first byte from ${region.network ?? region.label} · Lower is better`}
      />

      <div className="flex flex-col">
        {sorted.map(({ id, cell, standing, firstByteMs }) => {
          const hw = hardware[id];
          const color = providerColor(id);
          const pct = cell && maxP50 > 0 ? Math.max(4, Math.min(100, (cell.p50 / maxP50) * 100)) : 0;

          const chip = (() => {
            if (!cell) return null;
            if (!standing || standing.locations < 2 || standing.spread === null) return null;
            if (standing.fastest.length > 1) return { text: "Tied across locations", highlight: false };
            const winner = standing.fastest[0];
            if (winner === region.id) {
              return { text: `×${standing.spread.toFixed(1)} faster here`, highlight: true };
            }
            return { text: `×${standing.spread.toFixed(1)} faster from ${labelOf(winner)}`, highlight: false };
          })();

          return (
            <div key={id} className="grid grid-cols-1 gap-2.5 py-s sm:grid-cols-[11rem_1fr_7rem_11.5rem] sm:items-center sm:gap-m">
              <div>
                <span className="block text-s font-medium" style={{ color }}>
                  <ProviderName id={id} />
                </span>
                <span className="mt-0.5 block text-xs text-neutral-7">
                  {hw.regionShort ? `Sandbox in ${hw.regionShort}` : "API in Virginia"}
                </span>
              </div>

              <div className="flex items-center gap-s">
                <div className="h-2.5 flex-1 overflow-hidden rounded-xs bg-neutral-3">
                  {cell && primary ? (
                    <div
                      className="h-full rounded-xs"
                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
                      title={cellTip(cell, primary)}
                    />
                  ) : null}
                </div>
                <span
                  className="w-14 shrink-0 text-right font-mono text-s font-medium tabular-nums"
                  title={cell && primary ? cellTip(cell, primary) : undefined}
                >
                  {cell && primary ? formatValue(cell.p50, primary.unit) : <span className="font-normal text-neutral-7">—</span>}
                </span>
              </div>

              <div className="font-mono text-xs text-neutral-7 tabular-nums sm:text-right">
                {firstByteMs !== null ? `${formatValue(firstByteMs, "ms")} 1st byte` : "—"}
              </div>

              <div className="flex sm:justify-end">
                {chip ? (
                  <span
                    className={`inline-flex items-center rounded-s px-2 py-1 font-mono text-xs tabular-nums ${
                      chip.highlight ? "bg-neutral-3 text-neutral-10" : "text-neutral-7"
                    }`}
                  >
                    {chip.text}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <DetailsExpander metrics={vantageMetrics} onlyRegion={region} />

      <p className="mt-s text-xs text-neutral-7">
        In-sandbox CPU, memory, disk, and package install speed do not change with caller location and are omitted here.
      </p>
    </>
  );
}

/** Quiet Disclosure expander for the full network-sensitive table when a reader wants every test. */
function DetailsExpander({ metrics, onlyRegion }: { metrics: readonly RegionMetric[]; onlyRegion?: Vantage }) {
  const { regions, providers } = regional;
  const labelOf = (id: RegionId) => regions.find((r) => r.id === id)?.label ?? id;

  return (
    <Disclosure
      className="mt-l gap-s"
      triggerClassName="w-fit justify-start text-s text-neutral-7 hover:text-neutral-10"
      summary={`Details (${metrics.length} network-sensitive tests)`}
    >
      <Grid
        label="All network-sensitive tests"
        corner="Test"
        first={12}
        col={8.5}
        head={providers.map((id) => ({
          key: id,
          cell: (
            <span className="font-medium" style={{ color: providerColor(id) }}>
              <ProviderName id={id} />
            </span>
          ),
        }))}
      >
        {metrics.map((m) => (
          <tr key={m.id}>
            <th scope="row" className="sticky left-0 z-10 bg-neutral-2 py-xs pr-m text-left align-top text-xs font-normal text-neutral-7">
              {m.label}
            </th>
            {providers.map((id) => {
              const row = rowOf(regional, id, m.id);
              if (onlyRegion) {
                const cell = row?.cells.get(onlyRegion.id);
                return (
                  <td key={id} className="px-s py-xs align-top font-mono text-xs tabular-nums" title={cell ? cellTip(cell, m) : undefined}>
                    {cell ? formatValue(cell.p50, m.unit) : <Empty />}
                  </td>
                );
              }
              const s = row ? standingOf(row, m) : null;
              return (
                <td key={id} className="px-s py-xs align-top font-mono text-xs tabular-nums" title={s ? cellTip(s.cell, m) : undefined}>
                  {s ? (
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span>{formatValue(s.cell.p50, m.unit)}</span>
                      <Place>{s.fastest.length > 1 ? "tie" : labelOf(s.fastest[0])}</Place>
                    </div>
                  ) : (
                    <Empty />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </Grid>
    </Disclosure>
  );
}

export function ByLocation() {
  const { regions, planned } = regional;
  const tabs: Tab[] = [
    { id: "combined", label: "All locations", content: <OverviewPanel /> },
    ...regions.map((r): Tab => ({ id: r.id, label: r.label, content: <SingleLocationPanel region={r} /> })),
    ...planned.map((r): Tab => ({ id: r.id, label: r.label, unavailable: "soon" })),
  ];

  return <TabCard label="By location" section="locations" tabs={tabs} />;
}
