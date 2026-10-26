import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Allocations } from "@/components/allocations";
import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { Lockup } from "@/components/brand";
import { CostPerTaskChart, NoCostResults, NotFromBill, costColumns } from "@/components/cost";
import { MachineSizes } from "@/components/machine-sizes";
import { MethodList } from "@/components/method-list";
import { ChartHead, ComingNext, CompactNotes, Footnotes, MetricChart, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import type { Notes } from "@/components/metric-chart";
import { PauseChart, PausePart, hasPauseSplit } from "@/components/pause-chart";
import { Reliability } from "@/components/reliability";
import { Ridgelines } from "@/components/ridgelines";
import { Scatter, linearTicks, logTicks } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
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
import { TASKS_PER_PRICE, costSource, hasTaskCosts, pricedTasks } from "@/lib/cost";
import { hasResults, isPreview, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Provider, Track } from "@/lib/data";
import { formatGiB, formatMoney } from "@/lib/format";
import { commonPrice, commonSize, conversionNote, usdPrice } from "@/lib/fx";
import type { PriceKey } from "@/lib/fx";
import { allocationNotes, execNotes, farNotes, machineNotes, mergeNotes, probeNote, upstashTwinNote } from "@/lib/notes";
import { providerColor, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { advertised } from "@/lib/sizes";

// Reference: Artificial Analysis for structure (a floating header with the logo
// and one bar of section links, a hero with the title on the left and a short
// list on the right, highlight cards, then one card per topic with its tabs
// along the top, every chart titled with what it measures and which way is
// better, an attractive-quadrant scatter). No divider lines anywhere.
// Look: the Untitled Graphical theme (components/graphical, GUI.md): black page,
// Neutral 2 cards, Neutral 7 for secondary text, its green (color-1) only for
// "you are here", Geist and Geist Mono. One fixed colour per provider, red only for failures.
// Signature: flat columns in each provider's colour, rounded at the top, value printed above.
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
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 pt-xxl sm:pt-[calc(var(--space-xxl)*1.5)]">
      <h2 id={`${id}-title`} className="flex items-center gap-s font-brand text-l font-medium">
        <span aria-hidden className="size-s shrink-0 bg-neutral-10" />
        {title}
      </h2>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-neutral-8">{lede}</p>
      {children}
    </section>
  );
}

