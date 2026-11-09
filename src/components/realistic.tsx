import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { Swatch } from "@/components/cost";
import { Disclosure } from "@/components/disclosure";
import { ChartHead, Footnotes, Who, sentence } from "@/components/metric-chart";
import { TabCard } from "@/components/tabs";
import type { Track } from "@/lib/data";
import { markFill } from "@/lib/marks";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import {
  billingText,
  changeText,
  completedText,
  flagsOf,
  headlineRows,
  holdTag,
  idleGroups,
  idleLabel,
  idleOutcome,
  isCounterfactual,
  isVerifiedHold,
  laterLine,
  noCostReason,
  perThousand,
  pickLabels,
  pilotLine,
  profileFootprint,
  profileIds,
  profileInfo,
  profileWhat,
  runTrackOf,
  scopeLine,
  statusTag,
  taskPick,
  uncertifiedWhy,
  wallText,
  wilsonText,
} from "@/lib/realistic";
import type { Costed, IdleGroup, IdlePoint, ProfileId, RealisticData, RealisticRow, RunTrack } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

/** The section id, shared with the stat strip and the nav that link here. */
export const taskCostSection = "task-cost";

const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

function Legend({ solid, striped }: { solid: string; striped: string }) {
  return (
    <p className="mt-s flex flex-wrap items-center gap-x-m gap-y-xxs text-xs text-neutral-7">
      <span className="inline-flex items-center gap-1.5">
        <Swatch fill="solid" />
        {solid}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch fill="striped" />
        {striped}
      </span>
    </p>
  );
}

const names = (ids: readonly ProviderId[]) => ids.map((id, i) => <span key={id}>{i > 0 ? (i === ids.length - 1 ? " and " : ", ") : ""}<Who id={id} /></span>);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The pick as the plan words it, in three short lines: the pick with its kind
 * and status, why it isn't certified with the eligible set, and how many lower
 * costs aren't verified. Their reasons are in each provider's row below.
 */
function Pick({ costed }: { costed: readonly Costed[] }) {
  const p = taskPick(costed);
  switch (p.kind) {
    case "verified":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p>
            <span className="text-neutral-7">{p.label}:</span> <Who id={p.pick.provider} />{" "}
            <span className="font-mono tabular-nums text-neutral-10">{perThousand(p.pick.cost.usdPerCompleted)}</span>{" "}
            <span className="text-neutral-7">per 1,000 ({statusTag(p.pick)})</span>
          </p>
          <p className="text-xs text-neutral-7">
            {pickLabels.uncertified}: {uncertifiedWhy(realistic)}. Eligible: {names(p.eligible)}.
          </p>
          {p.lower.length > 0 ? (
            <p className="flex gap-1.5 text-xs text-neutral-7">
              <span aria-hidden className="mt-[0.4em] size-1.5 shrink-0 rounded-full bg-warning" />
              <span>{plural(p.lower.length, "lower reported cost is", "lower reported costs are")} unverified or ineligible; reasons below.</span>
            </p>
          ) : null}
        </div>
      );
    case "none":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p className="font-medium">{p.label}: no provider has a verified cost here yet.</p>
          <p className="text-xs text-neutral-7">{plural(p.lower.length, "reported cost is", "reported costs are")} unverified or ineligible; reasons below.</p>
        </div>
      );
    case "empty":
      return null;
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

function columnsOf(costed: readonly Costed[]): Column[] {
  return costed.map((row) => ({
    provider: row.provider,
    label: perThousand(row.cost.usdPerCompleted),
    tag: statusTag(row),
    segments: [{ value: row.cost.usdPerCompleted, color: providerColor(row.provider), fill: row.eligible ? "solid" : "striped" }],
    detail: [
      ["Per 1,000 completed", perThousand(row.cost.usdPerCompleted)],
      ["Completed", completedText(row)],
      ...(row.medianWallS === null ? [] : [["Median time", wallText(row.medianWallS)] as const]),
      ["Status", statusTag(row)],
      sentence(cap(billingText(row.provider))),
    ],
  }));
}

