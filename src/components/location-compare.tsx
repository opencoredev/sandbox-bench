"use client";

import { useId, useState } from "react";

import { Empty, Grid, ProviderCell } from "@/components/location-table";
import { ChartHead } from "@/components/metric-chart";
import type { ProviderId } from "@/lib/providers";
import type { RegionMetric } from "@/lib/regions";

/** One provider and metric, already formatted on the server: a cell per location in data order, then the first-minus-second difference and the spread. */
export interface CompareRow {
  provider: ProviderId;
  metric: string;
  cells: readonly ({ text: string; title: string } | null)[];
  delta: { text: string; favoursFirst: boolean } | null;
  spread: number | null;
}

type CompareMetric = Pick<RegionMetric, "id" | "label" | "sensitivity" | "better">;

const groupLabel = { vantage: "Crosses the network", invariant: "Runs inside the sandbox" } as const satisfies Record<RegionMetric["sensitivity"], string>;

/** Every location side by side for one test, picked from a menu, with the gap between the first two. */
export function LocationCompare({ metrics, regions, rows, providers }: { metrics: readonly CompareMetric[]; regions: readonly string[]; rows: readonly CompareRow[]; providers: readonly ProviderId[] }) {
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "");
  const pickId = useId();
  const metric = metrics.find((m) => m.id === metricId);
  const [first = "", second = ""] = regions;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <ChartHead
          title={`${metric?.label ?? "Test"} from each location`}
          sub={`Median · ${first} − ${second}: negative means ${first} ${metric?.better === "higher" ? "did less" : "was faster"} · Spread: slowest location ÷ fastest`}
        />
        <label htmlFor={pickId} className="mb-4 flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
          Test
          <select
            id={pickId}
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            className="h-9 rounded-md border border-[var(--line)] bg-[var(--band)] px-2.5 text-[13px] text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/60"
          >
            {(["vantage", "invariant"] as const).map((g) => (
              <optgroup key={g} label={groupLabel[g]}>
                {metrics.filter((m) => m.sensitivity === g).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <Grid
        label={`${metric?.label ?? "Test"} by location`}
        corner="Provider"
        head={[...regions.map((r) => ({ key: r, cell: r })), { key: "delta", cell: `${first} − ${second}` }, { key: "spread", cell: "Spread" }]}
        col={9.5}
      >
        {providers.map((id) => {
          const row = rows.find((r) => r.provider === id && r.metric === metricId);
          return (
            <tr key={id}>
              <ProviderCell id={id} />
              {regions.map((r, i) => {
                const c = row?.cells[i];
                return (
                  <td key={r} className="px-3 py-2.5 align-top font-mono text-[13px] tabular-nums" title={c?.title}>
                    {c ? c.text : <Empty />}
                  </td>
                );
              })}
              <td className={`px-3 py-2.5 align-top font-mono text-[13px] tabular-nums ${row?.delta?.favoursFirst ? "" : "text-[var(--muted)]"}`}>{row?.delta ? row.delta.text : <Empty />}</td>
              <td className="px-3 py-2.5 align-top font-mono text-[13px] tabular-nums">{row?.spread ? `×${row.spread.toFixed(1)}` : <Empty />}</td>
            </tr>
          );
        })}
      </Grid>
    </>
  );
}
