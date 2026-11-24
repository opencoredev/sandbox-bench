import type { ReactNode } from "react";

import { Allocations } from "@/components/allocations";
import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { CostPerTaskChart, NoCostResults } from "@/components/cost";
import { TierTable, tieredWithData } from "@/components/cpu-tiers";
import { deferTabs } from "@/components/lazy-tabs";
import { MachineSizes } from "@/components/machine-sizes";
import { ChartHead, ComingNext, Footnotes, MetricChart, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import type { Notes } from "@/components/metric-chart";
import { PauseChart, PausePart, hasPauseSplit } from "@/components/pause-chart";
import { TaskCost, TaskCostHeadline, taskCostSection } from "@/components/realistic";
import { RealTaskHeadline, RealTasks, realTasksSection } from "@/components/real-tasks";
import { RealtaskBurstChart } from "@/components/realtask-burst";
import { Reliability } from "@/components/reliability";
import { Ridgelines } from "@/components/ridgelines";
import { Scatter, linearTicks, logTicks } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
import { Scores } from "@/components/scores";
import { SpecSheet } from "@/components/spec-sheet";
import { StatStrip } from "@/components/stat-strip";
import { StressSection } from "@/components/stress";
import { Card, TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { JumpLink } from "@/components/jump";
import { ArrowUpRight } from "lucide-react";
import { excludedFor, notRun, notRunText } from "@/lib/agent-data";
import { TASKS_PER_PRICE, costSource, hasTaskCosts, isLowerBound, pricedTasks, qualify, regionNote } from "@/lib/cost";
import { allProviders, hasResults, trackInfo, tracks } from "@/lib/data";
import type { Provider, Track } from "@/lib/data";
import { setAsideSentence } from "@/lib/exclusions";
import { formatGiB, formatMoney } from "@/lib/format";
import { commonPrice, commonSize, conversionNote, usdPrice } from "@/lib/fx";
import type { PriceKey } from "@/lib/fx";
import { allocationNotes, destroyNotes, execNotes, farNotes, forTrack, machineNotes, mergeNotes, probeNote, snapshotNotes } from "@/lib/notes";
import { isExtraTier, isProviderId, providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { realistic } from "@/lib/realistic-data";
import { realtaskBurst } from "@/lib/realtask-burst-data";
import { advertised } from "@/lib/sizes";
import { hasStress } from "@/lib/stress";
import type { TrackId } from "@/lib/tracks";

/*
 * The homepage's sections that follow the machine switch, shared by the
 * server, which renders the landing track's and each card's first tab into
 * the HTML, and the browser, which loads this module to build the rest when
 * they're opened (components/home-lazy.tsx). Moved out of app/page.tsx
 * unchanged apart from that split.
 */

/** The rows the Machines section lists: a CPU tier runs on its provider's machine, so the tier table covers it instead. */
const machineRows = (track: Track) => track.providers.filter((p) => !isExtraTier(p.id));

/** The machine a provider ran on in a track, for hover cards: "4 vCPU, 8 GB RAM". */
const ranOn = (p: Provider | undefined) => {
  const m = p?.measuredAllocations[0];
  return m ? `${m.cpu} vCPU, ${formatGiB(m.memoryGiB)} RAM` : "size not measured";
};

/** Stands in for a section's charts in a track with no published results yet. */
const Pending = ({ track }: { track: Track }) => (
  <Card className="text-s text-neutral-7">
    <span className="font-medium text-neutral-10">{trackInfo[track.id].label}: coming in the next update.</span> Switch to{" "}
    {`${trackInfo[track.id === "default" ? "same-spec" : "default"].label.toLowerCase()} for this release's results.`}
  </Card>
);

/** One tab per metric, each a column chart with its own subtitle and notes. */
const metricTabs = (
  track: Track,
  items: readonly { id: string; what: string; tab?: string; notes?: Notes; only?: readonly ProviderId[]; empty?: string }[],
): Tab[] =>
  items.map(({ id, what, tab, notes, only, empty }) => {
    const m = track.metric(id);
    return { id, label: tab ?? m.label, content: <MetricChart track={track} metric={m} what={what} notes={notes} only={only} empty={empty} /> };
  });

const per = (k: PriceKey) => (k === "hourly" ? "an hour" : "per vCPU-hour");

/** Dollar prices of the machine each provider ran in this track, cheapest first. Euro prices are converted and marked. */
function PriceChart({ track }: { track: Track }) {
  const title = track.id === "default" ? "Price per hour of each default sandbox" : "Price per hour of the machine each provider ran";
  const what = track.id === "default" ? "The sandbox you get without choosing a size, so sizes differ" : "The machine we measured inside";
  const priced = track.providers.flatMap((p) => {
    const price = usdPrice(p, "hourly");
    return price ? [{ p, ...price }] : [];
  });
  // A lower bound can't be ranked against a price, so lower bounds come after every exact price.
  const columns: Column[] = priced
    .sort((a, b) => Number(isLowerBound(a)) - Number(isLowerBound(b)) || a.usd - b.usd)
    .map(({ p, usd, converted, original, bound }) => ({
      provider: p.id,
      label: qualify({ amount: formatMoney(usd, "USD"), bound, style: "tight" }),
      mark: converted ? 1 : undefined,
      segments: [{ value: usd, color: providerColor(p.id), fill: "solid" }],
      detail: [`${qualify({ amount: formatMoney(usd, "USD"), bound })} ${per("hourly")}${converted ? ` (${original})` : ""}${bound === "lower" ? ", a lower bound" : ""}`, ranOn(p)],
    }));
  const unpriced = track.providers.filter((p) => !usdPrice(p, "hourly"));
  const lowerBounds = priced.filter(isLowerBound);
  return (
    <>
      <ChartHead title={title} sub={`${what} · From each provider's price list · US dollars · Lower is better`} />
      <Columns columns={columns} label={title} />
      <Footnotes
        items={[
          ...priced.filter((x) => x.converted).map(({ p, original }) => ({ mark: 1, text: <><Who id={p.id} /> {conversionNote(original, per("hourly"))}</> })),
          ...(unpriced.length > 0 ? [{ text: <>No price for {unpriced.map((p, i) => <span key={p.id}>{i > 0 ? ", " : ""}<Who id={p.id} /></span>)}: its measured machine did not match a priced size.</> }] : []),
          ...lowerBounds.map(({ p }) => ({ text: <><Who id={p.id} />: at least this much. Its price counts only the resources requested, and it also bills use above them, so it is listed after every exact price.</> })),
          ...priced.flatMap(({ p }) => { const note = regionNote(p); return note ? [{ text: <><Who id={p.id} />: {sentence(note)}</> }] : []; }),
          { text: "CPU and memory only, at list price. Boat charges a flat rate per size. Upstash and boxd may cost less: they bill only part of the machine." },
          ...trackFootnotes(track),
        ]}
      />
    </>
  );
}

/** Price of the same machine everywhere, cheapest first. The same in both tracks: it is a price list, not a measurement. */
function CommonPriceChart({ track }: { track: Track }) {
  const columns: Column[] = track.providers
    .flatMap((p) => {
      const price = commonPrice(p);
      return price ? [{ p, usd: price.usd }] : [];
    })
    .sort((a, b) => a.usd - b.usd)
    .map(({ p, usd }) => ({
      provider: p.id,
      label: formatMoney(usd, "USD"),
      segments: [{ value: usd, color: providerColor(p.id), fill: "solid" }],
      detail: [["Per hour", formatMoney(usd, "USD")], commonSize.label],
    }));
  return (
    <>
      <ChartHead title={`Price per hour of a ${commonSize.label} sandbox`} sub="The same size everywhere · From each provider's price list · US dollars · Lower is better" />
      <Columns columns={columns} label={`Price of a ${commonSize.label} sandbox`} />
      <Footnotes
        items={[
          ...track.providers.filter((p) => commonPrice(p) === null).map((p) => ({ text: <><Who id={p.id} /> does not list a {commonSize.label} machine, so no price is shown.</> })),
          ...track.providers.flatMap((p) => { const note = regionNote(p); return note && commonPrice(p) !== null ? [{ text: <><Who id={p.id} />: {sentence(note)}</> }] : []; }),
          { text: "CPU and memory only, at list price. Disk, transfer, subscriptions and free credits are left out. Upstash bills only while the CPU is busy, so it may cost less. Boat charges a flat rate per size." },
        ]}
      />
    </>
  );
}

/** Ticks counted per 1,000 tasks, back on the per-task scale the points use. */
const perTask = ([first, ...rest]: readonly [number, ...number[]]): readonly [number, ...number[]] => [first / TASKS_PER_PRICE, ...rest.map((t) => t / TASKS_PER_PRICE)];

/** The quadrant: agent work time across, cost per task up, one plain dot per provider. */
function CostQuadrant({ track }: { track: Track }) {
  const replay = track.metric("tool-replay");
  // A lower bound has no place on a cost axis: the charge could sit anywhere above it.
  const bounded = pricedTasks(track).filter((t) => isLowerBound(t.cost));
  const points: ScatterPoint[] = pricedTasks(track).flatMap(({ id, cost }) => {
    if (isLowerBound(cost)) return [];
    const t = replay.values.find((v) => v.provider === id)?.p50 ?? null;
    const m = track.providers.find((p) => p.id === id)?.measuredAllocations[0];
    return t === null ? [] : [{ provider: id, x: t, y: cost.usd, detail: [costSource(id, cost), ...(m ? [`Ran on ${m.cpu} vCPU`] : [])] }];
  });
  const machine = allocationNotes(track);
  const xs = points.map((p) => p.x);
  const head = <ChartHead title="Agent work vs cost" sub="Time for 100 tool calls against cost per 1,000 tasks · Lower left is faster and cheaper" />;
  if (!hasTaskCosts(track))
    return (
      <>
        {head}
        <NoCostResults />
      </>
    );
  // Every cost here is a lower bound: nothing can be placed on the cost axis, so say why instead.
  if (points.length === 0)
    return (
      <>
        {head}
        <Footnotes items={bounded.map((t) => ({ text: <><Who id={t.id} /> isn&apos;t plotted: its cost is a lower bound, so its place on the cost axis isn&apos;t known.</> }))} />
      </>
    );
  return (
    <>
      {head}
      <Scatter
        points={points}
        xTicks={logTicks(Math.min(...xs, 10), Math.max(...xs, 20))}
        // Ticks fall on round amounts per 1,000 tasks, the unit the axis prints.
        yTicks={perTask(linearTicks(Math.max(...points.map((p) => p.y), 0) * TASKS_PER_PRICE))}
        xTitle="Median time for 100 tool calls, seconds (log scale)"
        yTitle="Cost per 1,000 tasks (USD)"
      />
      <Footnotes
        items={[
          { text: "Time is the median from the main tests. Cost is from the separate cost run. Hover or focus a dot for its numbers." },
          ...points.flatMap((p) => (machine[p.provider] ? [{ text: <><Who id={p.provider} />: {sentence(machine[p.provider] ?? "")}</> }] : [])),
          ...bounded.map((t) => ({ text: <><Who id={t.id} /> isn&apos;t plotted: its cost is a lower bound, so its place on the cost axis isn&apos;t known.</> })),
          ...trackFootnotes(track),
        ]}
      />
    </>
  );
}

/** A note for each provider whose bursts did not all finish, counted from the data. */
function partialBursts(track: Track, id: string): Notes {
  return Object.fromEntries(
    track.metric(id).values.flatMap((v) => {
      if (v.n === 0 || v.failures === 0) return [];
      const limits = v.limitFailures === v.failures ? "hit our plan's start limit" : `failed, ${v.limitFailures} on our plan's start limit`;
      const these = v.n === 1 ? "This is that one burst." : `These are those ${v.n}.`;
      return [[v.provider, `only ${v.n} of ${v.n + v.failures} bursts finished; the other ${v.failures} ${limits}. ${these}`]];
    }),
  );
}

/** Attempts that never started because a provider failure on the same sandbox blocked them, from the data. */
function blockedNotes(track: Track, id: string): Notes {
  return Object.fromEntries(track.metric(id).values.flatMap((v) => (v.blockedNote ? [[v.provider, v.blockedNote]] : [])));
}

/** Reasons a test was not run, shown only where the data has no result for that provider. */
function notRunNotes(track: Track, id: string): Notes {
  const m = track.metric(id);
  return Object.fromEntries(
    Object.entries(notRun[track.id][id] ?? {}).flatMap(([pid, why]) => {
      const v = m.values.find((x) => x.provider === pid);
      return !v || v.n === 0 ? [[pid, notRunText(why)]] : [];
    }),
  );
}

/** Machine-probe notes only where the probe gave no result. */
function probeNotes(track: Track): Notes {
  const v = track.metric("cpu-single").values.find((x) => x.provider === "superserve");
  return track.providers.some((p) => p.id === "superserve") && (!v || v.n === 0) ? { superserve: probeNote } : {};
}

/** A headline card. Its title opens its section on the matching tab; a wide card spans the row. */
function Headline({
  marker,
  title,
  sub,
  section,
  tab,
  wide = false,
  children,
}: {
  marker: string;
  title: string;
  sub: string;
  section: string;
  tab: string;
  wide?: boolean;
  children: ReactNode;
}) {
  // The title opens the full chart; each column inside opens its provider's page, so the card itself isn't a link.
  return (
    <div className={`surface flex min-w-0 flex-col p-m sm:p-l ${wide ? "md:col-span-2" : ""}`}>
      <h2 className="font-brand text-l font-medium">
        <JumpLink section={section} tab={tab} className="group focus-ring flex items-center gap-xs rounded-xs">
          <span aria-hidden className="size-s shrink-0" style={{ backgroundColor: marker }} />
          <span className="min-w-0 truncate group-hover:underline group-hover:decoration-neutral-6 group-hover:underline-offset-4">{title}</span>
          <ArrowUpRight aria-hidden className="ml-auto size-5 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
        </JumpLink>
      </h2>
      <p className="mt-xxs mb-m truncate text-s text-neutral-7">{sub}</p>
      {children}
    </div>
  );
}

/** The real tasks lead: their times, then what they cost across the row, then cold start and tool calls. */
function Headlines({ track }: { track: Track }) {
  const cold = track.metric("cold");
  const replay = track.metric("tool-replay");
  const short = "Median s · lower is better";
  return (
    <div className="grid gap-m md:grid-cols-2">
      <Headline marker="var(--color-3)" title="Real task: fix and test" sub="Create to delete · Median s · lower is better" section={realTasksSection} tab="fix-and-test">
        <RealTaskHeadline track={track} profile="fix-and-test" />
      </Headline>
      <Headline marker="var(--color-3)" title="Real task: build" sub="Create to delete · Median s · lower is better" section={realTasksSection} tab="build">
        <RealTaskHeadline track={track} profile="build" />
      </Headline>
      <Headline marker="var(--color-1)" title="Real task cost, per 1,000" sub="Create to delete · USD · lower is better" section={taskCostSection} tab="fix-and-test" wide>
        <TaskCostHeadline track={track} />
      </Headline>
      <Headline marker="var(--color-2)" title="Cold start" sub={short} section="startup" tab="cold">
        <MetricChart track={track} metric={cold} what="" compact />
      </Headline>
      <Headline marker="var(--color-3)" title="100 tool calls" sub={short} section="agent" tab="tool-replay">
        <MetricChart track={track} metric={replay} what="" compact />
      </Headline>
    </div>
  );
}

/** Runs a provider's export set aside and reran, one plain sentence each under the reliability chart, from the data. */
function SetAsideNotes() {
  const notes = allProviders.flatMap((id) => {
    const s = setAsideSentence(id);
    return s ? [{ id, s }] : [];
  });
  if (notes.length === 0) return null;
  return (
    <ul className="mt-m flex flex-col gap-xxs text-xs text-pretty text-neutral-8">
      {notes.map(({ id, s }) => (
        <li key={id} className="flex gap-1.5">
          <span aria-hidden className="mt-[0.4em] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: providerColor(id) }} />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}


/**
 * Each of this page's tabbed cards' tabs for a track. The server sends a
 * card's first tab with its chart; the rest are built from this list in the
 * browser when first opened (components/lazy-tabs.tsx, components/tab-sets.tsx).
 */
export const homeTabSets = {
  startup: (track: Track): Tab[] => [
    ...metricTabs(track, [{ id: "cold", what: "create() to first command, without our SDK's setup", tab: "Cold start", notes: machineNotes(track) }]),
    {
      id: "cold-all",
      label: "Every cold start",
      content: (
        <>
          <ChartHead title="Every cold start" sub="Each successful cold start, one ridge per provider · Log scale · Further left is faster" />
          <Ridgelines samples={Object.fromEntries(Object.entries(track.coldSamples).filter(([id]) => isProviderId(id) && !isExtraTier(id)))} />
        </>
      ),
    },
  ],
  agent: (track: Track): Tab[] =>
    metricTabs(track, [
      { id: "tool-replay", tab: "Tool replay", what: "100 tool calls in a row: write, read, edit, list, grep, run a test", notes: mergeNotes(farNotes, execNotes) },
      { id: "npm-install", what: "npm ci for a small Vite and React app", notes: mergeNotes(farNotes, machineNotes(track), blockedNotes(track, "npm-install")) },
      { id: "pip-install", what: "requests and numpy from PyPI", notes: farNotes },
      { id: "git-clone", what: "Shallow clone of a small pinned repo", notes: farNotes },
      { id: "dev-server", what: "Start Vite and wait until it is ready", notes: mergeNotes(farNotes, blockedNotes(track, "dev-server")) },
      { id: "preview-first-byte", tab: "Preview URL", what: "Fetch the dev server through the public preview URL", notes: mergeNotes(farNotes, blockedNotes(track, "preview-first-byte")) },
      { id: "edit-loop", tab: "Edit loop", what: "Edit a file, rebuild, fetch the page again", notes: mergeNotes(farNotes, blockedNotes(track, "edit-loop")) },
    ]),
  everyday: (track: Track): Tab[] => {
    const left = excludedFor(track)["files-10mb"] ?? {};
    return metricTabs(track, [
      { id: "command", what: "A no-op command, mostly network and API overhead", notes: execNotes },
      { id: "files-1kb", tab: "1 KB file", what: "Write a 1 KB file and read it back" },
      {
        id: "files-10mb",
        tab: "10 MB file",
        what: "Write a 10 MB file and read it back",
        only: track.providers.flatMap((p) => (left[p.id] ? [] : [p.id])),
        notes: Object.fromEntries(Object.entries(left).map(([id, why]) => [id, `left out: ${why}`])),
      },
      { id: "reconnect", what: "Attach to an existing sandbox by ID and run a command" },
      { id: "destroy", what: "Delete the sandbox and wait for confirmation", notes: forTrack(track, destroyNotes) },
    ]);
  },
  state: (track: Track): Tab[] => [
    ...(hasPauseSplit(track)
      ? [
          { id: "resume", label: "Resume", content: <PausePart track={track} part="resume" /> },
          { id: "pause", label: "Pause", content: <PausePart track={track} part="pause" /> },
        ]
      : []),
    { id: "pause-resume", label: "Pause + resume", content: <PauseChart track={track} /> },
    ...metricTabs(track, [
      { id: "snapshot", what: "Save a prepared sandbox as a snapshot", notes: mergeNotes(blockedNotes(track, "snapshot"), notRunNotes(track, "snapshot"), forTrack(track, snapshotNotes)) },
      { id: "create-from-snapshot", tab: "Start from snapshot", what: "New sandbox from that snapshot, then a command", notes: mergeNotes(blockedNotes(track, "create-from-snapshot"), notRunNotes(track, "create-from-snapshot"), forTrack(track, snapshotNotes)) },
    ]),
  ],
  scale: (track: Track): Tab[] =>
    metricTabs(track, [
      { id: "burst-10", tab: "10 at once", what: "10 creates at once, until all 10 run a command", notes: mergeNotes(partialBursts(track, "burst-10"), notRunNotes(track, "burst-10")) },
      { id: "burst-25", tab: "25 at once", what: "25 creates at once, until all 25 run a command", notes: mergeNotes(partialBursts(track, "burst-25"), notRunNotes(track, "burst-25")), empty: "Our run was stopped before any provider finished three bursts of 25. Coming in the next update." },
    ]),
  cost: (track: Track): Tab[] => [
    { id: "task", label: "Quick task", content: <CostPerTaskChart track={track} /> },
    { id: "common", label: `Hourly, ${commonSize.label}`, content: <CommonPriceChart track={track} /> },
    { id: "hour", label: track.id === "default" ? "Hourly, default sandbox" : "Hourly, machine it ran", content: <PriceChart track={track} /> },
  ],
  machines: (track: Track): Tab[] => [
    {
      id: "allocation",
      label: "Asked vs measured",
      content: (
        <>
          <ChartHead
            title="What each provider ran"
            sub={track.id === "default" ? "Each provider's default sandbox, and the vCPU and RAM measured inside it" : "Asked for 4 vCPU, 8 GB; measured inside each sandbox"}
          />
          <Allocations track={track} />
        </>
      ),
    },
    ...(track.id === "default"
      ? [
          {
            id: "size",
            label: "Size",
            content: (
              <>
                <ChartHead title="Default machine size" sub="Advertised size of each provider's default sandbox · Tap or focus a bar for what we measured inside" />
                <MachineSizes providers={machineRows(track)} />
                <Footnotes items={[{ text: <><Who id="e2b" />: {advertised.e2b.note}</> }]} />
              </>
            ),
          },
        ]
      : []),
    {
      id: "details",
      label: "Hardware",
      content: (
        <>
          <ChartHead title="Hardware inside each sandbox" sub="Chip, memory, cloud and region, and how each sandbox is isolated" />
          <SpecSheet providers={machineRows(track)} track={track.id} />
        </>
      ),
    },
    ...metricTabs(track, [
      { id: "cpu-single", what: "One core running a fixed Python loop", notes: probeNotes(track) },
      { id: "cpu-all", what: "Every core at once, so bigger machines win", notes: probeNotes(track) },
      { id: "memory", tab: "Memory", what: "Copying 16 MB in memory", notes: probeNotes(track) },
      { id: "disk-write", what: "Writing a 64 MB file in order", notes: probeNotes(track) },
      { id: "disk-read", what: "Reading that file back, possibly from cache", notes: probeNotes(track) },
      { id: "iops-write", tab: "Random write", what: "4 KB writes, each synced to disk", notes: probeNotes(track) },
      { id: "iops-read", tab: "Random read", what: "4 KB random reads", notes: probeNotes(track) },
    ]),
  ],
} satisfies Record<string, (track: Track) => Tab[]>;
type HomeTabSetId = keyof typeof homeTabSets;

/** A tabbed card from a set. On the server every tab past the first is a stand-in that builds itself when opened. */
function HomeTabs({ set, track, label, section }: { set: HomeTabSetId; track: Track; label: string; section?: string }) {
  return <TabCard label={label} section={section} tabs={deferTabs(homeTabSets[set](track), set, track.id)} />;
}

/**
 * The homepage's parts that follow the machine switch, by name. The server
 * renders the landing track's; the other track's are built in the browser
 * from this module when the switch shows them (components/home-lazy.tsx).
 */
export const trackSections = {
  stats: (track: Track) => <StatStrip track={track} />,
  scores: (track: Track) => <Scores track={track} />,
  headlines: (track: Track) => <Headlines track={track} />,
  startup: (track: Track) => <HomeTabs set="startup" track={track} label="Start-up" section="startup" />,
  "real-tasks": (track: Track) => <RealTasks track={track} />,
  "realtask-burst": (track: Track) =>
    track.id === "same-spec" ? (
      <RealtaskBurstChart data={realtaskBurst} />
    ) : (
      <p className="max-w-[72ch] text-s text-pretty text-neutral-7">Fix and test, 5 at once, ran only on the same 4 vCPU, 8 GB machine. Switch to Same machine to see it.</p>
    ),
  agent: (track: Track) => <HomeTabs set="agent" track={track} label="Tool calls and agent steps" section="agent" />,
  everyday: (track: Track) => <HomeTabs set="everyday" track={track} label="Everyday calls" />,
  state: (track: Track) => <HomeTabs set="state" track={track} label="Pause & snapshots" section="state" />,
  scale: (track: Track) =>
    [track.metric("burst-10"), track.metric("burst-25")].every((m) => m.values.length === 0) ? (
      <Card>
        <ComingNext compact>Bursts of 10 and 25 sandboxes run in their own suite, three bursts per size.</ComingNext>
      </Card>
    ) : (
      <HomeTabs set="scale" track={track} label="Bursts" section="scale" />
    ),
  stress: (track: Track) =>
    hasStress(track.stress) ? (
      <StressSection stress={track.stress} />
    ) : (
      <Card className="text-s text-neutral-7">
        <span className="font-medium text-neutral-10">{trackInfo[track.id].label}: no stress results yet.</span> Switch to{" "}
        {`${trackInfo[track.id === "default" ? "same-spec" : "default"].label.toLowerCase()} for them.`}
      </Card>
    ),
  cost: (track: Track) => (
    <>
      <HomeTabs set="cost" track={track} label="Cost" section="cost" />
      <Card className="mt-m">
        <CostQuadrant track={track} />
      </Card>
    </>
  ),
  reliability: (track: Track) => (
    <Card>
      <Reliability track={track} />
      <SetAsideNotes />
    </Card>
  ),
  machines: (track: Track) => <HomeTabs set="machines" track={track} label="Machines" />,
} satisfies Record<string, (track: Track) => ReactNode>;

/** Parts shown even for a track with no published results: they say so themselves. */
export const untrackedSections = {
  "task-cost": (track: Track) => <TaskCost track={track} />,
  tiers: (track: Track) => {
    const brands = tieredWithData(track);
    return brands.length === 0 ? (
      <Card className="text-s text-neutral-7">CPU tiers ran on {trackInfo["same-spec"].label} only, where every provider has the same machine.</Card>
    ) : (
      <div className="flex flex-col gap-m">
        {brands.map((brand) => (
          <Card key={brand}>
            <ChartHead title={`${providerName(brand)} on each CPU tier`} sub="Same sandbox, same tests · Median · Green is better and red is worse than the tier a new account gets" />
            <TierTable brand={brand} track={track} realistic={realistic} burst={realtaskBurst} />
          </Card>
        ))}
      </div>
    );
  },
} satisfies Record<string, (track: Track) => ReactNode>;

export type HomeSectionId = keyof typeof trackSections | keyof typeof untrackedSections;
const isTracked = (id: HomeSectionId): id is keyof typeof trackSections => id in trackSections;

/** A part of the homepage for one track: its charts, or the placeholder where the track has no results yet. */
export function HomeSection({ section, track }: { section: HomeSectionId; track: TrackId }) {
  const t = tracks[track];
  if (!isTracked(section)) return untrackedSections[section](t);
  return hasResults(t) ? trackSections[section](t) : <Pending track={t} />;
}