const notRun = (row: RealisticRow) => row.notRun === row.attempts;

/** "Not run" or "default too small": a word or two for the row; the full reason is in its details. */
const shortReason = (row: RealisticRow) =>
  row.reasons.some((r) => r.reason === "default-size-too-small") ? "default machine too small, not run" : row.prepare?.kind === "insufficient-disk" ? "out of disk, no run completed" : "no run completed";

const Dot = ({ tone }: { tone: "ok" | "warn" | "none" }) => (
  <span aria-hidden className={`mt-[0.35em] size-1.5 shrink-0 rounded-full ${tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-neutral-6"}`} />
);

/** The whole machine at list price per 1,000, and whether it is a counterfactual. */
function wholeLine(row: RealisticRow) {
  const w = row.cost?.wholeMachineUsdPerCompleted ?? null;
  if (w === null) return "Whole machine at list price: not available.";
  return `Whole machine at list price: ${perThousand(w)} per 1,000${isCounterfactual(row.provider) ? ", a counterfactual: it bills usage, not the whole machine" : ""}.`;
}

/** The longer explanations, folded under each provider's row. */
function RowDetails({ row }: { row: RealisticRow }) {
  const lines = [
    ...(row.cost ? [] : [`${cap(noCostReason(row))}.`]),
    ...flagsOf(row).map((f) => sentence(cap(f.text))),
    ...(row.costNote ? [sentence(cap(row.costNote))] : []),
    ...(notRun(row) ? [] : [`Completed ${completedText(row)}, 95% interval ${wilsonText(row)}.`]),
    sentence(`Billing: ${billingText(row.provider)}`),
    ...(row.cost ? [wholeLine(row)] : []),
  ];
  return (
    <ul className="flex flex-col gap-xxs pb-s pl-s text-xs text-neutral-7 sm:pl-[calc(9rem+var(--space-s))]">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

const rowGrid = "grid w-full grid-cols-[1fr_auto] gap-x-s gap-y-xxs text-left sm:grid-cols-[9rem_5.5rem_minmax(0,1fr)_5rem_6.5rem] sm:items-baseline";

/** One provider: cost, short status, completion and time, with the longer explanation behind a disclosure. */
function ProviderRow({ row }: { row: RealisticRow }) {
  const status = row.cost ? statusTag(row) : shortReason(row);
  const tone = row.cost === null ? "none" : row.eligible ? "ok" : "warn";
  return (
    <li className="border-t border-neutral-3">
      <Disclosure
        className="gap-0"
        triggerClassName="w-full items-center gap-s py-s hover:bg-neutral-3/40"
        summary={
          <span className={rowGrid}>
            <span className="text-s font-medium">
              <Who id={row.provider} />
            </span>
            <span className="text-right font-mono text-xs text-neutral-10 tabular-nums sm:text-left">
              <span className="sr-only">Per 1,000 completed: </span>
              {row.cost ? perThousand(row.cost.usdPerCompleted) : "no cost"}
            </span>
            <span className="col-span-2 flex gap-1.5 text-xs sm:col-span-1">
              <Dot tone={tone} />
              <span className={tone === "warn" ? "text-warning" : tone === "ok" ? "text-neutral-10" : "text-neutral-8"}>{status}</span>
            </span>
            <span className="col-span-2 font-mono text-xs text-neutral-8 tabular-nums sm:col-span-1">
              <span className="font-sans sm:sr-only">Completed </span>
              {notRun(row) ? "not run" : completedText(row)}
              {row.medianWallS === null ? null : (
                <span className="text-neutral-7 sm:hidden">
                  {" · "}
                  <span className="font-sans">median </span>
                  {wallText(row.medianWallS)}
                </span>
              )}
            </span>
            <span className="hidden font-mono text-xs text-neutral-8 tabular-nums sm:block">
              <span className="sr-only">Median time </span>
              {row.medianWallS === null ? "n/a" : wallText(row.medianWallS)}
            </span>
          </span>
        }
      >
        <RowDetails row={row} />
      </Disclosure>
    </li>
  );
}

/** Every provider in the workload, run or not, one row each. */
function ProviderRows({ rows }: { rows: readonly RealisticRow[] }) {
  return (
    <div className="mt-l">
      <p aria-hidden className={`${rowGrid} hidden pr-l pb-xs text-xs text-neutral-7 sm:grid`}>
        <span>Provider</span>
        <span>Per 1,000</span>
        <span>Kind and status</span>
        <span>Completed</span>
        <span>Median time</span>
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <ProviderRow key={row.provider} row={row} />
        ))}
      </ul>
    </div>
  );
}

