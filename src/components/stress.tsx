import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import type { DetailLine } from "@/components/hover-card";
import { ChartHead, Footnotes, NotOnChart, Who } from "@/components/metric-chart";
import { TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { formatCount, formatPercent, formatShort, formatValue } from "@/lib/format";
import { providerColor } from "@/lib/providers";
import {
  burstReady,
  burstValue,
  countsText,
  hasStress,
  highestFirst,
  survivalRanked,
  survivalReady,
  survivalValue,
  sustainedReady,
  sustainedValue,
  timesText,
  withoutValue,
} from "@/lib/stress";
import type { BurstSurvival, Cohorts, CpuBurst, CpuMode, CpuSustained, OnePerProvider, StressData } from "@/lib/stress";

/** The section id, for the page and any link that opens a tab: `#stress/cpu-burst`. */
export const stressSection = "stress";

type Note = { mark?: number; lead?: string; text: ReactNode };

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;
const seconds = (s: number) => `${Number.isInteger(s) ? formatCount(s) : formatShort(s, "s")} s`;

/** The providers whose row the chart left out because another allocation had more data. */
const othersNotes = (others: OnePerProvider<unknown>["others"]): Note[] =>
  others.map(({ provider, count }) => ({ text: <><Who id={provider} />: also collected at {plural(count, "other allocation")}; the chart shows the one with the most data.</> }));

/** "0 of 12 attempts finished": every try, failed and set-aside ones included. */
function attemptsText(a: CpuSustained["attempts"]) {
  const total = a.successes + a.failures.provider + a.failures.accountLimit + a.failures.clientNetwork + a.blocked + a.skipped;
  return `${formatCount(a.successes)} of ${plural(total, "attempt")} finished`;
}

const runsNote = (stress: StressData, suite: string): Note[] => {
  const runs = stress.runs.filter((r) => r.suite === suite);
  return runs.length === 0 ? [] : [{ lead: "Runs", text: `${runs.map((r) => `${r.id} (${plural(r.samples, "row")})`).join(", ")}.` }];
};

const removedNote = (stress: StressData): Note[] => {
  const removed = Object.entries(stress.selectionRemoved).filter(([, n]) => n > 0);
  return removed.length === 0 ? [] : [{ lead: "Set aside", text: `The attempt policy removed whole cohorts or iterations before these numbers were made: ${removed.map(([why, n]) => `${why}, ${formatCount(n)}`).join("; ")}.` }];
};

const failuresNote: Note = {
  lead: "Failures",
  text: "Only failures the provider caused count against it. Account limits and our own network errors are counted but set aside.",
};

/** "0.97 (min 0.91)": a per-run ratio's median and its lowest run. */
const ratioText = (r: CpuSustained["consistency"]["single"]) =>
  r === null || r.p50 === null ? null : `${r.p50.toFixed(2)}${r.min === null || r.min === r.p50 ? "" : ` (min ${r.min.toFixed(2)})`}`;

const line = (label: string, value: string | null): DetailLine[] => (value === null ? [] : [[label, value]]);

function sustainedColumns(rows: readonly CpuSustained[], mode: CpuMode): Column[] {
  return highestFirst(rows, sustainedValue(mode)).map(({ row, value }) => {
    const t = row[mode];
    const failed = row.attempts.failures.provider;
    const setAside = row.attempts.failures.accountLimit + row.attempts.failures.clientNetwork;
    return {
      provider: row.provider,
      label: formatShort(value, "ops/s"),
      segments: [{ value, color: providerColor(row.provider), fill: "solid" }],
      detail: [
        ["Median", formatValue(value, "ops/s")],
        ...line("p95", t.p95 === null ? null : formatValue(t.p95, "ops/s")),
        ...line("95% CI", t.ciLow === null || t.ciHigh === null ? null : `${formatShort(t.ciLow, "ops/s")}–${formatShort(t.ciHigh, "ops/s")}`),
        ["Runs", formatCount(t.n)],
        ...line("Min ÷ median segment", ratioText(row.consistency[mode])),
        ...line("Last ÷ first quarter", ratioText(row.trend[mode])),
        ...line("vCPU", countsText(row.guestVcpus)),
        ...(mode === "all" ? line("Workers", countsText(row.workers)) : []),
        ["Failed attempts", formatCount(failed)],
        ...(setAside > 0 ? line("Set aside", formatCount(setAside)) : []),
      ],
    };
  });
}

function SustainedPanel({ stress, data }: { stress: StressData; data: OnePerProvider<CpuSustained> }) {
  const modes = [
    { mode: "single", title: "Single core", what: "One worker" },
    { mode: "all", title: "All cores", what: "Several workers started together" },
  ] as const satisfies readonly { mode: CpuMode; title: string; what: string }[];
  const missing = modes.flatMap(({ mode, title }) => withoutValue(data.rows, sustainedValue(mode)).map((row) => ({ row, title })));
  return (
    <>
      <div className="flex flex-col gap-xl">
        {modes.map(({ mode, title, what }) => {
          const columns = sustainedColumns(data.rows, mode);
          const absent = withoutValue(data.rows, sustainedValue(mode)).map((r) => r.provider);
          return (
            <div key={mode} className="min-w-0">
              <ChartHead title={`Sustained CPU, ${title.toLowerCase()}`} sub={`${what}, kept busy for a fixed time · Median operations per second per run · Higher is better`} />
              {columns.length > 0 ? <Columns columns={columns} label={`Sustained CPU, ${title.toLowerCase()}: operations per second by provider`} /> : <p className="text-s text-neutral-7">No provider finished a run.</p>}
              <NotOnChart ids={absent} />
            </div>
          );
        })}
      </div>
      <Footnotes
        items={[
          ...missing.map(({ row, title }) => ({ text: <><Who id={row.provider} />: no {title.toLowerCase()} result ({row.attempts.successes === 0 ? attemptsText(row.attempts) : "no run recorded it"}).</> })),
          ...othersNotes(data.others),
          { lead: "Work", text: "Each run gives the sandbox the same CPU work, split into segments, and counts operations per second inside it. All cores starts several workers together, each doing equal work, and adds up their rates; the card shows how many workers and the vCPUs the sandbox reported." },
          { lead: "Consistency", text: "The slowest segment divided by the median segment, per run; the card shows the median run and the lowest. 1 is perfectly even; lower means the sandbox stalled for part of the run." },
          { lead: "Throttling", text: "The last quarter of segments divided by the first quarter. Below 1 the sandbox slowed down as the run went on." },
          failuresNote,
          ...runsNote(stress, "cpu-sustained"),
          ...removedNote(stress),
        ]}
      />
    </>
  );
}

function burstColumns(group: Cohorts<CpuBurst>): Column[] {
  return highestFirst(group.rows, burstValue).map(({ row, value }) => {
    const excluded = row.excluded.lowOverlap + row.excluded.invalidEvidence;
    const spread = row.perSandbox.single.maxOverMin;
    return {
      provider: row.provider,
      label: formatShort(value, "ops/s"),
      tag: spread === null ? undefined : timesText(spread),
      segments: [{ value, color: providerColor(row.provider), fill: "solid" }],
      detail: [
        ["Median per sandbox", formatValue(value, "ops/s")],
        ...line("All cores, median", row.perSandbox.all.p50 === null ? null : formatValue(row.perSandbox.all.p50, "ops/s")),
        ...line("Fastest ÷ slowest", spread === null ? null : timesText(spread)),
        ["Cohort size", formatCount(group.k)],
        ["Complete cohorts", `${formatCount(row.completeCohorts)} of ${formatCount(row.cohorts)}`],
        ["Counted", formatCount(row.perSandbox.cohorts)],
        // Values stay short: the card's value column takes its widest value, and a long one squeezes the labels.
        ...line("Spread in a cohort", row.withinCohortMaxOverMin?.p50 == null ? null : timesText(row.withinCohortMaxOverMin.p50)),
        ...line("Widest cohort", row.withinCohortMaxOverMin?.max == null ? null : timesText(row.withinCohortMaxOverMin.max)),
        ...line("Dispatch skew", row.dispatchSkewMs?.p50 == null ? null : `${formatCount(row.dispatchSkewMs.p50)} ms`),
        ...line("All complete", row.allCompleteS?.p50 == null ? null : seconds(row.allCompleteS.p50)),
        ...(excluded > 0 ? line("Excluded cohorts", formatCount(excluded)) : []),
        ...(row.incomplete.cohorts > 0 ? line("Incomplete cohorts", formatCount(row.incomplete.cohorts)) : []),
        ...(row.failures.provider > 0 ? line("Failed", formatCount(row.failures.provider)) : []),
      ],
    };
  });
}

function BurstPanel({ stress, groups }: { stress: StressData; groups: readonly Cohorts<CpuBurst>[] }) {
  const shown = groups.filter((g) => g.rows.some((r) => burstValue(r) !== null));
  return (
    <>
      <div className="flex flex-col gap-xl">
        {shown.map((g) => (
          <div key={g.k} className="min-w-0">
            <ChartHead
              title={`CPU under burst, ${g.k} at once`}
              sub={`${g.k} sandboxes started together, each running the same CPU work · Median single-core operations per second per sandbox · Tag: fastest ÷ slowest sandbox · Higher is better`}
            />
            <Columns columns={burstColumns(g)} label={`CPU under burst, ${g.k} at once: operations per second per sandbox by provider`} />
            <NotOnChart ids={withoutValue(g.rows, burstValue).map((r) => r.provider)} />
          </div>
        ))}
      </div>
      <Footnotes
        items={[
          ...shown.flatMap((g) =>
            g.rows.flatMap((r) => {
              const parts = [
                r.excluded.lowOverlap > 0 ? `${plural(r.excluded.lowOverlap, "cohort")} left out because its sandboxes did not run their CPU work at the same time` : null,
                r.excluded.invalidEvidence > 0 ? `${plural(r.excluded.invalidEvidence, "cohort")} left out because its timing records did not hold up` : null,
                r.incomplete.cohorts > 0 ? `${plural(r.incomplete.cohorts, "cohort")} started fewer than ${g.k} sandboxes and was not pooled` : null,
                burstValue(r) === null ? "no cohort finished with every sandbox running together" : null,
              ].filter((p) => p !== null);
              return parts.length === 0 ? [] : [{ text: <><Who id={r.provider} />, {g.k} at once: {parts.join("; ")}.</> }];
            }),
          ),
          ...shown.flatMap((g) => othersNotes(g.others)),
          { lead: "Cohorts", text: "A cohort is one burst: every sandbox created at once, then all of them running the same CPU work. Only cohorts where every sandbox finished and the host clock shows their work overlapped count toward the bars." },
          { lead: "Spread", text: "The tag divides the fastest sandbox by the slowest across counted cohorts. Near 1× every sandbox got the same CPU; a large spread points to noisy neighbours or uneven placement. The card also gives the median spread inside a single cohort." },
          { lead: "Dispatch skew", text: "How far apart a cohort's commands started, on our host's clock." },
          failuresNote,
          ...runsNote(stress, "cpu-burst"),
          ...removedNote(stress),
        ]}
      />
    </>
  );
}

function survivalColumns(group: Cohorts<BurstSurvival>): Column[] {
  return survivalRanked(group.rows).map(({ row, value }) => ({
    provider: row.provider,
    label: formatPercent(value, value === 1 || value === 0 ? 0 : 1),
    tag: `${formatCount(row.survived)}/${formatCount(row.attempted)}`,
    segments: [{ value: value * 100, color: providerColor(row.provider), fill: "solid" }],
    detail: [
      ["Survival rate", formatPercent(value)],
      ["Survived", `${formatCount(row.survived)} of ${formatCount(row.attempted)}`],
      ...line("Window", row.windowS === null ? null : seconds(row.windowS)),
      ...line("Heartbeat", row.heartbeatS === null ? null : `every ${seconds(row.heartbeatS)}`),
      ["Create failed", formatCount(row.createFailed.total)],
      ["Died", formatCount(row.died)],
      ["Unresponsive", formatCount(row.unresponsive)],
      ["Interrupted", formatCount(row.interrupted)],
      ["Invalid evidence", formatCount(row.invalidEvidence)],
    ],
  }));
}

/** "held for 600 s with a heartbeat every 5 s" when every provider ran the same plan. */
function planText(rows: readonly BurstSurvival[]) {
  const plans = new Set(rows.map((r) => `${r.windowS}|${r.heartbeatS}`));
  const [first] = rows;
  return plans.size === 1 && first && first.windowS !== null && first.heartbeatS !== null
    ? `held for ${seconds(first.windowS)} with a heartbeat every ${seconds(first.heartbeatS)}`
    : "held for a fixed window with a regular heartbeat";
}

function SurvivalPanel({ stress, groups }: { stress: StressData; groups: readonly Cohorts<BurstSurvival>[] }) {
  const shown = groups.filter((g) => g.rows.some((r) => survivalValue(r) !== null));
  return (
    <>
      <div className="flex flex-col gap-xl">
        {shown.map((g) => (
          <div key={g.k} className="min-w-0">
            <ChartHead title={`Burst survival, ${g.k} at once`} sub={`${g.k} sandboxes started together, then ${planText(g.rows)} · Share still answering at the end · Tag: survived / attempted · Higher is better`} />
            <Columns columns={survivalColumns(g)} max={100} label={`Burst survival, ${g.k} at once: share of sandboxes that survived by provider`} />
            <NotOnChart ids={withoutValue(g.rows, survivalValue).map((r) => r.provider)} />
          </div>
        ))}
      </div>
      <Footnotes
        items={[
          ...shown.flatMap((g) =>
            withoutValue(g.rows, survivalValue).map((r) => ({ text: <><Who id={r.provider} />, {g.k} at once: no rate, because no sandbox had a fair chance ({formatCount(r.attempted)} attempted, {formatCount(r.interrupted)} interrupted, {formatCount(r.invalidEvidence)} with invalid evidence, {formatCount(r.createFailed.accountLimit)} refused by an account limit).</> })),
          ),
          ...shown.flatMap((g) => othersNotes(g.others)),
          { lead: "Survival", text: "Each sandbox gets a heartbeat command at a fixed interval for the whole window. It survived only if it answered every one through the end of the window. It died if the provider reported it gone or in a dead state, or it came back with a different boot id. It was unresponsive if it missed any heartbeat, even one it recovered from." },
          { lead: "Rate", text: "Survived divided by the sandboxes the provider had a fair chance with: creates refused by an account limit or lost to our network, windows we cut short (interrupted) and heartbeat records that do not hold up (invalid evidence) are left out of the rate. The tag and card still count every attempt." },
          failuresNote,
          ...runsNote(stress, "survival"),
          ...removedNote(stress),
        ]}
      />
    </>
  );
}

/**
 * The stress suites for one track: sustained CPU, CPU under burst and burst
 * survival, one tab each. Renders nothing when the track has no stress
 * results, and only the tabs whose suite has a charted value.
 */
export function StressSection({ stress }: { stress: StressData | null }) {
  if (!hasStress(stress)) return null;
  const tabs: Tab[] = [
    ...(sustainedReady(stress) ? [{ id: "cpu-sustained", label: "Sustained CPU", content: <SustainedPanel stress={stress} data={stress.cpuSustained} /> }] : []),
    ...(burstReady(stress) ? [{ id: "cpu-burst", label: "CPU under burst", content: <BurstPanel stress={stress} groups={stress.cpuBurst} /> }] : []),
    ...(survivalReady(stress) ? [{ id: "burst-survival", label: "Burst survival", content: <SurvivalPanel stress={stress} groups={stress.burstSurvival} /> }] : []),
  ];
  return <TabCard label="Stress" section={stressSection} tabs={tabs} />;
}
