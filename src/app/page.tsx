import type { ReactNode } from "react";

import { Allocations } from "@/components/allocations";
import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { Lockup } from "@/components/brand";
import { CostPerTaskChart, NoCostResults, costColumns, taskDefinition } from "@/components/cost";
import { MachineSizes } from "@/components/machine-sizes";
import { ChartHead, ComingNext, CompactNotes, Footnotes, MetricChart, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import type { Notes } from "@/components/metric-chart";
import { PauseChart, PausePart, hasPauseSplit } from "@/components/pause-chart";
import { Reliability } from "@/components/reliability";
import { Ridgelines } from "@/components/ridgelines";
import { Scatter, linearTicks, logTicks } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
import { SdkReadyChart, hasSdkReady } from "@/components/sdk-ready";
import { JumpLink } from "@/components/jump";
import { SectionLinks, SectionMenu } from "@/components/section-nav";
import { SpecSheet } from "@/components/spec-sheet";
import { StatStrip } from "@/components/stat-strip";
import { Card, TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { Tracked } from "@/components/track";
import { TrackSwitch } from "@/components/track-switch";
import { TraceWaterfall } from "@/components/trace-waterfall";
import { excludedFor, notRun, notRunText } from "@/lib/agent-data";
import { TASKS_PER_PRICE, hasTaskCosts, pricedTasks } from "@/lib/cost";
import { hasResults, isPreview, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Provider, Track } from "@/lib/data";
import { formatGiB, formatMoney } from "@/lib/format";
import { commonPrice, commonSize, conversionNote, usdPrice } from "@/lib/fx";
import type { PriceKey } from "@/lib/fx";
import { allocationNotes, execNotes, farNotes, machineNotes, mergeNotes, probeNote } from "@/lib/notes";
import { providerColor, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { advertised } from "@/lib/sizes";

// Reference: Artificial Analysis for structure (a compact two-row header that
// marks the section you are in, a short hero that leads with clickable
// highlight cards, then one bordered card per topic with a tab band, every
// chart titled with what it measures and which way is better, an
// attractive-quadrant scatter). scrapingbench and dithercn for the look
// (black page, one hue per provider, dithered fills with a solid cap).
// Palette: page oklch(0.13 0 0), cards oklch(0.16 0 0), ink oklch(0.96 0 0),
// muted oklch(0.7 0 0), Sandbox SDK amber only for "you are here", one fixed
// colour per provider, red only for failures.
// Type: Geist Pixel for page and section titles, Geist Sans for labels, Geist Mono for numbers.
// Signature: vertical dithered columns, densest at the top, value printed above.
// Layout move: one global machine switch; every chart follows it, and a
// machine that differs from the track's carries a mark. Each headline card
// opens its section on the matching tab.
// Avoiding: poster-sized hero, intro paragraphs, overall scores, winner badges, a heavy filled quadrant.

// Each entry: section id, nav label, and the tab a click opens, so "Start-up" lands on the cold start chart.
const sections = [
  ["startup", "Start-up", "cold"],
  ["agent", "Agent work", "tool-replay"],
  ["everyday", "Everyday"],
  ["state", "Pause & snapshots", "create-from-snapshot"],
  ["scale", "Bursts", "burst-10"],
  ["machines", "Machines"],
  ["reliability", "Reliability"],
  ["cost", "Cost", "task"],
  ["method", "Method"],
] as const;

const short = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** "Oct 19, 2026", or "Oct 19–21, 2026" when runs span several days in one month. */
function dayRange(window: Track["window"]) {
  const start = new Date(window.start);
  const end = new Date(window.end);
  if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) return short(start, { month: "short", day: "numeric", year: "numeric" });
  if (start.getUTCMonth() === end.getUTCMonth())
    return `${short(start, { month: "short", day: "numeric" })}–${short(end, { day: "numeric" })}, ${start.getUTCFullYear()}`;
  return `${short(start, { month: "short", day: "numeric" })} – ${short(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** The machine a provider ran on in a track, for hover cards: "4 vCPU, 8 GB RAM". */
const ranOn = (p: Provider | undefined) => {
  const m = p?.measuredAllocations[0];
  return m ? `${m.cpu} vCPU, ${formatGiB(m.memoryGiB)} RAM` : "size not measured";
};

function Section({ id, title, lede, children }: { id: string; title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 pt-14 sm:pt-20 lg:scroll-mt-28">
      <h2 id={`${id}-title`} className="flex items-center gap-2.5 text-[22px] leading-none font-semibold tracking-tight sm:text-[24px]">
        <span aria-hidden className="size-2.5 shrink-0 bg-[var(--foreground)]" />
        {title}
      </h2>
      <p className="mt-2.5 mb-5 max-w-[72ch] text-[13.5px] leading-relaxed text-pretty text-[var(--muted)]">{lede}</p>
      {children}
    </section>
  );
}

/** Stands in for a section's charts in a track with no published results yet. */
const Pending = ({ track }: { track: Track }) => (
  <Card className="text-[13.5px] text-[var(--muted)]">
    <span className="font-medium text-[var(--foreground)]">{trackInfo[track.id].label}: coming in the next update.</span> Switch to{" "}
    {`${trackInfo[track.id === "default" ? "same-spec" : "default"].label.toLowerCase()} for this release's results.`}
  </Card>
);

/** A section's content for each track, or the placeholder where a track has no results. */
const PerTrack = ({ children }: { children: (track: Track) => ReactNode }) => (
  <Tracked>{(track) => (hasResults(track) ? children(track) : <Pending track={track} />)}</Tracked>
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
  const title = track.id === "default" ? "Price of each default sandbox" : "Price of the machine each provider ran";
  const what = track.id === "default" ? "The machine each provider gives you by default, so sizes differ" : "The machine measured inside, at published rates";
  const priced = track.providers.flatMap((p) => {
    const price = usdPrice(p, "hourly");
    return price ? [{ p, ...price }] : [];
  });
  const columns: Column[] = priced
    .sort((a, b) => a.usd - b.usd)
    .map(({ p, usd, converted, original }) => ({
      provider: p.id,
      label: formatMoney(usd, "USD"),
      mark: converted ? 1 : undefined,
      segments: [{ value: usd, color: providerColor(p.id), variant: "gradient" }],
      detail: [`${formatMoney(usd, "USD")} ${per("hourly")}${converted ? ` (${original})` : ""}`, ranOn(p)],
    }));
  const unpriced = track.providers.filter((p) => !usdPrice(p, "hourly"));
  return (
    <>
      <ChartHead title={title} sub={`${what} · US dollars · Lower is better`} />
      <Columns columns={columns} label={title} />
      <Footnotes
        items={[
          ...priced.filter((x) => x.converted).map(({ p, original }) => ({ mark: 1, text: <><Who id={p.id} /> {conversionNote(original, per("hourly"))}</> })),
          ...(unpriced.length > 0 ? [{ text: <>No price for {unpriced.map((p, i) => <span key={p.id}>{i > 0 ? ", " : ""}<Who id={p.id} /></span>)}: its measured machine did not match a priced size.</> }] : []),
          { text: "Compute-only list prices for the machine measured inside, not invoices. Boat is a flat rate per size. Upstash and boxd are upper bounds: they bill for less than the full allocation." },
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
      segments: [{ value: usd, color: providerColor(p.id), variant: "gradient" }],
      detail: [`${formatMoney(usd, "USD")} an hour`, commonSize.label],
    }));
  return (
    <>
      <ChartHead title={`Price of a ${commonSize.label} sandbox`} sub="Per hour at each provider's published rates · US dollars · Lower is better" />
      <Columns columns={columns} label={`Price of a ${commonSize.label} sandbox`} />
      <Footnotes
        items={[
          ...track.providers.filter((p) => commonPrice(p) === null).map((p) => ({ text: <><Who id={p.id} /> does not list a {commonSize.label} machine, so no price is shown.</> })),
          { text: "Compute only, at list price. Disk, transfer, subscriptions and free credits are left out. Upstash charges a rate per box size but only while the CPU is busy, so its figure is an upper bound. Boat charges a flat rate per size." },
        ]}
      />
    </>
  );
}

/** Ticks counted per 1,000 tasks, back on the per-task scale the points use. */
const perTask = ([first, ...rest]: readonly [number, ...number[]]): readonly [number, ...number[]] => [first / TASKS_PER_PRICE, ...rest.map((t) => t / TASKS_PER_PRICE)];

/** The quadrant: agent work time across, cost per task up, each point shaped by where its cost came from. */
function CostQuadrant({ track }: { track: Track }) {
  const replay = track.metric("tool-replay");
  const points: ScatterPoint[] = pricedTasks(track).flatMap(({ id, cost }) => {
    const t = replay.values.find((v) => v.provider === id)?.p50 ?? null;
    const m = track.providers.find((p) => p.id === id)?.measuredAllocations[0];
    return t === null ? [] : [{ provider: id, x: t, y: cost.usd, kind: cost.kind, tag: m ? `${m.cpu} vCPU` : undefined }];
  });
  const machine = allocationNotes(track);
  const xs = points.map((p) => p.x);
  const head = <ChartHead title="Agent work vs cost" sub="Median tool replay time against what 1,000 tool replay tasks cost · Both lower is better" />;
  if (!hasTaskCosts(track))
    return (
      <>
        {head}
        <NoCostResults />
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
        xTitle="Median tool replay, seconds (log scale)"
        yTitle="Cost per 1,000 tasks (USD)"
      />
      <Footnotes
        items={[
          { text: `${taskDefinition} Time is the median tool replay from the main tests. Labels show the vCPUs it ran on.` },
          ...points.flatMap((p) => (machine[p.provider] ? [{ text: <><Who id={p.provider} />: {sentence(machine[p.provider] ?? "")}</> }] : [])),
          ...points.flatMap((p) => (p.kind === "estimate" ? [p.provider] : [])).slice(0, 1).map(() => ({
            text: <>Hollow points are list-price estimates, not billing: {points.filter((p) => p.kind === "estimate").map((p, i) => <span key={p.provider}>{i > 0 ? ", " : ""}<Who id={p.provider} /></span>)}.</>,
          })),
          { text: <><Who id="boat" /> and <Who id="boxd" /> run in Europe, so every call from our Florida server crosses the Atlantic.</> },
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

/** A headline card. The whole card is a link that opens its section on the matching tab. */
function Headline({
  marker,
  title,
  sub,
  section,
  tab,
  children,
}: {
  marker: string;
  title: string;
  sub: string;
  section: string;
  tab: string;
  children: ReactNode;
}) {
  return (
    <JumpLink
      section={section}
      tab={tab}
      className="group flex min-w-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-[border-color,background-color] duration-150 outline-none hover:border-[var(--axis)] hover:bg-[var(--band)] focus-visible:ring-2 focus-visible:ring-[var(--brand)] motion-reduce:transition-none sm:p-5"
    >
      <h2 className="flex items-center gap-2 text-[15px] leading-tight font-medium tracking-tight">
        <span aria-hidden className="size-2.5 shrink-0" style={{ backgroundColor: marker }} />
        <span className="min-w-0 truncate">{title}</span>
        <span aria-hidden className="ml-auto text-[var(--muted)] transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-[var(--brand)] motion-reduce:transition-none">
          →
        </span>
      </h2>
      <p className="mt-1 mb-3 truncate text-[12px] text-[var(--muted)]">{sub}</p>
      {children}
    </JumpLink>
  );
}

function Headlines({ track }: { track: Track }) {
  const cold = track.metric("cold");
  const replay = track.metric("tool-replay");
  const restore = track.metric("create-from-snapshot");
  const { columns, marks } = costColumns(track);
  const machine = allocationNotes(track);
  const short = "Median s · lower is better";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Headline marker="var(--dither-color-blue)" title="Cold start" sub={short} section="startup" tab="cold">
        <MetricChart track={track} metric={cold} what="" compact />
      </Headline>
      <Headline marker="var(--dither-color-orange)" title="Agent work, 100 tool calls" sub={short} section="agent" tab="tool-replay">
        <MetricChart track={track} metric={replay} what="" compact />
      </Headline>
      <Headline marker="var(--dither-color-green)" title="Cost per 1,000 tasks" sub="USD · lower is better" section="cost" tab="task">
        {hasTaskCosts(track) ? (
          <>
            <Columns columns={columns} label="Cost per 1,000 tasks by provider" compact />
            <CompactNotes items={[...marks].map(([id, mark]) => ({ mark, id, note: machine[id] ?? "" }))} />
            <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">Plain: billed. Hatched: metered. Dotted: list-price estimate.</p>
          </>
        ) : (
          <NoCostResults compact />
        )}
      </Headline>
      <Headline marker="var(--dither-color-purple)" title="Start from snapshot" sub={short} section="state" tab="create-from-snapshot">
        <MetricChart track={track} metric={restore} what="" compact notes={blockedNotes(track, "create-from-snapshot")} />
      </Headline>
    </div>
  );
}

/** The facts line under the title, for one track. */
function Facts({ track }: { track: Track }) {
  const next = track.absent.map((id) => providerInfo[id].name);
  const facts = hasResults(track)
    ? [dayRange(track.window), `${track.providers.length} providers${next.length ? ` (${next.join(" and ")} next)` : ""}`, "Florida, US", "100 runs per test, 30 per agent task"]
    : ["Coming in the next update", "Florida, US"];
  return <p className="text-[14px] text-pretty text-[var(--muted)]">{facts.join(" · ")}</p>;
}

/** Failures set aside in each track, for the Method section. */
function SetAside() {
  const rows = trackIds.flatMap((id) =>
    tracks[id].providers.flatMap((p) => p.ourFailures.map((f) => ({ track: id, p, f }))),
  );
  if (rows.length === 0) return <>No failures were set aside.</>;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {rows.map(({ track, p, f }) => (
        <li key={`${track}${p.id}${f.reason}`}>
          <span className="text-[var(--foreground)]">{trackInfo[track].tab}</span>, <Who id={p.id} />: {f.runs} {f.runs === 1 ? "run" : "runs"}, {f.count} {f.count === 1 ? "test" : "tests"}. {sentence(f.reason)}
        </li>
      ))}
    </ul>
  );
}

const methodRows: readonly (readonly [string, ReactNode])[] = [
  [
    "This release",
    "Default-machine timings come from one run on one harness commit. Snapshots, bursts, the same-machine track and cost per task come from runs on a later harness commit whose changes only touched cleanup. Tenki's same-machine run stopped early at 78 of 100 cold starts; each chart shows its attempt count. A burst size is published for a provider only when all three of its bursts finished, and a chart names the reason for any provider it leaves out. Failures caused by our own code are set aside, not counted. Boat will be added in the next update.",
  ],
  [
    "One SDK",
    "Every provider ran through Sandbox SDK, our own TypeScript SDK. Version 0.2.0 is public on npm, and the 1.0 used here will be published soon. Each adapter calls the provider's official SDK or API and uses its native path for commands and files where one exists.",
  ],
  [
    "Cold start",
    "Timed from create() until a bare true command succeeds in the new sandbox: the provider's own time. Our SDK's setup after that point is timed separately and shown as Ready through Sandbox SDK. It is never part of cold start or bursts.",
  ],
  [
    "Superserve",
    "Superserve ran a template we built with Node 22 and Python 3.11 preinstalled. Superserve offers a Node template (node-22) and a Python template (python-3.11), but our tests need both in one sandbox; before this template, our setup installed Python on every create.",
  ],
  [
    "Two tracks",
    <>
      Default machines: each provider&apos;s default sandbox, so sizes differ. E2B&apos;s default base template is 2 vCPU and 512 MB, though its pricing page says 4 GB. Same machine: every provider asked for 4 vCPU and 8 GB, Boat&apos;s default. boxd has no such size and ran 4 vCPU, 16 GB, its nearest. Superserve is left out because its account caps templates at 2 vCPU. Machines that differ from the track are marked on every chart.
    </>,
  ],
  [
    "Billing",
    "Cost per task comes from a separate cost run: 10 sandboxes per provider, each created, running the 100-call tool replay once and deleted, so one sandbox's charge is the cost of one task. The main benchmark sandboxes are not priced, because providers ran different mixes of tests in them. Billed is the provider's own per-sandbox charge (Upstash Box; Daytona, whose bill can still change for up to 48 hours). Metered is the provider's own recorded usage times its published rates (E2B and boxd usage meters; Tenki's server-recorded session start and end). Estimates use the provider's published per-second rates and billing rules on our measured create-to-delete time, because there is no per-sandbox billing data (Freestyle has no billing API; Superserve reports usage only per account). Credits, tax and plan minimums are left out. One task costs a fraction of a cent, so charts show the cost of 1,000 tasks; results.json and results.md keep the per-task amount too.",
  ],
  [
    "One location",
    "Every run started from one server in Florida, US. Distance to each provider's region affects every call; the Hardware tab under Machines shows where each sandbox ran.",
  ],
  [
    "Plans and limits",
    "We used each provider's self-serve account. Where a plan or account limit changed what we could test, the chart says so: Superserve's plan caps templates at 2 vCPU, so it is not in the 4 vCPU track; Boat's plan allows 200 creates a day; Daytona's account quota of 10 vCPU kept its 4 vCPU snapshot and burst tests from running. A paid plan or a quota increase may lift these, and we will add the results when it does.",
  ],
  [
    "Attempts",
    "100 runs per quick test, 30 per agent task and 30 per snapshot test. Bursts: 3 of each size, each timed until every sandbox in it runs a command.",
  ],
  [
    "Independent",
    "No provider paid for these results or had any say in them. Some may have seen an early copy to check for errors. We may work with some of these companies; that did not change how tests ran or how results are reported.",
  ],
  [
    "Failures",
    <>
      Only failures the provider caused count against it. We set aside failures our own code caused and ones we can&apos;t pin on either side, such as our SDK timing out while waiting. Attempts blocked by our own plan limits were rerun. Set aside:
      <SetAside />
    </>,
  ],
  ["Ties", "Medians within each other's 95% confidence intervals are effectively tied. Focus or hover a bar for its interval and attempt count."],
  [
    "Left out",
    <>
      Download speed, because the public test host rate-limited several providers.
    </>,
  ],
];

// The same-machine switch appears only once that track has results; until then it would lead to empty sections.
const showSwitch = tracks["same-spec"].providers.length > 0;

export default function Page() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_oklch,var(--background)_85%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-5 px-4 sm:px-6">
          <a href="#top" className="-my-2 shrink-0 py-2.5" aria-label="Sandbox bench, back to top">
            <Lockup />
          </a>
          <div className="hidden min-w-0 flex-1 self-stretch lg:flex">
            <SectionLinks sections={sections} />
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-2.5 lg:flex">
            {showSwitch ? <TrackSwitch size="small" /> : null}
            <a
              href="llms.txt"
              className="flex h-8 items-center rounded-md px-2.5 text-[13px] whitespace-nowrap text-[var(--muted)] transition-colors duration-150 outline-none hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--brand)] motion-reduce:transition-none"
            >
              For agents ↗
            </a>
          </div>
          <div className="ml-auto lg:hidden">
            <SectionMenu sections={sections} extra={{ href: "llms.txt", label: "For agents ↗" }} menuTop={showSwitch ? <TrackSwitch /> : undefined} />
          </div>
        </div>
      </header>

      {isPreview ? (
        <p role="note" className="border-b border-[var(--warn)]/40 bg-[color-mix(in_oklch,var(--warn)_14%,transparent)] px-4 py-2 text-center font-mono text-[12px] text-[var(--warn)]">
          Preview fixture: made-up numbers for layout checks. Not benchmark results.
        </p>
      ) : null}

      <main id="top" className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="flex flex-col gap-2 pt-8 pb-5 sm:pt-10">
          <h1 className="font-pixel text-[32px] leading-none tracking-tight text-balance sm:text-[44px]">Cloud sandboxes, measured</h1>
          <Tracked>{(track) => <Facts track={track} />}</Tracked>
          {showSwitch ? (
            // Wide screens carry the switch in the header; phones get it here as well as in the menu.
            <div className="mt-2 lg:hidden">
              <TrackSwitch />
            </div>
          ) : null}
        </div>

        <div className="pb-3">
          <PerTrack>{(track) => <StatStrip track={track} />}</PerTrack>
        </div>

        <PerTrack>{(track) => <Headlines track={track} />}</PerTrack>

        <TraceWaterfall />

        <Section
          id="startup"
          title="Start-up"
          lede="Cold start is the wait before an agent can do anything: from create() until the first command runs, the provider's own time. Ready through Sandbox SDK adds the setup our SDK does after that, marked as ours."
        >
          <PerTrack>
            {(track) => (
              <TabCard
                label="Start-up" section="startup"
                tabs={[
                  ...metricTabs(track, [{ id: "cold", what: "create() to first command, without our SDK's setup", tab: "Cold start", notes: machineNotes(track) }]),
                  ...(hasSdkReady(track) ? [{ id: "sdk-ready", label: "Ready through Sandbox SDK", content: <SdkReadyChart track={track} /> }] : []),
                  {
                    id: "cold-all",
                    label: "Every cold start",
                    content: (
                      <>
                        <ChartHead title="Every cold start" sub="Each successful cold start, one ridge per provider · Log scale · Further left is faster" />
                        <Ridgelines samples={track.coldSamples} />
                      </>
                    ),
                  },
                ]}
              />
            )}
          </PerTrack>
        </Section>

        <Section id="agent" title="Agent work" lede="Real coding-agent tasks, so CPU, disk and network count as much as the API.">
          <PerTrack>
            {(track) => (
              <TabCard
                label="Agent work" section="agent"
                tabs={metricTabs(track, [
                  { id: "tool-replay", tab: "Tool replay", what: "100 tool calls in a row: write, read, edit, list, grep, run a test", notes: mergeNotes(farNotes, execNotes) },
                  { id: "npm-install", what: "npm ci for a small Vite and React app", notes: mergeNotes(farNotes, machineNotes(track), blockedNotes(track, "npm-install")) },
                  { id: "pip-install", what: "requests and numpy from PyPI", notes: farNotes },
                  { id: "git-clone", what: "Shallow clone of a small pinned repo", notes: farNotes },
                  { id: "dev-server", what: "Start Vite and wait until it is ready", notes: mergeNotes(farNotes, blockedNotes(track, "dev-server")) },
                  { id: "preview-first-byte", tab: "Preview URL", what: "Fetch the dev server through the public preview URL", notes: mergeNotes(farNotes, blockedNotes(track, "preview-first-byte")) },
                  { id: "edit-loop", tab: "Edit loop", what: "Edit a file, rebuild, fetch the page again", notes: mergeNotes(farNotes, blockedNotes(track, "edit-loop")) },
                ])}
              />
            )}
          </PerTrack>
        </Section>

        <Section id="everyday" title="Everyday calls" lede="What an agent does hundreds of times per task: run a command, move files, reattach to a sandbox.">
          <PerTrack>
            {(track) => {
              const left = excludedFor(track)["files-10mb"] ?? {};
              return (
                <TabCard
                  label="Everyday calls"
                  tabs={metricTabs(track, [
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
                    { id: "destroy", what: "Delete the sandbox and wait for confirmation" },
                  ])}
                />
              );
            }}
          </PerTrack>
        </Section>

        <Section
          id="state"
          title="Pause & snapshots"
          lede="Pausing stops paying for idle time while an agent waits on a human, with every process kept. Where stop and start restarts the sandbox instead, we mark pause as not supported. Snapshots start many sandboxes from one prepared state."
        >
          <PerTrack>
            {(track) => (
              <TabCard
                label="Pause & snapshots" section="state"
                tabs={[
                  ...(hasPauseSplit(track)
                    ? [
                        { id: "resume", label: "Resume", content: <PausePart track={track} part="resume" /> },
                        { id: "pause", label: "Pause", content: <PausePart track={track} part="pause" /> },
                      ]
                    : []),
                  { id: "pause-resume", label: "Pause + resume", content: <PauseChart track={track} /> },
                  ...metricTabs(track, [
                    { id: "snapshot", what: "Save a prepared sandbox as a snapshot", notes: mergeNotes(blockedNotes(track, "snapshot"), notRunNotes(track, "snapshot")) },
                    { id: "create-from-snapshot", tab: "Start from snapshot", what: "New sandbox from that snapshot, then a command", notes: mergeNotes(blockedNotes(track, "create-from-snapshot"), notRunNotes(track, "create-from-snapshot")) },
                  ]),
                ]}
              />
            )}
          </PerTrack>
        </Section>

        <Section
          id="scale"
          title="Bursts"
          lede="10 or 25 sandboxes started at once, as an agent fanning out would, timed until the last one runs a command."
        >
          <PerTrack>
            {(track) => [track.metric("burst-10"), track.metric("burst-25")].every((m) => m.values.length === 0) ? (
              <Card>
                <ComingNext compact>Bursts of 10 and 25 sandboxes run in their own suite, three bursts per size.</ComingNext>
              </Card>
            ) : (
              <TabCard
                label="Bursts" section="scale"
                tabs={metricTabs(track, [
                  { id: "burst-10", tab: "10 at once", what: "10 creates at once, until all 10 run a command", notes: mergeNotes(partialBursts(track, "burst-10"), notRunNotes(track, "burst-10")) },
                  { id: "burst-25", tab: "25 at once", what: "25 creates at once, until all 25 run a command", notes: mergeNotes(partialBursts(track, "burst-25"), notRunNotes(track, "burst-25")), empty: "Our run was stopped before any provider finished three bursts of 25. Coming in the next update." },
                ])}
              />
            )}
          </PerTrack>
        </Section>

        <Section id="machines" title="Machines" lede="What each provider ran: what we asked for, what we measured inside, and the hardware underneath.">
          <PerTrack>
            {(track) => (
              <TabCard
                label="Machines"
                tabs={[
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
                              <MachineSizes providers={track.providers} />
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
                        <SpecSheet providers={track.providers} track={track.id} />
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
                ]}
              />
            )}
          </PerTrack>
        </Section>

        <Section id="reliability" title="Reliability" lede="How often each provider failed, and why. Only failures the provider caused are counted; Method lists the ones we set aside.">
          <PerTrack>
            {(track) => (
              <Card>
                <Reliability track={track} />
              </Card>
            )}
          </PerTrack>
        </Section>

        <Section id="cost" title="Cost" lede="What one tool replay task cost, read from each provider's billing where it reports one, and published prices for comparison.">
          <PerTrack>
            {(track) => (
              <>
                <TabCard
                  label="Cost" section="cost"
                  tabs={[
                    { id: "task", label: "Cost per task", content: <CostPerTaskChart track={track} /> },
                    { id: "common", label: `Price, ${commonSize.label}`, content: <CommonPriceChart track={track} /> },
                    { id: "hour", label: track.id === "default" ? "Price, default sandbox" : "Price, machine it ran", content: <PriceChart track={track} /> },
                  ]}
                />
                <Card className="mt-4">
                  <CostQuadrant track={track} />
                </Card>
              </>
            )}
          </PerTrack>
        </Section>

        <Section id="method" title="Method" lede="How the numbers were made, and what could bias them.">
          <Card>
            <dl className="grid gap-x-12 gap-y-5 text-[14px] leading-relaxed md:grid-cols-2">
              {methodRows.map(([term, text]) => (
                <div key={term}>
                  <dt className="font-medium">{term}</dt>
                  <dd className="mt-1 text-[var(--muted)]">{text}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </Section>
      </main>

      <footer className="mx-auto mt-24 max-w-[1200px] px-4 sm:px-6">
        <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--line)] py-8 text-[12px] text-[var(--muted)]">
          <span>
            Sandbox bench · <Tracked>{(track) => (hasResults(track) ? dayRange(track.window) : "not published yet")}</Tracked>
          </span>
          <span aria-hidden>·</span>
          <span>
            Data for both tracks:{" "}
            {["llms.txt", "results.json", "results.md"].map((f, i) => (
              <span key={f}>
                {i > 0 ? " · " : ""}
                <a className="-my-2 inline-block py-2 underline decoration-dotted underline-offset-4 hover:text-[var(--foreground)]" href={f}>
                  {f}
                </a>
              </span>
            ))}
          </span>
        </p>
      </footer>
    </>
  );
}