/** "Not in the chart: Daytona, E2B and Superserve (its default machine is too small …)", one group per reason. */
function NotInChart({ rows }: { rows: readonly RealisticRow[] }) {
  if (rows.length === 0) return null;
  const groups = new Map<string, ProviderId[]>();
  for (const r of rows) groups.set(noCostReason(r), [...(groups.get(noCostReason(r)) ?? []), r.provider]);
  return (
    <p className="mt-s text-xs text-pretty text-neutral-8">
      Not in the chart:{" "}
      {[...groups].map(([why, ids], i) => (
        <span key={why}>
          {i > 0 ? "; " : ""}
          {names(ids)} ({why})
        </span>
      ))}
      .
    </p>
  );
}

/** The notes every workload chart carries. */
function profileNotes(data: RealisticData, track: RunTrack, rows: readonly RealisticRow[]) {
  const has = (id: ProviderId) => rows.some((r) => r.provider === id && r.cost !== null);
  return [
    { text: scopeLine(data) },
    { text: "Cost per completed task: the cost of every attempt divided by the tasks that completed. Every task starts from the provider's base image and installs the pinned toolchain and dependencies itself." },
    { text: "Eligible for the pick: billed and settled (or a usage meter reconciled with settled charges), tied to our own sandboxes, at most 1 incomplete run and, on Same machine, exactly 4 vCPU and 8 GB. Everything else is striped and never picked. There is no overall cheapest." },
    { text: "Whole machine at list price: the published rate for the machine over each task's billed time. For a provider that bills usage, it is a counterfactual, not what it charges." },
    ...(track === "default" ? [{ text: "Default machines: each provider's own default size, so sizes differ. Where the default is too small for the workload (checked locally before any paid run), the provider wasn't run, and that isn't counted as a failure." }] : []),
    ...(has("boxd") && data.fx ? [{ text: <><Who id="boxd" /> bills in euros, converted at {data.fx.eurToUsd} dollars per euro, the rate frozen on {data.fx.date}.</> }] : []),
    ...(has("boat") ? [{ text: <><Who id="boat" />&apos;s monthly plan minimum isn&apos;t in its per-task cost.</> }] : []),
    { text: `${pilotLine(data)} ${laterLine}` },
  ];
}

function ProfileChart({ track, profile }: { track: Track; profile: ProfileId }) {
  const run = runTrackOf[track.id];
  const { costed, uncosted } = headlineRows(realistic, run, profile);
  const w = realistic.workloads?.[profile] ?? null;
  const footprint = profileFootprint(profile, w);
  const machine = run === "default" ? "Each provider's default machine" : "4 vCPU, 8 GB";
  const title = `${profileInfo[profile].label}: cost per 1,000 completed tasks`;
  return (
    <>
      <ChartHead title={title} sub={`${profileWhat(profile, w)} · ${machine} · US dollars · Lower is better`} meta={footprint ? cap(footprint) : undefined} />
      <Pick costed={costed} />
      {costed.length > 0 ? <Columns columns={columnsOf(costed)} label={`${title} by provider`} /> : null}
      <Legend solid="Verified: eligible for the pick" striped="Not verified or not eligible: shown, never picked" />
      <NotInChart rows={uncosted} />
      <ProviderRows rows={[...costed, ...uncosted]} />
      <Footnotes items={profileNotes(realistic, run, [...costed, ...uncosted])} />
    </>
  );
}