/** Stands in for a section's charts in a track with no published results yet. */
const Pending = ({ track }: { track: Track }) => (
  <Card className="text-s text-neutral-7">
    <span className="font-medium text-neutral-10">{trackInfo[track.id].label}: coming in the next update.</span> Switch to{" "}
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
  const title = track.id === "default" ? "Price per hour of each default sandbox" : "Price per hour of the machine each provider ran";
  const what = track.id === "default" ? "The sandbox you get without choosing a size, so sizes differ" : "The machine we measured inside";
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
      segments: [{ value: usd, color: providerColor(p.id), fill: "solid" }],
      detail: [`${formatMoney(usd, "USD")} ${per("hourly")}${converted ? ` (${original})` : ""}`, ranOn(p)],
    }));
  const unpriced = track.providers.filter((p) => !usdPrice(p, "hourly"));
  return (
    <>
      <ChartHead title={title} sub={`${what} · From each provider's price list · US dollars · Lower is better`} />
      <Columns columns={columns} label={title} />
      <Footnotes
        items={[
          ...priced.filter((x) => x.converted).map(({ p, original }) => ({ mark: 1, text: <><Who id={p.id} /> {conversionNote(original, per("hourly"))}</> })),
          ...(unpriced.length > 0 ? [{ text: <>No price for {unpriced.map((p, i) => <span key={p.id}>{i > 0 ? ", " : ""}<Who id={p.id} /></span>)}: its measured machine did not match a priced size.</> }] : []),
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
  const points: ScatterPoint[] = pricedTasks(track).flatMap(({ id, cost }) => {
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
      <NotFromBill track={track} />
      <Footnotes
        items={[
          { text: "Time is the median from the main tests. Cost is from the separate cost run. Hover or focus a dot for its numbers." },
          ...points.flatMap((p) => (machine[p.provider] ? [{ text: <><Who id={p.provider} />: {sentence(machine[p.provider] ?? "")}</> }] : [])),
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
      className="surface group focus-ring flex min-w-0 flex-col p-m transition-colors duration-[var(--motion-duration)] ease-[var(--motion-easing)] hover:bg-neutral-3 motion-reduce:transition-none sm:p-l"
    >
      <h2 className="flex items-center gap-xs font-brand text-l font-medium">
        <span aria-hidden className="size-s shrink-0" style={{ backgroundColor: marker }} />
        <span className="min-w-0 truncate">{title}</span>
        <ArrowUpRight
          aria-hidden
          className="ml-auto size-5 shrink-0 text-neutral-7 transition-[color,transform] duration-[var(--motion-duration)] ease-[var(--motion-easing)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent motion-reduce:transition-none"
        />
      </h2>
      <p className="mt-xxs mb-m truncate text-s text-neutral-7">{sub}</p>
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
    <div className="grid gap-m md:grid-cols-2">
      <Headline marker="var(--color-2)" title="Cold start" sub={short} section="startup" tab="cold">
        <MetricChart track={track} metric={cold} what="" compact />
      </Headline>
      <Headline marker="var(--color-3)" title="Agent work, 100 tool calls" sub={short} section="agent" tab="tool-replay">
        <MetricChart track={track} metric={replay} what="" compact />
      </Headline>
      <Headline marker="var(--color-1)" title="Cost per 1,000 tasks" sub="USD · lower is better" section="cost" tab="task">
        {hasTaskCosts(track) ? (
          <>
            <Columns columns={columns} label="Cost per 1,000 tasks by provider" compact />
            <CompactNotes items={[...marks].map(([id, mark]) => ({ mark, id, note: machine[id] ?? "" }))} />
          </>
        ) : (
          <NoCostResults compact />
        )}
      </Headline>
      <Headline marker="var(--color-4)" title="Start from snapshot" sub={short} section="state" tab="create-from-snapshot">
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
  return <p className="text-m text-neutral-7">{facts.join(" · ")}</p>;
}

/** Failures set aside in each track, for the Method section. */
function SetAside() {
  const rows = trackIds.flatMap((id) =>
    tracks[id].providers.flatMap((p) => p.ourFailures.map((f) => ({ track: id, p, f }))),
  );
  if (rows.length === 0) return <>No failures were set aside.</>;
  return (
    <ul className="mt-xxs flex flex-col gap-xxs">
      {rows.map(({ track, p, f }) => (
        <li key={`${track}${p.id}${f.reason}`}>
          <span className="text-neutral-10">{trackInfo[track].tab}</span>, <Who id={p.id} />: {f.runs} {f.runs === 1 ? "run" : "runs"}, {f.count} {f.count === 1 ? "test" : "tests"}. {sentence(f.reason)}
        </li>
      ))}
    </ul>
  );
}

/** Method in rows: a label, one sentence anyone can read, and the detail behind a disclosure. */
const methodRows: readonly { term: string; line: ReactNode; more: ReactNode }[] = [
  {
    term: "Our SDK",
    line: "Every provider ran through Sandbox SDK, which we make; version 0.2.0 is public on npm.",
    more: "The 1.0 used here will be published soon. Each adapter calls the provider's official SDK or API, and uses its native path for commands and files where one exists.",
  },
  {
    term: "One location",
    line: "Every test ran from one server in Florida, US.",
    more: "Distance to each provider's region affects every call. The Hardware tab under Machines shows where each sandbox ran.",
  },
  {
    term: "Two tracks",
    line: "Same machine asks every provider for 4 vCPU and 8 GB, so it is the fair comparison; Default machines compares each provider's default sandbox, the one you get without choosing a size.",
    more: (
      <>
        Default sizes differ: E2B&apos;s default template is 2 vCPU and 512 MB, though its pricing page says 4 GB. boxd has no 4 vCPU, 8 GB size and ran 4 vCPU, 16 GB. Superserve ran Same machine at 4 vCPU and 8 GB after Superserve raised our template limit. Every chart marks a machine that differs from its track.
      </>
    ),
  },
  {
    term: "Cold start",
    line: "Timed from create() until a first command runs: the provider's own time.",
    more: "The command is a bare true. Our SDK's setup after that point was never part of cold start or bursts. On the faster SDK it takes about 0.2 ms; the waterfall shows it beside each provider's time, from a separate run of 20 creates per provider.",
  },
  {
    term: "Runs",
    line: "100 runs per quick test, 30 per agent or snapshot test, and medians inside each other's 95% intervals count as tied.",
    more: "Bursts run 3 times per size, each timed until every sandbox in it runs a command, and a size is published only when all three finished. Every chart, cold start, SDK setup, snapshots, bursts and cost included, comes from the runs on our faster SDK (commit 1185278). Pause and resume are from the previous run (SDK a2316c3), because the new main runs skipped them; that chart says so. Each chart shows its attempt count. Download speed is left out because the test host rate-limited several providers.",
  },
  {
    term: "Cost",
    line: "One task per sandbox, up to 10 per provider, priced from each provider's bill wherever it gives one.",
    more: "Both Upstash products and Daytona give a per-sandbox charge; Daytona's can still change for 48 hours. E2B, boxd and Tenki give a usage record, priced at their published rates. Freestyle has no billing API and Superserve reports usage only per account, so those use our measured time at list price. Credits, tax and plan minimums are left out. The main test sandboxes are not priced, because providers ran different mixes of tests in them.",
  },
  {
    term: "Failures",
    line: "Only failures the provider caused count against it; ones caused by us are set aside.",
    more: (
      <>
        That includes failures we can&apos;t pin on either side, such as our SDK timing out while waiting. Attempts blocked by our own plan limits were rerun. Set aside:
        <SetAside />
      </>
    ),
  },
  {
    term: "Plan limits",
    line: "We used self-serve accounts, and a chart names any limit that changed its result.",
    more: "Superserve raised our template limit, so it now runs Same machine at 4 vCPU. Boat raised our plan from 200 to 1,680 creates a day, so it now runs the full suite, bursts of 25 included. Daytona was re-collected on Oct 22 after its account quota was raised from 10 vCPU / 10 GiB; earlier Daytona numbers were limited by that quota. Upstash appears twice because Box (long-lived, can pause) and Ephemeral Box (short-lived, for one-off agent jobs) are separate products. A provider gets a second row only for a product it sells separately, not for a setting on the same product. We will add results if a paid plan or quota increase lifts these.",
  },
  {
    term: "Superserve",
    line: "Superserve ran a custom template we built with Node 22 and Python 3.11.",
    more: "Its stock templates offer one or the other, and our tests need both. Before this template, our setup installed Python on every create.",
  },
  {
    term: "Independent",
    line: "No provider paid for these results or decided how they were tested.",
    more: "Some may have seen an early copy to check for errors. When a provider pointed out a mistake of ours, we fixed it the same way for every provider. We may work with some of these companies; that did not change how tests ran or how results are reported.",
  },
];

// The switch appears only once both tracks have results; until then one side would be empty sections.
const showSwitch = trackIds.every((id) => tracks[id].providers.length > 0);

export default function Page() {
  return (
    <>
      {/* As on Artificial Analysis: no bar behind the header, just the logo and one bar of section links floating over the page.
          A fade from the page colour keeps them readable over the cards scrolling underneath. */}
      <header className="sticky top-0 z-30 bg-linear-to-b from-neutral-1 from-40% to-transparent px-m pt-s pb-l sm:px-l">
        {/* Wide screens: logo, then the section bar centred on the page between two equal columns. */}
        <div className="mx-auto flex max-w-[1440px] items-center gap-s xl:grid xl:grid-cols-[1fr_minmax(0,auto)_1fr]">
          <a href="#top" className="surface focus-ring flex h-12 shrink-0 items-center justify-self-start px-m" aria-label="Sandbox bench, back to top">
            <Lockup />
          </a>
          <div className="hidden min-w-0 xl:block">
            <SectionLinks sections={sections} />
          </div>
          {/* The machine switch on the right, where Artificial Analysis keeps its buttons, once there is room for it. */}
          {showSwitch ? (
            <div className="hidden justify-self-end min-[1440px]:block">
              <TrackSwitch size="small" />
            </div>
          ) : null}
          <div className="ml-auto min-w-0 xl:hidden">
            <SectionMenu sections={sections} menuTop={showSwitch ? <TrackSwitch /> : undefined} />
          </div>
        </div>
      </header>

      {isPreview ? (
        <p role="note" className="mx-m mt-xs rounded-s bg-warning-transparent px-m py-xs text-center font-mono text-xs text-warning sm:mx-l">
          Preview fixture: made-up numbers for layout checks. Not benchmark results.
        </p>
      ) : null}

      <main id="top" className="mx-auto max-w-[1440px] px-m sm:px-l">
        <div className="flex flex-col gap-s pt-l pb-xl lg:pt-xxl">
          <h1 className="font-brand text-xl font-medium text-balance sm:text-xxl">Cloud sandboxes, measured</h1>
          <Tracked>{(track) => <Facts track={track} />}</Tracked>
          {showSwitch ? (
            // Wide screens carry the switch in the header.
            <div className="mt-m min-[1440px]:hidden">
              <TrackSwitch />
            </div>
          ) : null}
        </div>

        <div className="pb-m">
          <PerTrack>{(track) => <StatStrip track={track} />}</PerTrack>
          <Tracked>{(track) => { const note = upstashTwinNote(track); return note ? <p className="mt-s text-s text-neutral-7">{note}</p> : null; }}</Tracked>
        </div>

        <PerTrack>{(track) => <Headlines track={track} />}</PerTrack>

        <TraceWaterfall />

        <Section
          id="startup"
          title="Start-up"
          lede="Cold start is the wait before an agent can do anything: from create() until the first command runs, the provider's own time."
        >
          <PerTrack>
            {(track) => (
              <TabCard
                label="Start-up" section="startup"
                tabs={[
                  ...metricTabs(track, [{ id: "cold", what: "create() to first command, without our SDK's setup", tab: "Cold start", notes: machineNotes(track) }]),
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

        <Section id="cost" title="Cost" lede="What the same agent task cost on each provider, and what each charges per hour.">
          <PerTrack>
            {(track) => (
              <>
                <TabCard
                  label="Cost" section="cost"
                  tabs={[
                    { id: "task", label: "Cost per 1,000 tasks", content: <CostPerTaskChart track={track} /> },
                    { id: "common", label: `Hourly, ${commonSize.label}`, content: <CommonPriceChart track={track} /> },
                    { id: "hour", label: track.id === "default" ? "Hourly, default sandbox" : "Hourly, machine it ran", content: <PriceChart track={track} /> },
                  ]}
                />
                <Card className="mt-m">
                  <CostQuadrant track={track} />
                </Card>
              </>
            )}
          </PerTrack>
        </Section>

        <Section id="method" title="Method" lede="How the numbers were made, and what could bias them.">
          <Card>
            <MethodList rows={methodRows} />
            <p className="mt-m text-s text-neutral-7">
              Every number with its full method:{" "}
              <a className="focus-ring -my-xs inline-block rounded-xs py-xs text-accent underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="results.md">
                results.md
              </a>
            </p>
          </Card>
        </Section>
      </main>

      <footer className="mx-auto mt-xxl max-w-[1440px] px-m sm:px-l">
        <div className="flex flex-wrap gap-x-s gap-y-xxs py-xl text-s text-neutral-7">
          <span>
            Sandbox bench · <Tracked>{(track) => (hasResults(track) ? dayRange(track.window) : "not published yet")}</Tracked>
          </span>
          <span aria-hidden>·</span>
          <span>
            Data for both tracks:{" "}
            {["llms.txt", "results.json", "results.md"].map((f, i) => (
              <span key={f}>
                {i > 0 ? " · " : ""}
                <a className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href={f}>
                  {f}
                </a>
              </span>
            ))}
          </span>
        </div>
      </footer>
    </>
  );
}
