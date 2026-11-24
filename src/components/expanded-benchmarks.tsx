import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, NotOnChart } from "@/components/metric-chart";
import { deferTabs } from "@/components/lazy-tabs";
import { TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { expandedProviders, groupHasValues, hasExpanded, hasValues } from "@/lib/expanded";
import type { Expanded, ExpandedGroup, ExpandedMetric } from "@/lib/expanded";
import { formatCount, formatShort, formatValue, unitName } from "@/lib/format";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** The section id, for the page and any link that opens a tab: `#expanded/builds`. */
export const expandedSection = "expanded";

const betterText = (m: ExpandedMetric) => (m.better === "lower" ? "Lower is better" : "Higher is better");

export function expandedColumns(m: ExpandedMetric): Column[] {
  return m.values.map((v) => ({
    provider: v.provider,
    label: formatShort(v.median, m.unit),
    segments: [{ value: v.median, color: providerColor(v.provider), fill: "solid" }],
    detail: [
      ["Median", formatValue(v.median, m.unit)],
      ["Range", v.min === v.max ? formatValue(v.min, m.unit) : `${formatValue(v.min, m.unit)}–${formatValue(v.max, m.unit)}`],
      ["Verified runs", formatCount(v.n)],
    ],
  }));
}

function MetricBlock({ metric, everyone }: { metric: ExpandedMetric; everyone: readonly ProviderId[] }) {
  const missing = everyone.filter((id) => !metric.values.some((v) => v.provider === id));
  return (
    <div className="min-w-0">
      <ChartHead title={metric.label} sub={metric.description} meta={`Median ${unitName[metric.unit]} · ${betterText(metric)}`} />
      {hasValues(metric) ? (
        <>
          {/* Four tests share a panel two by two, so each chart is the compact kind with its names set diagonally. */}
          <Columns columns={expandedColumns(metric)} compact label={`${metric.label}: median ${unitName[metric.unit]} by provider`} />
          <NotOnChart ids={missing} />
        </>
      ) : (
        <p className="text-s text-neutral-7">No provider has a verified run yet.</p>
      )}
    </div>
  );
}

function aboutRuns(data: Expanded) {
  const parts = [
    data.runs === null ? null : `${formatCount(data.runs)} runs per provider and test`,
    data.runId === null ? null : `run ${data.runId}`,
    data.generatedAt === null ? null : `exported ${new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`,
  ].filter((p) => p !== null);
  return parts.length === 0 ? [] : [{ lead: "Runs", text: `${parts.join(", ")}. The card gives each provider's count of verified runs.` }];
}

function GroupPanel({ data, group, everyone }: { data: Expanded; group: ExpandedGroup; everyone: readonly ProviderId[] }) {
  return (
    <>
      <div className="grid gap-xl lg:grid-cols-2">
        {group.metrics.map((m) => (
          <MetricBlock key={m.id} metric={m} everyone={everyone} />
        ))}
      </div>
      <Footnotes
        items={[
          {
            lead: "Verified",
            text: "Each run does real work inside the sandbox from a fresh random seed. The output is checked against that seed before the time or rate counts, so a cached or hardcoded answer fails, and a run that fails the check is left out.",
          },
          { lead: "Bars", text: "The median of each provider's verified runs. The card gives the fastest and slowest run as the range." },
          ...(missing(group, everyone) ? [{ text: "A provider with results elsewhere in these tests but none here had no verified run of that test." }] : []),
          ...aboutRuns(data),
        ]}
      />
    </>
  );
}

const missing = (group: ExpandedGroup, everyone: readonly ProviderId[]) =>
  group.metrics.some((m) => hasValues(m) && everyone.some((id) => !m.values.some((v) => v.provider === id)));

/**
 * The expanded benchmarks: one tab per category, each with its tests side by
 * side. Renders nothing until at least one test has a result.
 */
export function ExpandedBenchmarks({ data }: { data: Expanded }) {
  if (!hasExpanded(data)) return null;
  return <TabCard label="Expanded benchmarks" section={expandedSection} tabs={deferTabs(expandedTabs(data), "expanded")} />;
}

/** One tab per category, or a greyed-out one for a category with no results yet. */
export function expandedTabs(data: Expanded): Tab[] {
  const everyone = expandedProviders(data);
  return data.groups.map((g) =>
    groupHasValues(g)
      ? { id: g.category, label: g.label, content: <GroupPanel data={data} group={g} everyone={everyone} /> }
      : { id: g.category, label: g.label, unavailable: "no results yet" },
  );
}