/** One card per track, a tab per workload. */
export function TaskCost({ track }: { track: Track }) {
  return (
    <TabCard
      label="What a task costs"
      section={taskCostSection}
      tabs={profileIds.map((profile) => ({ id: profile, label: profileInfo[profile].label, content: <ProfileChart track={track} profile={profile} /> }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Idle: fix and test, then the sandbox left open.

function IdleBar({ point, provider, max }: { point: IdlePoint; provider: ProviderId; max: number }) {
  const usd = point.medianCostUsd;
  const share = usd === null ? 0 : Math.min(usd / max, 1);
  const change = changeText(point);
  const label = `${idleLabel(point)}: ${usd === null ? "no cost" : `${perThousand(usd)} per 1,000`}, ${holdTag(point)}${change ? `, ${change}` : ""}, ${point.completed} of ${point.runs} completed${point.stopped ? ", stopped while idle" : ""}`;
  return (
    <div role="listitem" aria-label={label} className="grid grid-cols-[3.75rem_1fr_auto] items-center gap-x-2.5">
      <span aria-hidden className="text-xs text-neutral-8">
        {idleLabel(point)}
      </span>
      <div aria-hidden className="relative flex h-3 items-stretch border-l border-neutral-4">
        <div className="rounded-r-xs" style={{ width: `${share * 100}%`, minWidth: 2, ...markFill(isVerifiedHold(point) ? "solid" : "striped", providerColor(provider)) }} />
      </div>
      <span aria-hidden className="flex min-w-[4.5rem] items-baseline justify-end gap-xs text-right font-mono text-xs whitespace-nowrap text-neutral-10 tabular-nums">
        {point.stopped ? <span className="font-sans text-xxs text-error">stopped</span> : point.completed === 0 && point.runs > 0 ? <span className="font-sans text-xxs text-warning">resume failed</span> : point.completed < point.runs ? <span className="font-sans text-xxs text-warning">{point.completed} of {point.runs} done</span> : null}
        {usd === null ? "n/a" : perThousand(usd)}
      </span>
    </div>
  );
}

/** "metered, unsettled, unreconciled" when every wait shares it, else "No wait and 10 min: …; 1 hour: …". */
function idleTags(points: readonly IdlePoint[]) {
  const byTag = new Map<string, string[]>();
  for (const p of points) byTag.set(holdTag(p), [...(byTag.get(holdTag(p)) ?? []), idleLabel(p)]);
  if (byTag.size <= 1) return [...byTag.keys()].join("");
  return [...byTag].map(([tag, waits]) => `${waits.join(" and ")}: ${tag}`).join("; ");
}

/** One provider's three waits, with their kind and status. Its outcome is said once, in the line above the grid; the bars only mark it. */
function IdleProvider({ group, max }: { group: IdleGroup; max: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-xs">
      <p className="text-s">
        <Who id={group.provider} />
        <span className="block text-xs text-neutral-7">{idleTags(group.points)}</span>
      </p>
      <div role="list" aria-label="Cost with the sandbox left open" className="flex flex-col gap-xxs">
        {group.points.map((p) => (
          <IdleBar key={p.idle} point={p} provider={group.provider} max={max} />
        ))}
      </div>
    </div>
  );
}

function IdleTable({ groups }: { groups: readonly IdleGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="text-neutral-7">
            {["Provider", "Wait", "Completed", "Median cost, per 1,000", "Kind and status", "Change vs no wait", "Median wake", "State change while idle"].map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((g) =>
            g.points.map((p) => (
              <tr key={`${g.provider}${p.idle}`} className="align-top">
                <th scope="row" className="py-1.5 pr-4 font-medium">
                  <Who id={g.provider} />
                </th>
                <td className="py-1.5 pr-4">{idleLabel(p)}</td>
                <td className="py-1.5 pr-4 font-mono tabular-nums">
                  {p.completed} of {p.runs}
                </td>
                <td className="py-1.5 pr-4 font-mono tabular-nums">{p.medianCostUsd === null ? "n/a" : perThousand(p.medianCostUsd)}</td>
                <td className="py-1.5 pr-4 text-neutral-8">{holdTag(p)}</td>
                <td className="py-1.5 pr-4 font-mono tabular-nums">{changeText(p)?.replace(" vs no wait", "") ?? "n/a"}</td>
                <td className="py-1.5 pr-4 font-mono tabular-nums">{p.medianWakeMs === null ? "n/a" : `${(p.medianWakeMs / 1000).toFixed(2)} s`}</td>
                <td className="py-1.5 pr-4 text-neutral-8">{p.transitions.length ? p.transitions.join(", ") : "none seen"}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Cost of fix and test with the sandbox left open 0, 10 or 60 minutes, same machine, and who stopped it. */
export function IdleChart() {
  const groups = idleGroups(realistic);
  if (groups.length === 0) return null;
  const { idle } = realistic.coverage;
  const max = Math.max(...groups.flatMap((g) => g.points.map((p) => p.medianCostUsd ?? 0)), Number.EPSILON);
  const stopped = groups.filter((g) => g.stoppedAt).map((g) => g.provider);
  const failed = groups.filter((g) => !g.stoppedAt && g.resumeFailedAt);
  const lines: ReactNode[] = [
    ...(stopped.length ? [<span key="s">Stopped the sandbox during the hour, so the work couldn&apos;t resume: {names(stopped)}.</span>] : []),
    ...failed.map((g) => (
      <span key={g.provider}>
        {" "}
        <Who id={g.provider} />: {idleOutcome(g)}.
      </span>
    )),
  ];
  return (
    <>
      <ChartHead
        title="What leaving the sandbox open costs"
        sub="Fix and test, then left idle on each provider's default settings, then a resume step (git status and the tests) · Same machine, 4 vCPU, 8 GB · US dollars"
        meta={`${idle.attempts} runs per provider and wait. Median total cost of fix, wait and resume, failed attempts included, per 1,000.`}
      />
      {lines.length ? <p className="mb-m text-s text-pretty">{lines}</p> : null}
      <div className="grid gap-x-xl gap-y-l md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <IdleProvider key={g.provider} group={g} max={max} />
        ))}
      </div>
      <Legend solid="Verified: billed and settled" striped="Unsettled, unreconciled or provisional" />
      {idle.notTested.length ? (
        <p className="mt-s text-xs text-pretty text-neutral-8">
          Not in this test:{" "}
          {idle.notTested.map((n, i) => (
            <span key={n.provider}>
              {i > 0 ? "; " : ""}
              <Who id={n.provider} /> ({n.reason})
            </span>
          ))}
          .
        </p>
      ) : null}
      <Disclosure className="mt-m gap-xs" triggerClassName="w-fit justify-start text-s text-neutral-7 hover:text-neutral-10" summary="Every number">
        <IdleTable groups={groups} />
      </Disclosure>
      <Footnotes
        items={[
          { text: "Each run is paired with a no-wait run: fix and test, then the resume step straight away. The idle part alone isn't separable on most providers." },
          { text: "Nothing runs in the sandbox while it waits: no command, open stream or keepalive from us. Each provider's default idle, standby and pause behaviour applies." },
          { text: scopeLine(realistic) },
          { text: `${pilotLine(realistic)} ${laterLine}` },
        ]}
      />
    </>
  );
}
