import type { ReactNode } from "react";

import { Columns } from "@/components/columns";
import { Swatch } from "@/components/cost";
import type { Column } from "@/components/columns";
import { Disclosure } from "@/components/disclosure";
import { ChartHead, Footnotes, Who, sentence } from "@/components/metric-chart";
import { TabCard } from "@/components/tabs";
import { billingBases, billingLabel } from "@/lib/cost";
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
  idleGroups,
  idleLabel,
  idleOutcome,
  isCounterfactual,
  isSettledHold,
  laterLine,
  noCostReason,
  perThousand,
  pickLabels,
  profileFootprint,
  profileIds,
  profileInfo,
  profileWhat,
  runTrackOf,
  statusTag,
  taskPick,
  uncertifiedWhy,
  wallText,
  wilsonText,
} from "@/lib/realistic";
import type { Costed, IdleGroup, IdlePoint, ProfileId, RealisticData, RealisticRow, RunTrack } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

/** The section id and the nav label, shared with the stat strip that links here. */
export const taskCostSection = "task-cost";

const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

const billingOf = (row: Pick<RealisticRow, "billingModel" | "provider">) => billingText(row, billingLabel(billingBases[row.provider]));

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

/** "Boat $0.95 (metered · unsettled, provisional)". */
const Amount = ({ row }: { row: Costed }) => (
  <>
    <Who id={row.provider} /> <span className="font-mono tabular-nums text-neutral-10">{perThousand(row.cost.usdPerCompleted)}</span>{" "}
    <span className="text-neutral-7">({statusTag(row)})</span>
  </>
);

/** The pick as the plan words it, with the eligible set and every lower cost that isn't eligible. */
function Pick({ costed }: { costed: readonly Costed[] }) {
  const p = taskPick(costed);
  switch (p.kind) {
    case "verified":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p>
            <span className="text-neutral-7">{p.label}:</span> <Amount row={p.pick} /> <span className="text-neutral-7">per 1,000</span>
          </p>
          <p className="text-xs text-neutral-7">
            {pickLabels.uncertified}: {uncertifiedWhy}. Eligible: {names(p.eligible)}.
          </p>
          {p.lower.length > 0 ? (
            <p className="flex gap-1.5 text-xs text-neutral-7">
              <span aria-hidden className="mt-[0.4em] size-1.5 shrink-0 rounded-full bg-warning" />
              <span>
                Lower but not eligible:{" "}
                {p.lower.map((row, i) => (
                  <span key={row.provider}>
                    {i > 0 ? "; " : ""}
                    <Amount row={row} />
                  </span>
                ))}
                . Reasons are in the table.
              </span>
            </p>
          ) : null}
        </div>
      );
    case "none":
      return (
        <div className="mb-m flex flex-col gap-xxs text-s text-pretty">
          <p className="font-medium">{p.label}: no provider has a verified cost here yet.</p>
          <p className="text-xs text-neutral-7">
            Reported, none eligible:{" "}
            {p.lower.map((row, i) => (
              <span key={row.provider}>
                {i > 0 ? "; " : ""}
                <Amount row={row} />
              </span>
            ))}
            .
          </p>
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
      ...flagsOf(row).map((f) => sentence(cap(f.text))),
      sentence(cap(billingOf(row))),
    ],
  }));
}

const Dot = ({ tone }: { tone: "ok" | "warn" | "none" }) => (
  <span aria-hidden className={`mt-[0.35em] size-1.5 shrink-0 rounded-full ${tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-neutral-6"}`} />
);

/** Kind and status, then each reason it isn't eligible; or, without a cost, why. */
function StatusCell({ row }: { row: RealisticRow }) {
  if (row.cost === null)
    return (
      <span className="flex gap-1.5 text-neutral-8">
        <Dot tone="none" />
        <span>{cap(noCostReason(row))}</span>
      </span>
    );
  return (
    <span className="flex gap-1.5">
      <Dot tone={row.eligible ? "ok" : "warn"} />
      <span>
        <span className={row.eligible ? "" : "text-warning"}>{cap(statusTag(row))}</span>
        {flagsOf(row).map((f, i) => (
          <span key={i} className="block text-neutral-7">
            {sentence(cap(f.text))}
          </span>
        ))}
        {row.costNote ? <span className="block text-neutral-7">{sentence(cap(row.costNote))}</span> : null}
      </span>
    </span>
  );
}

const wholeText = (row: RealisticRow) => {
  const w = row.cost?.wholeMachineUsdPerCompleted ?? null;
  return w === null ? "n/a" : perThousand(w);
};

const Whole = ({ row }: { row: RealisticRow }) => (
  <>
    <span className="font-mono tabular-nums">{wholeText(row)}</span>
    {row.cost?.wholeMachineUsdPerCompleted != null && isCounterfactual(billingOf(row)) ? <span className="text-neutral-7">, counterfactual</span> : null}
  </>
);

