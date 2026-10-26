import { LocationCompare } from "@/components/location-compare";
import type { CompareRow } from "@/components/location-compare";
import { ChartHead, Footnotes } from "@/components/metric-chart";
import { Empty, Grid, Place, ProviderCell, ProviderLabel, RowHead } from "@/components/location-table";
import { TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { Tracked } from "@/components/track";
import { tracks } from "@/lib/data";
import { dayRange, formatValue } from "@/lib/format";
import { deltaFavoursFirst, deltaOf, formatDelta, median, regional, rowOf, sampleRange, spreadOf } from "@/lib/regions";
import type { RegionCell, RegionMetric, RegionalData, Sensitivity, Vantage } from "@/lib/regions";
import { trackInfo } from "@/lib/tracks";

// Direction: the same quiet tables as Reliability and Hardware, so this reads
// as one more card on the page, not a new product. Numbers in Geist Mono, the
// location as a small outlined chip, the gap between locations as "×1.7".
// One idea per view: Combined says how much location matters, each location
// view splits tests into the ones that move with distance and the ones that
// should not, Compare puts two locations side by side for one test.

const groups = {
  vantage: { title: "Crosses the network on every call", sub: "Every call travels from our runner to the provider, so where the runner sits changes these" },
  invariant: { title: "Runs inside the sandbox", sub: "The work happens on the provider's machine, so these should not change with location" },
} as const satisfies Record<Sensitivity, { title: string; sub: string }>;

const groupOrder = ["vantage", "invariant"] as const satisfies readonly Sensitivity[];

const regionLabel = (data: RegionalData, id: string) => data.regions.find((r) => r.id === id)?.label ?? id;

/** "Gravelines, FR · OVH SAS · OVH Gravelines, FR, small · 2 runs", from whatever the runner reported. */
function caption(v: Vantage) {
  const place = [v.city, v.country].filter((x) => x !== null).join(", ");
  const host = v.host ? [v.host.location, v.host.serverType].filter((x) => x !== null).join(", ") : null;
  return [place || null, v.network ? `${v.network} network` : null, host ? `Runner: ${host}` : null, `${v.runs} ${v.runs === 1 ? "run" : "runs"}`]
    .filter((x) => x !== null)
    .join(" · ");
}

/** "Cold start in EU-Central: median 0.67 s, p95 0.73 s, 3 runs". */
const cellTitle = (m: RegionMetric, where: string, c: RegionCell) =>
  `${m.label} from ${where}: median ${formatValue(c.p50, m.unit)}${c.p95 === null ? "" : `, p95 ${formatValue(c.p95, m.unit)}`}, ${c.n} ${c.n === 1 ? "run" : "runs"}${c.failures ? `, ${c.failures} failed` : ""}`;

const providerHead = (data: RegionalData) => data.providers.map((id) => ({ key: id, cell: <ProviderLabel id={id} /> }));

/** Site providers this collection has no results for, in one line rather than a row each. */
function Unmeasured({ data }: { data: RegionalData }) {
  const others = tracks[data.track].providers.map((p) => p.id).filter((id) => !data.providers.includes(id));
  if (others.length === 0) return null;
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="text-[12px] text-[var(--muted)]">Not measured by location yet</p>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
        {others.map((id) => (
          <li key={id}>
            <ProviderLabel id={id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** For each provider, the network-sensitive tests at their best location, and how much worse the worst location was. */
function Combined({ data }: { data: RegionalData }) {
  const metrics = data.metrics.filter((m) => m.sensitivity === "vantage");
  return (
    <>
      <ChartHead
        title="Best location for each provider"
        sub={`Tests that cross the network · Median from the fastest of ${data.regions.map((r) => r.label).join(" and ")}, then how many times slower the slowest was · Lower is better`}
      />
      <Grid label="Best location per provider" corner="Test" head={providerHead(data)}>
        {metrics.map((m) => (
          <tr key={m.id}>
            <RowHead>{m.label}</RowHead>
            {data.providers.map((id) => {
              const row = rowOf(data, id, m.id);
              const spread = row ? spreadOf(row, m) : null;
              const best = spread ? row?.cells.get(spread.best) : undefined;
              const titles = row ? [...row.cells].map(([r, c]) => cellTitle(m, regionLabel(data, r), c)).join("\n") : undefined;
              return (
                <td key={id} className="px-3 py-2.5 align-top" title={titles}>
                  {spread && best ? (
                    <>
                      <span className="block font-mono text-[13px] tabular-nums">{formatValue(best.p50, m.unit)}</span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <Place>{regionLabel(data, spread.best)}</Place>
                        <span className="font-mono text-[11px] text-[var(--muted)] tabular-nums">×{spread.ratio.toFixed(1)}</span>
                      </span>
                    </>
                  ) : (
                    <Empty />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </Grid>
      <Unmeasured data={data} />
    </>
  );
}

/** The middle gap between locations across every provider and test in a group: the number that says whether location matters. */
function typicalGap(data: RegionalData, metrics: readonly RegionMetric[]) {
  const ratios = metrics.flatMap((m) =>
    data.rows.flatMap((r) => {
      if (r.metric !== m.id) return [];
      const s = spreadOf(r, m);
      return s ? [s.ratio] : [];
    }),
  );
  return median(ratios);
}

/** One location's results, network tests first, each with its difference from the next location in the data. */
function Location({ data, here }: { data: RegionalData; here: Vantage }) {
  const other = data.regions.find((r) => r.id !== here.id);
  return (
    <>
      <ChartHead title={`Measured from ${here.label}`} sub={caption(here)} />
      <div className="flex flex-col gap-8">
        {groupOrder.map((g) => {
          const metrics = data.metrics.filter((m) => m.sensitivity === g);
          if (metrics.length === 0) return null;
          const gap = other ? typicalGap(data, metrics) : null;
          return (
            <div key={g}>
              <div className="mb-3">
                <h4 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px] font-medium">
                  {groups[g].title}
                  {gap !== null && other ? (
                    <span className="text-[12px] font-normal text-[var(--muted)]">
                      typical gap between locations <span className="font-mono text-[14px] text-[var(--foreground)] tabular-nums">×{gap.toFixed(1)}</span>
                    </span>
                  ) : null}
                </h4>
                <p className="mt-1 max-w-[72ch] text-[12px] leading-snug text-[var(--muted)]">
                  {groups[g].sub}
                  {other ? `. Beside each value: the difference from ${other.label}.` : "."}
                </p>
              </div>
              <Grid label={`${groups[g].title}, from ${here.label}`} corner="Test" head={providerHead(data)}>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <RowHead>{m.label}</RowHead>
                    {data.providers.map((id) => {
                      const row = rowOf(data, id, m.id);
                      const cell = row?.cells.get(here.id);
                      const there = other ? row?.cells.get(other.id) : undefined;
                      const delta = cell && there ? deltaOf(m, cell, there) : null;
                      return (
                        <td key={id} className="px-3 py-2.5 align-top" title={cell ? cellTitle(m, here.label, cell) : undefined}>
                          {cell ? (
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-mono text-[13px] tabular-nums">{formatValue(cell.p50, m.unit)}</span>
                              {delta && other ? (
                                <span className={`font-mono text-[11px] tabular-nums ${deltaFavoursFirst(m, delta) ? "text-[var(--foreground)]/85" : "text-[var(--muted)]"}`}>
                                  {formatDelta(delta)}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <Empty />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Grid>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Runner-to-provider-API round trips from the preflight check: the distance every network test pays. */
function Distance({ data }: { data: RegionalData }) {
  const providers = data.providers.filter((id) => data.rtt.some((r) => r.provider === id));
  const max = Math.max(1, ...data.rtt.map((r) => r.tcpMs ?? 0));
  return (
    <>
      <ChartHead title="Network distance to each provider" sub="Median round trip from each runner to the provider's API, before any test · TCP connect, then first byte of a request · Lower is closer" />
      <Grid label="Network distance" corner="Provider" head={data.regions.map((r) => ({ key: r.id, cell: r.label }))} col={13}>
        {providers.map((id) => (
          <tr key={id}>
            <ProviderCell id={id} />
            {data.regions.map((r) => {
              const t = data.rtt.find((x) => x.provider === id && x.region === r.id);
              return (
                <td key={r.id} className="px-3 py-2.5 align-top">
                  {t && t.tcpMs !== null ? (
                    <>
                      <span className="flex items-center gap-3">
                        <span className="w-14 shrink-0 font-mono text-[13px] tabular-nums">{formatValue(t.tcpMs, "ms")}</span>
                        <span aria-hidden className="h-1.5 min-w-0 flex-1 rounded-full bg-[var(--grid)]">
                          <span className="block h-full rounded-full bg-[var(--foreground)]/70" style={{ width: `${Math.max(2, (t.tcpMs / max) * 100)}%` }} />
                        </span>
                      </span>
                      <span className="mt-1 block text-[11px] text-[var(--muted)]">
                        First byte {t.firstByteMs === null ? "not measured" : formatValue(t.firstByteMs, "ms")}
                      </span>
                    </>
                  ) : (
                    <Empty />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </Grid>
    </>
  );
}

/** Rows for the Compare view, worked out here so the client gets plain values: one cell per location, the first-minus-second difference and the spread. */
function compareRows(data: RegionalData, first: Vantage, second: Vantage): CompareRow[] {
  return data.rows.flatMap((r) => {
    const m = data.metrics.find((x) => x.id === r.metric);
    if (!m) return [];
    const a = r.cells.get(first.id);
    const b = r.cells.get(second.id);
    const delta = a && b ? deltaOf(m, a, b) : null;
    return [
      {
        provider: r.provider,
        metric: r.metric,
        cells: data.regions.map((v) => {
          const c = r.cells.get(v.id);
          return c ? { text: formatValue(c.p50, m.unit), title: cellTitle(m, v.label, c) } : null;
        }),
        delta: delta ? { text: formatDelta(delta), favoursFirst: deltaFavoursFirst(m, delta) } : null,
        spread: spreadOf(r, m)?.ratio ?? null,
      },
    ];
  });
}

/**
 * Results by the location the benchmark ran from. Its own collection, apart
 * from the headline run, so its numbers never enter the charts above.
 */
export function ByLocation({ data = regional }: { data?: RegionalData }) {
  const sample = sampleRange(data);
  const [first, second] = data.regions;
  const notes = [
    {
      text: `A separate, smaller collection than the rest of the page: ${sample ? (sample.min === sample.max ? sample.max : `${sample.min} to ${sample.max}`) : "no"} runs per test from each location, ${dayRange(data.window)}. Medians this small can move between runs, so read large gaps, not small ones. Hover a value for its p95 and run count.`,
    },
    { text: "Runs in is where each provider's sandboxes ran in our hardware probe, not where our runner was." },
    { text: `${trackInfo[data.track].label} only. Batch ${data.batchId}, benchmark commit ${data.commit.slice(0, 7)}.` },
  ];
  const tabs: Tab[] = [
    { id: "combined", label: "Combined", content: <Combined data={data} /> },
    ...data.regions.map((r) => ({ id: r.id, label: r.label, content: <Location data={data} here={r} /> })),
    ...data.planned.map((r) => ({ id: r.id, label: r.label, unavailable: "not measured yet" })),
    ...(first && second
      ? [
          {
            id: "compare",
            label: "Compare",
            content: (
              <LocationCompare
                metrics={data.metrics.map((m) => ({ id: m.id, label: m.label, sensitivity: m.sensitivity, better: m.better }))}
                regions={data.regions.map((r) => r.label)}
                rows={compareRows(data, first, second)}
                providers={data.providers}
              />
            ),
          },
        ]
      : []),
    ...(data.rtt.length > 0 ? [{ id: "distance", label: "Network distance", content: <Distance data={data} /> }] : []),
  ];
  return (
    <>
      <Tracked>
        {(track) =>
          track.id === data.track ? null : (
            <p className="mb-3 text-[12.5px] leading-snug text-[var(--muted)]">
              This collection ran {trackInfo[data.track].label.toLowerCase()} only, so it shows those machines whichever track is selected.
            </p>
          )
        }
      </Tracked>
      <TabCard label="Location" section="locations" tabs={tabs.map((t) => ("content" in t ? { ...t, content: <>{t.content}<Footnotes items={notes} /></> } : t))} />
    </>
  );
}