const completedCell = (row: RealisticRow) => (row.notRun === row.attempts ? "not run" : completedText(row));

/** Every provider in the profile, run or not. A table on wide screens, one block per provider on phones. */
function ProfileTable({ rows }: { rows: readonly RealisticRow[] }) {
  return (
    <div className="mt-l">
      <ul className="flex flex-col divide-y divide-neutral-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.provider} className="py-s text-s">
            <p className="flex items-baseline justify-between gap-s">
              <Who id={row.provider} />
              <span className="font-mono text-xs tabular-nums">{row.cost ? perThousand(row.cost.usdPerCompleted) : "no cost"}</span>
            </p>
            <div className="mt-xxs text-xs">
              <StatusCell row={row} />
            </div>
            <p className="mt-xxs text-xs text-neutral-7">
              {row.notRun === row.attempts ? "Not run" : `Completed ${completedText(row)}`}
              {row.medianWallS === null ? "" : ` · median ${wallText(row.medianWallS)}`}
            </p>
            {row.cost ? (
              <p className="mt-xxs text-xs text-neutral-7">
                Whole machine at list price: <Whole row={row} />. {sentence(cap(billingOf(row)))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <table className="hidden w-full border-collapse text-left text-s sm:table">
        <thead>
          <tr className="text-xs text-neutral-7">
            {["Provider", "Per 1,000 completed", "Kind and status", "Completed", "Median time", "Billing model", "Whole machine at list price, per 1,000"].map((h) => (
              <th key={h} scope="col" className="py-2.5 pr-5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.provider} className="align-top">
              <th scope="row" className="py-s pr-5 font-medium">
                <Who id={row.provider} />
              </th>
              <td className="py-s pr-5 font-mono text-xs whitespace-nowrap tabular-nums">{row.cost ? perThousand(row.cost.usdPerCompleted) : "n/a"}</td>
              <td className="max-w-[34ch] py-s pr-5 text-xs">
                <StatusCell row={row} />
              </td>
              <td className="py-s pr-5 text-xs whitespace-nowrap">
                <span className="font-mono tabular-nums">{completedCell(row)}</span>
                {row.notRun === row.attempts ? null : <span className="block text-neutral-7">95% CI {wilsonText(row)}</span>}
              </td>
              <td className="py-s pr-5 font-mono text-xs whitespace-nowrap tabular-nums">{row.medianWallS === null ? "n/a" : wallText(row.medianWallS)}</td>
              <td className="max-w-[24ch] py-s pr-5 text-xs text-neutral-8">{billingOf(row)}</td>
              <td className="py-s pr-5 text-xs whitespace-nowrap">
                <Whole row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The notes every profile chart carries. */
function profileNotes(data: RealisticData, track: RunTrack, rows: readonly RealisticRow[]) {
  const has = (id: ProviderId) => rows.some((r) => r.provider === id && r.cost !== null);
  return [
    { text: `${pilotNote} ${laterLine}` },
    { text: "Cost per completed task: the cost of every attempt, failed ones included, divided by the tasks that completed, from the create request until deletion was confirmed, setup included. Every task starts from the provider's base image and installs the pinned toolchain and dependencies itself." },
    { text: "Eligible for the pick: billed and settled (or a usage meter reconciled with settled charges), tied to our own sandboxes, at most 1 incomplete run and, on Same machine, exactly 4 vCPU and 8 GB. Everything else is striped and never picked. There is no overall cheapest." },
    { text: "Whole machine at list price: the published rate for the machine over each task's billed time. For a provider that bills less than the whole machine, it is a counterfactual, not what it charges." },
    ...(track === "default" ? [{ text: "Default machines: each provider's own default size, so sizes differ. Where the default is too small for the workload (checked locally before any paid run), the provider wasn't run, and that isn't counted as a failure." }] : []),
    ...(has("boxd") && data.fx ? [{ text: <><Who id="boxd" /> bills in euros, converted at {data.fx.eurToUsd} dollars per euro, the rate frozen on {data.fx.date}.</> }] : []),
    ...(has("boat") ? [{ text: <><Who id="boat" />&apos;s monthly plan minimum isn&apos;t in its per-task cost.</> }] : []),
  ];
}

const pilotNote = "Pilot: 5 runs per provider for each workload and machine, so completion counts and costs are descriptive.";

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
      <Legend solid="Verified: eligible for the pick" striped="Unsettled, provisional, unconfirmed estimate, wrong size or too many failures: shown, not eligible" />
      {uncosted.length > 0 ? (
        <p className="mt-s text-xs text-pretty text-neutral-8">
          Not in the chart:{" "}
          {uncosted.map((row, i) => (
            <span key={row.provider}>
              {i > 0 ? "; " : ""}
              <Who id={row.provider} /> ({noCostReason(row)})
            </span>
          ))}
          .
        </p>
      ) : null}
      <ProfileTable rows={[...costed, ...uncosted]} />
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
  const status = point.status;
  const change = changeText(point);
  const label = `${idleLabel(point)}: ${usd === null ? "no cost" : `${perThousand(usd)} per 1,000`}, ${status}${change ? `, ${change}` : ""}, ${point.completed} of ${point.runs} completed${point.stopped ? ", stopped while idle" : ""}`;
  return (
    <div role="listitem" aria-label={label} className="grid grid-cols-[3.75rem_1fr_auto] items-center gap-x-2.5">
      <span aria-hidden className="text-xs text-neutral-8">
        {idleLabel(point)}
      </span>
      <div aria-hidden className="relative flex h-3 items-stretch border-l border-neutral-4">
        <div className="rounded-r-xs" style={{ width: `${share * 100}%`, minWidth: 2, ...markFill(isSettledHold(point) ? "solid" : "striped", providerColor(provider)) }} />
      </div>
      <span aria-hidden className="flex min-w-[4.5rem] items-baseline justify-end gap-xs text-right font-mono text-xs whitespace-nowrap text-neutral-10 tabular-nums">
        {point.stopped ? <span className="font-sans text-xxs text-error">stopped</span> : point.completed === 0 && point.runs > 0 ? <span className="font-sans text-xxs text-warning">resume failed</span> : point.completed < point.runs ? <span className="font-sans text-xxs text-warning">{point.completed} of {point.runs} done</span> : null}
        {usd === null ? "n/a" : perThousand(usd)}
      </span>
    </div>
  );
}

/** One provider's three waits. Its outcome is said once, in the line above the grid; the bars only mark it. */
function IdleProvider({ group, max }: { group: IdleGroup; max: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-xs">
      <p className="text-s">
        <Who id={group.provider} />
      </p>
      <div role="list" aria-label={`Cost with the sandbox left open`} className="flex flex-col gap-xxs">
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
            {["Provider", "Wait", "Completed", "Median cost, per 1,000", "Status", "Change vs no wait", "Median wake", "State change while idle"].map((h) => (
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
                <td className="py-1.5 pr-4 font-mono tabular-nums">{p.completed} of {p.runs}</td>
                <td className="py-1.5 pr-4 font-mono tabular-nums">{p.medianCostUsd === null ? "n/a" : perThousand(p.medianCostUsd)}</td>
                <td className="py-1.5 pr-4 text-neutral-8">{p.status}</td>
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

/** "3", or "2–3" where providers ran different counts. */
function runsPerWait(groups: readonly IdleGroup[]) {
  const runs = groups.flatMap((g) => g.points.map((p) => p.runs));
  const lo = Math.min(...runs);
  const hi = Math.max(...runs);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** Cost of fix and test with the sandbox left open 0, 10 or 60 minutes, same machine, and who stopped it. */
export function IdleChart() {
  const groups = idleGroups(realistic);
  if (groups.length === 0) return null;
  const max = Math.max(...groups.flatMap((g) => g.points.map((p) => p.medianCostUsd ?? 0)), Number.EPSILON);
  const stopped = groups.filter((g) => g.stoppedAt).map((g) => g.provider);
  const failed = groups.filter((g) => !g.stoppedAt && g.resumeFailedAt);
  const tested = new Set(groups.map((g) => g.provider));
  const untested = [...new Set(realistic.rows.filter((r) => r.variant === "headline" && r.track === "same-machine" && !tested.has(r.provider)).map((r) => r.provider))];
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
        sub="Fix and test, then left idle on each provider's default settings, then a resume step (git status and the tests) · Same machine, 4 vCPU, 8 GB · Median cost per 1,000 · US dollars · Lower is better"
      />
      {lines.length ? <p className="mb-m text-s text-pretty">{lines}</p> : null}
      <div className="grid gap-x-xl gap-y-l md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <IdleProvider key={g.provider} group={g} max={max} />
        ))}
      </div>
      <Legend solid="Billed and settled" striped="Unsettled, or a usage meter not yet checked against settled charges" />
      <Disclosure className="mt-m gap-xs" triggerClassName="w-fit justify-start text-s text-neutral-7 hover:text-neutral-10" summary="Every number">
        <IdleTable groups={groups} />
      </Disclosure>
      <Footnotes
        items={[
          { text: `Pilot: ${runsPerWait(groups)} runs per provider and wait, so results are descriptive. ${laterLine}` },
          { text: "Each run is paired with a no-wait run: fix and test, then the resume step straight away. The cost covers all of it, fix, wait and resume, for every run, failed ones included. The idle part alone isn't separable on most providers." },
          { text: "Nothing runs in the sandbox while it waits: no command, open stream or keepalive from us. Each provider's default idle, standby and pause behaviour applies." },
          ...(untested.length ? [{ text: <>Not in this test: {names(untested)}. It ran only where charges can be tied to each sandbox.</> }] : []),
        ]}
      />
    </>
  );
}
