import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Allocations } from "@/components/allocations";
import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { Lockup } from "@/components/brand";
import { HomeLogoLink } from "@/components/home-logo-link";
import { ByLocation } from "@/components/by-location";
import { CostPerTaskChart, NoCostResults } from "@/components/cost";
import { TierTable, tieredWithData } from "@/components/cpu-tiers";
import { MachineSizes } from "@/components/machine-sizes";
import { MethodList } from "@/components/method-list";
import { IdleChart, TaskCost, TaskCostHeadline, taskCostSection } from "@/components/realistic";
import { RealTaskHeadline, RealTasks, realTasksSection } from "@/components/real-tasks";
import { RealtaskBurstChart, realtaskBurstSection } from "@/components/realtask-burst";
import { ExpandedBenchmarks, expandedSection } from "@/components/expanded-benchmarks";
import { StressSection, stressSection } from "@/components/stress";
import { hasExpanded } from "@/lib/expanded";
import { expanded } from "@/lib/expanded-data";
import { hasStress } from "@/lib/stress";
import { realtaskBurst } from "@/lib/realtask-burst-data";
import { latestUpdates, updateDay } from "@/lib/updates";
import { ChartHead, ComingNext, CompactNotes, Footnotes, MetricChart, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import type { Notes } from "@/components/metric-chart";
import { PauseChart, PausePart, hasPauseSplit } from "@/components/pause-chart";
import { Reliability } from "@/components/reliability";
import { Ridgelines } from "@/components/ridgelines";
import { Scatter, linearTicks, logTicks } from "@/components/scatter";
import type { ScatterPoint } from "@/components/scatter";
import { JumpLink } from "@/components/jump";
import { HomeJsonLd } from "@/components/seo/home-json-ld";
import { HomeLinks } from "@/components/seo/home-links";
import { homeMetadata } from "@/lib/seo/home";
import { forProvidersPath, updatePath, updatesPath } from "@/lib/seo/pages";
import { independenceTitle, privateOffer, privateSummary, privateTitle } from "@/lib/private-benchmarks";
import { SectionLinks, SectionMenu } from "@/components/section-nav";
import { Scores, scoresSection } from "@/components/scores";
import { SpecSheet } from "@/components/spec-sheet";
import { StatStrip } from "@/components/stat-strip";
import { Card, TabCard } from "@/components/tabs";
import type { Tab } from "@/components/tabs";
import { Tracked } from "@/components/track";
import { TierSwitch } from "@/components/tier-switch";
import { TrackSwitch } from "@/components/track-switch";
import { TraceWaterfall } from "@/components/trace-waterfall";
import { excludedFor, notRun, notRunText } from "@/lib/agent-data";
import { TASKS_PER_PRICE, costSource, hasTaskCosts, isLowerBound, pricedTasks, qualify, regionNote, usageCostTag } from "@/lib/cost";
import { allProviders, hasResults, isPreview, trackIds, trackInfo, tracks } from "@/lib/data";
import { setAsideSentence } from "@/lib/exclusions";
import type { Provider, Track } from "@/lib/data";
import { dayRange, formatGiB, formatMoney } from "@/lib/format";
import { commonPrice, commonSize, conversionNote, usdPrice } from "@/lib/fx";
import type { PriceKey } from "@/lib/fx";
import { allocationNotes, destroyNotes, execNotes, farNotes, forTrack, machineNotes, mergeNotes, probeNote, snapshotNotes } from "@/lib/notes";
import { isExtraTier, isProviderId, providerBrand, providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { realistic } from "@/lib/realistic-data";
import { sdkSetupRunProviders, sdkSetupRunText, sdkSetupRuns } from "@/lib/sdk-setup";
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
// Avoiding: poster-sized hero, intro paragraphs, an overall score (scores are per category only), winner badges, a heavy filled quadrant.

// Each entry: section id, nav label, and the tab a click opens, so "Start-up" lands on the cold start chart.
// Speed first, in the order an agent meets it, then cost, then what explains the numbers.
// Scores sit right under the title, so they have no item: one more would push the bar past 1440 px.
/** " Archil's comes from its own run, sbx57-mwtux8wi (commit 1f1de78, Nov 23, 2026).", for each provider whose SDK setup figure has its own run; empty otherwise. */
const ownSetupRuns = () =>
  sdkSetupRunProviders
    .flatMap((id) => {
      const r = sdkSetupRuns[id];
      return r ? [` ${providerName(id)}'s comes from its own ${sdkSetupRunText(r)}.`] : [];
    })
    .join("");

const sections = [
  ["startup", "Start-up", "cold"],
  ["real-tasks", "Real tasks", "fix-and-test"],
  ["agent", "Tool calls", "tool-replay"],
  // Everyday calls has no item of its own: it follows Tool calls, which stays lit through both, so the bar fits beside the switch.
  ["state", "Snapshots", "create-from-snapshot"],
  ["scale", "Bursts", "burst-10"],
  // "Cost" opens What a task costs; the quick task and prices section follows it, so the item stays lit through both.
  ["task-cost", "Cost", "fix-and-test"],
  ["reliability", "Reliability"],
  ["machines", "Machines"],
  ["locations", "Locations", "combined"],
  ["method", "Method"],
] as const;

/** The rows the Machines section lists: a CPU tier runs on its provider's machine, so the tier table covers it instead. */
const machineRows = (track: Track) => track.providers.filter((p) => !isExtraTier(p.id));

/** The machine a provider ran on in a track, for hover cards: "4 vCPU, 8 GB RAM". */
const ranOn = (p: Provider | undefined) => {
  const m = p?.measuredAllocations[0];
  return m ? `${m.cpu} vCPU, ${formatGiB(m.memoryGiB)} RAM` : "size not measured";
};

/** A titled section. `tight` is for the first one under the hero, so it starts above the fold. */
function Section({ id, title, lede, tight = false, children }: { id: string; title: string; lede: ReactNode; tight?: boolean; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-24 ${tight ? "pt-xl" : "pt-xxl sm:pt-[calc(var(--space-xxl)*1.5)]"}`}>
      <h2 id={`${id}-title`} className="flex items-center gap-s font-brand text-l font-medium">
        <span aria-hidden className="size-s shrink-0 bg-neutral-10" />
        {title}
      </h2>
      <p className={`mt-xs max-w-[72ch] text-m text-pretty text-neutral-8 ${tight ? "mb-m" : "mb-l"}`}>{lede}</p>
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
  const points: ScatterPoint[] = pricedTasks(track).flatMap(({ id, cost, status }) => {
    if (isLowerBound(cost)) return [];
    const t = replay.values.find((v) => v.provider === id)?.p50 ?? null;
    const m = track.providers.find((p) => p.id === id)?.measuredAllocations[0];
    // Only a provider-reported usage cost (Archil's) carries a tag; every other dot is as before.
    const tag = usageCostTag(id, cost, status);
    return t === null ? [] : [{ provider: id, x: t, y: cost.usd, detail: [costSource(id, cost), ...(m ? [`Ran on ${m.cpu} vCPU`] : [])], ...(tag === null ? {} : { tag }) }];
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
      {/* Shown under the plot, not in the notes: "Archil: usage cost, unsettled." Nothing for a plot without a usage cost. */}
      <CompactNotes items={points.flatMap((p) => (p.tag === undefined ? [] : [{ mark: undefined, id: p.provider, note: p.tag }]))} />
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

/** The facts line under the title, for one track. */
function Facts({ track }: { track: Track }) {
  // A config is one provider id; a provider is its brand (Upstash Box and Upstash Ephemeral Box are one provider).
  // A CPU tier is a config but not a product of its own (Beam Shared is Beam's sandbox on a cheaper CPU).
  const configs = track.providers.filter((p) => !isExtraTier(p.id)).length;
  const tiers = track.providers.length - configs;
  const providers = new Set(track.providers.map((p) => providerBrand(p.id))).size;
  const count = [`${providers} providers`, ...(configs === providers ? [] : [`${configs} products`]), ...(tiers > 0 ? [`${tiers} more CPU ${tiers === 1 ? "tier" : "tiers"}`] : [])].join(", ");
  const facts = hasResults(track) ? [count, dayRange(track.window), "From Florida and Frankfurt"] : ["Coming in the next update"];
  return (
    <>
      <p className="mt-s max-w-[40ch] text-l text-pretty text-neutral-10">
        Independent benchmarks of cloud sandboxes for AI agents: real coding tasks, start-up, tool calls and cost.
      </p>
      <p className="mt-s flex flex-wrap gap-x-m gap-y-xxs text-s text-neutral-7">
        {facts.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </p>
    </>
  );
}

const quietLink = "focus-ring rounded-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10";

/** Who makes the site, what it runs on and who pays for it, in one quiet line under the facts. */
function Attribution() {
  const links = [
    { href: "https://leodev.cv", text: "By Leo (@leodev)" },
    { href: "#method", text: "open-source Sandbox SDK" },
    { href: forProvidersPath, text: "independent, funded by private provider runs, zero pay-to-play" },
  ] as const;
  return (
    // Inline, not flex, so a phone wraps it like a sentence and a separator never starts a line.
    <p className="mt-xs text-s text-pretty text-neutral-7">
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 ? <span aria-hidden>{" · "}</span> : null}
          <a href={l.href} className={quietLink}>
            {l.text}
          </a>
        </span>
      ))}
    </p>
  );
}

/** The newest update beside the title, title only, so the scores stay above the fold. The full strip sits under the scores. */
function LatestUpdate() {
  const [u] = latestUpdates;
  if (!u) return null;
  return (
    <section aria-labelledby="latest-update-title" className="flex flex-col gap-xxs lg:pt-xs">
      <h2 id="latest-update-title" className="sr-only">
        Latest update
      </h2>
      <a href={updatePath(u.slug)} className="group focus-ring flex flex-col gap-xxs rounded-xs">
        <span className="text-xs font-medium text-accent">Update · {updateDay(u)}</span>
        <span className="flex items-start justify-between gap-s text-m font-medium">
          <span className="group-hover:underline group-hover:decoration-neutral-6 group-hover:underline-offset-4">{u.title}</span>
          <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
        </span>
      </a>
      <a href={updatesPath} className={`${quietLink} -my-xs self-start py-xs text-s text-neutral-7`}>
        All updates
      </a>
    </section>
  );
}

/** The newest three updates, each with its summary, under the scores. Each opens its own page. */
function Updates() {
  return (
    <section aria-labelledby="updates-title" className="pt-xxl">
      <h2 id="updates-title" className="flex items-center gap-s font-brand text-l font-medium">
        <span aria-hidden className="size-s shrink-0 bg-neutral-10" />
        Latest updates
      </h2>
      <div className="mt-m grid gap-l md:grid-cols-3">
        {latestUpdates.map((u) => (
          <a key={u.slug} href={updatePath(u.slug)} className="group focus-ring flex flex-col gap-xxs rounded-xs">
            <span className="text-xs font-medium text-accent">Update · {updateDay(u)}</span>
            <span className="flex items-start justify-between gap-s text-m font-medium">
              <span className="group-hover:underline group-hover:decoration-neutral-6 group-hover:underline-offset-4">{u.title}</span>
              <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
            </span>
            <span className="text-s text-pretty text-neutral-7">{u.text}</span>
          </a>
        ))}
      </div>
      <a href={updatesPath} className={`${quietLink} -my-xs mt-s inline-block py-xs text-s text-neutral-7`}>
        All updates
      </a>
    </section>
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
    term: "Two locations",
    line: "Network-sensitive tests ran from both US-East (Florida, US) and EU-Central (Frankfurt, Germany); the 100-run deep dive ran from Florida, US.",
    more: "Distance to each provider's API gateway and sandbox region affects every call. Boat (Northern France) runs its API and sandboxes in Europe, so calling it from Frankfurt is 1.5×–2.9× faster than from Florida (7.6× for a preview's first byte). boxd runs in New York, so the gap goes the other way. The Hardware tab under Machines shows where each sandbox ran.",
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
    more: `The command is a bare true. Our SDK's setup after that point was never part of cold start or bursts. On the faster SDK it takes about 0.2 ms; the waterfall shows it beside each provider's time, from a separate run of 20 creates per provider.${ownSetupRuns()}`,
  },
  {
    term: "Runs",
    line: "100 runs per quick test, 30 per agent or snapshot test, and medians inside each other's 95% intervals count as tied.",
    more: "Bursts run 3 times per size, each timed until every sandbox in it runs a command, and a size is published only when all three finished. Every chart, cold start, SDK setup, snapshots, bursts and cost included, comes from the runs on our faster SDK (commit 1185278). Pause and resume are from the previous run (SDK a2316c3), because the new main runs skipped them; that chart says so. boxd is the exception: every boxd result, pause and resume included, comes from a full re-run on its New York region on Nov 19 (commit 5a8bdda, boxd SDK 0.3.2), except its cost per task, which is from its Nov 4 New York run (commit d8844f0). Baseten joined later: its results come from its own runs on Nov 12 and 13 and its resume from a separate run on Nov 17, because Baseten has no pause call and its sandboxes go on standby by themselves. Instabox joined on Nov 18: every Instabox result, pause and resume, snapshots and bursts included, comes from its own runs that day (commit 6074f7b), each burst of 10 and 25 started a minute apart to stay inside Instabox's start rate (50 a minute on its Builder plan). Beam joined on Nov 18: its results come from its own runs that day (commit 69d48ed). Archil joined on Nov 23: its results, pause and resume, bursts, cost, By location (Frankfurt and Florida) and SDK setup included, come from its own runs that day (commit 1f1de78), through its official SDK, the disk npm package. Its default-machine cost comes from a second cost run that day, because one task in the first timed out after 180 s and cost per task needs all 10 tasks; the first cost run is left out of the cost figure. Archil's main results count their own failures, one tool replay that timed out starting included. Its stress and expanded tests ran the same day on our stress harness (commit a9954ea). Its output streaming test ran again on Nov 24 (UTC) on SDK 1.3.1 (commit de32eb5): on 1.3.0 it failed because of a bug in our Archil adapter, since fixed. Its snapshot tests did not run, because our Archil adapter has no snapshots. Each chart shows its attempt count. Download speed is left out because the test host rate-limited several providers.",
  },
  {
    term: "Cost",
    line: "One task per sandbox, up to 10 per provider, priced from each provider's bill wherever it gives one.",
    more: "Both Upstash products, Superserve and Daytona give a per-sandbox charge. E2B, boxd and Instabox give a usage record, priced at their published rates. Archil's per-sandbox usage API reports a usage cost at its published rates, not yet settled. Freestyle, Luxor, Baseten and Beam use our measured time at their list prices. Boat's cost is its usage at list price. Cheapest is the lowest exact cost. Credits and tax are left out. The main test sandboxes are not priced, because providers ran different mixes of tests in them.",
  },
  {
    term: "Failures",
    line: "A failure counts against the provider unless it is one of the two kinds we set aside as ours; any other failure counts, even when its cause is unconfirmed.",
    more: (
      <>
        The two kinds: our own scenario deadline running out, and our SDK timing out or wrapping the error while moving a 10 MB file, where the error can&apos;t show whose side failed. Every other failure counts, timeouts our SDK reports while starting a sandbox included. Attempts blocked by our own plan limits were rerun. Set aside:
        <SetAside />
      </>
    ),
  },
  {
    term: "Plan limits",
    line: "We used self-serve accounts, and a chart names any limit that changed its result.",
    more: "Superserve raised our template limit, so it now runs Same machine at 4 vCPU. Boat raised our plan from 200 to 1,680 creates a day, so it now runs the full suite, bursts of 25 included. Daytona was re-collected on Oct 22 after its account quota was raised from 10 vCPU / 10 GiB; earlier Daytona numbers were limited by that quota. Baseten raised our account's limits from 4 GB per sandbox and 10 sandboxes at once, so it runs Same machine and bursts of 25. Instabox ran on its Builder plan. Beam's default sandbox is 1 CPU and 128 MiB, too little memory for our dev server, Python install and realistic workloads; our Beam account's 30 vCPU quota keeps its Same machine bursts from running. Archil's network policy needs a paid plan. A paused Archil sandbox stays asleep until it is resumed, and a lifetime (timeoutMs) on Archil pauses it and can't be combined with public previews. Upstash appears twice because Box (long-lived, can pause) and Ephemeral Box (short-lived, for one-off agent jobs) are separate products. We will add results if a paid plan or quota increase lifts these.",
  },
  {
    term: "Rows",
    line: "A provider gets a row of its own for a product it sells separately, or a CPU tier sold at its own price; never for a size, a region or a setting.",
    more: "Tiers past the first, such as Beam Shared and Beam Spot, are hidden until you pick Every CPU tier, so each provider shows once by default, on the tier a new account gets. A provider shows at most four rows. A tier runs the quick tests and the real tasks on Same machine; it skips snapshots and bursts of sandboxes, which don't depend on the CPU it sells. Ranks, headline numbers and Cheapest use each provider's first tier; the CPU tiers table compares the rest.",
  },
  {
    term: "Superserve",
    line: "Superserve ran a template we built only to bundle Node 22 and Python 3.11, because its stock images ship one or the other; nothing in it is tuned for speed.",
    more: "Our tests need both runtimes. Before this template, our setup installed Python on every create.",
  },
  {
    term: "Independent",
    line: "No provider paid for these results or decided how they were tested.",
    more: "Some may have seen an early copy to check for errors. When a provider pointed out a mistake of ours, we fixed it the same way for every provider. We may work with some of these companies; that did not change how tests ran or how results are reported.",
  },
];

// The switch appears only once both tracks have results; until then one side would be empty sections.
const showSwitch = trackIds.every((id) => tracks[id].providers.length > 0);

// The tier switch and section appear once a provider has results for more than one CPU tier.
const showTiers = trackIds.some((id) => tieredWithData(tracks[id]).length > 0);

export const metadata: Metadata = homeMetadata;

export default function Page() {
  return (
    <>
      <HomeJsonLd />
      {/* The logo's target: above the sticky header, so jumping here without scripts lands at the very top. */}
      <div id="top" />
      {/* As on Artificial Analysis: no bar behind the header, just the logo and one bar of section links floating over the page.
          A fade from the page colour keeps them readable over the cards scrolling underneath. */}
      <header className="sticky top-0 z-30 bg-linear-to-b from-neutral-1 from-40% to-transparent px-m pt-s pb-l sm:px-l">
        {/* Wide screens: logo, the section bar centred between two equal columns, and the machine switch on the right,
            where Artificial Analysis keeps its controls. Narrower: logo, then the switch and the sections menu on the right. */}
        <div className="mx-auto flex max-w-[1440px] items-center gap-s min-[1440px]:grid min-[1440px]:grid-cols-[1fr_minmax(0,auto)_1fr]">
          <HomeLogoLink className="surface focus-ring flex h-12 shrink-0 items-center justify-self-start px-m" label="Sandbox bench, back to top">
            <Lockup />
          </HomeLogoLink>
          <div className="hidden min-w-0 min-[1440px]:block">
            <SectionLinks sections={sections} />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-s justify-self-end">
            {showSwitch ? (
              <div className="hidden md:block">
                <TrackSwitch size="small" />
              </div>
            ) : null}
            <div className="min-w-0 min-[1440px]:hidden">
              <SectionMenu sections={sections} menuTop={showSwitch ? <TrackSwitch /> : undefined} />
            </div>
          </div>
        </div>
      </header>

      {isPreview ? (
        <p role="note" className="mx-m mt-xs rounded-s bg-warning-transparent px-m py-xs text-center font-mono text-xs text-warning sm:mx-l">
          Preview fixture: made-up numbers for layout checks. Not benchmark results.
        </p>
      ) : null}

      {/* Hidden hover cards near a chart's edge are wider than a phone screen; clip them rather than let the page scroll sideways. */}
      <main className="mx-auto max-w-[1440px] overflow-x-clip px-m sm:px-l">
        {/* As on Artificial Analysis: the title and what the site is on the left, the latest updates on the right. */}
        {/* Kept short so the stat tiles and the top of the scores fit in a 1440 x 900 window. The CPU tier switch lives under CPU tiers. */}
        <div className="grid gap-m pt-s pb-m lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-xl lg:pt-xl lg:pb-l">
          <div className="flex flex-col">
            <h1 className="font-brand text-xl font-medium text-balance sm:text-xxl">Cloud sandboxes, measured</h1>
            <Tracked>{(track) => <Facts track={track} />}</Tracked>
            <Attribution />
            {showSwitch ? (
              // From tablet width up the switch sits in the header.
              <div className="mt-m md:hidden">
                <TrackSwitch />
              </div>
            ) : null}
          </div>
          <LatestUpdate />
        </div>

        <PerTrack>{(track) => <StatStrip track={track} />}</PerTrack>

        <Section
          id={scoresSection}
          title="Scores by category"
          lede="Speed, real tasks, bursts and reliability scored 0 to 100 against the best provider, plus real task cost in dollars. No overall score."
          tight
        >
          <PerTrack>{(track) => <Scores track={track} />}</PerTrack>
        </Section>

        <div className="pt-xxl">
          <PerTrack>{(track) => <Headlines track={track} />}</PerTrack>
        </div>

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
                        <Ridgelines samples={Object.fromEntries(Object.entries(track.coldSamples).filter(([id]) => isProviderId(id) && !isExtraTier(id)))} />
                      </>
                    ),
                  },
                ]}
              />
            )}
          </PerTrack>
        </Section>

        <TraceWaterfall />

        <Section
          id={realTasksSection}
          title="Real tasks"
          lede="Two real coding jobs, each in a fresh sandbox from create to confirmed delete: a Vue bug fixed and its tests run, and a Jitsi Meet production build. Time to finish, so CPU, disk and network all count."
        >
          <p role="note" className="-mt-xs mb-l max-w-[72ch] text-s text-pretty text-neutral-7">
            {realistic.coverage.headline.attempts} runs per provider. What each task costs is under Cost.
          </p>
          <PerTrack>{(track) => <RealTasks track={track} />}</PerTrack>
          <div id={realtaskBurstSection} className="mt-l scroll-mt-24">
            <PerTrack>
              {(track) =>
                track.id === "same-spec" ? (
                  <RealtaskBurstChart data={realtaskBurst} />
                ) : (
                  <p className="max-w-[72ch] text-s text-pretty text-neutral-7">Fix and test, 5 at once, ran only on the same 4 vCPU, 8 GB machine. Switch to Same machine to see it.</p>
                )
              }
            </PerTrack>
          </div>
        </Section>

        <Section id="agent" title="Tool calls and agent steps" lede="The single steps a coding agent repeats: 100 tool calls in a row, package installs, a clone, a dev server and its preview.">
          <PerTrack>
            {(track) => (
              <TabCard
                label="Tool calls and agent steps" section="agent"
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
                    { id: "destroy", what: "Delete the sandbox and wait for confirmation", notes: forTrack(track, destroyNotes) },
                  ])}
                />
              );
            }}
          </PerTrack>
        </Section>

        <Section
          id="state"
          title="Pause & snapshots"
          lede="Pausing stops paying for idle time while an agent waits on a human, with every process kept. Where stop and start restarts the sandbox instead, we mark pause as not supported; where a sandbox pauses by itself when idle, only its resume is timed. Snapshots start many sandboxes from one prepared state."
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
                    { id: "snapshot", what: "Save a prepared sandbox as a snapshot", notes: mergeNotes(blockedNotes(track, "snapshot"), notRunNotes(track, "snapshot"), forTrack(track, snapshotNotes)) },
                    { id: "create-from-snapshot", tab: "Start from snapshot", what: "New sandbox from that snapshot, then a command", notes: mergeNotes(blockedNotes(track, "create-from-snapshot"), notRunNotes(track, "create-from-snapshot"), forTrack(track, snapshotNotes)) },
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

        {trackIds.some((id) => hasStress(tracks[id].stress)) ? (
          <Section
            id={stressSection}
            title="Stress"
            lede="CPU held busy for minutes, CPU shared by sandboxes started at once, and whether sandboxes started in a burst stay alive."
          >
            <PerTrack>
              {(track) =>
                hasStress(track.stress) ? (
                  <StressSection stress={track.stress} />
                ) : (
                  <Card className="text-s text-neutral-7">
                    <span className="font-medium text-neutral-10">{trackInfo[track.id].label}: no stress results yet.</span> Switch to{" "}
                    {`${trackInfo[track.id === "default" ? "same-spec" : "default"].label.toLowerCase()} for them.`}
                  </Card>
                )
              }
            </PerTrack>
          </Section>
        ) : null}

        {hasExpanded(expanded) ? (
          <Section
            id={expandedSection}
            title="Expanded benchmarks"
            lede={`${expanded.scenarioCount} more tests across CPU, agent tasks, agent loops, files, builds and runtimes. Every run is checked against a fresh seed, so only real work counts.`}
          >
            <ExpandedBenchmarks data={expanded} />
          </Section>
        ) : null}

        <Section
          id={taskCostSection}
          title="What a task costs"
          lede="Real work instead of a tiny task: a Vue bug fixed and tested, and a Jitsi Meet production build, each in a fresh sandbox from create to confirmed delete. Costs span 50x or more because list rates and billing models both differ widely: from $0.004/vCPU-hr on Instabox to $0.128/active vCPU-hr plus memory and data transfer on Vercel, alongside whole-machine billing, flat per-size rates, and regional multipliers (Modal's US-East rate is 1.75x its base). Then the sandbox is left open, to show what idle time costs and which providers shut it down."
        >
          <p role="note" className="-mt-xs mb-l max-w-[72ch] text-s text-pretty text-neutral-7">
            {realistic.coverage.headline.attempts} runs per provider.
          </p>
          <Tracked>{(track) => <TaskCost track={track} />}</Tracked>
          <Card className="mt-m">
            <IdleChart />
          </Card>
        </Section>

        <Section
          id="cost"
          title="Quick task and prices"
          lede={
            <>
              What the small synthetic task cost on each provider, and what each charges per hour. For real work, see{" "}
              <JumpLink section={taskCostSection} tab="fix-and-test" className="focus-ring rounded-xs text-accent underline decoration-dotted underline-offset-4 hover:text-neutral-10">
                What a task costs
              </JumpLink>
              .
            </>
          }
        >
          <PerTrack>
            {(track) => (
              <>
                <TabCard
                  label="Cost" section="cost"
                  tabs={[
                    { id: "task", label: "Quick task", content: <CostPerTaskChart track={track} /> },
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

        {showTiers ? (
          <Section
            id="tiers"
            title="CPU tiers"
            lede="Some providers sell the same sandbox on more than one CPU tier: dedicated, shared with other customers, or spare capacity that can be taken back. Each tier runs the same tests on the same 4 vCPU, 8 GB machine, so the table shows what changes when you pay less."
          >
            <div className="mb-m flex flex-wrap items-center gap-x-m gap-y-xs">
              <TierSwitch />
              <p data-tier-switch="" className="max-w-[60ch] text-s text-pretty text-neutral-7">Every CPU tier adds each tier as its own row in every chart on the page.</p>
            </div>
            <Tracked>
              {(track) => {
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
              }}
            </Tracked>
          </Section>
        ) : null}

        <Section id="reliability" title="Reliability" lede="How often each provider failed, and why. A failure counts unless it is one of the two kinds Method sets aside as ours, even when its cause is unconfirmed.">
          <PerTrack>
            {(track) => (
              <Card>
                <Reliability track={track} />
                <SetAsideNotes />
              </Card>
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
                ]}
              />
            )}
          </PerTrack>
        </Section>

        <Section
          id="locations"
          title="By location"
          lede="How network distance changes latency: the same tests run from EU-Central (Frankfurt) and US-East (Florida)."
        >
          <ByLocation />
        </Section>

        <Updates />

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

        <Section id="private-benchmarks" title={privateTitle} lede={privateSummary}>
          <Card>
            <ul className="grid gap-x-l gap-y-xs text-s text-neutral-8 sm:grid-cols-2 lg:grid-cols-4">
              {privateOffer.map((item) => (
                <li key={item.title} className="flex items-baseline gap-xs">
                  <span aria-hidden className="size-1.5 shrink-0 translate-y-[-0.1em] rounded-full bg-neutral-6" />
                  {item.title}
                </li>
              ))}
            </ul>
            <p className="mt-m max-w-[72ch] text-s text-pretty text-neutral-7">
              <span className="font-medium text-neutral-10">{independenceTitle}.</span> Every result on this page comes from runs on our own accounts.
            </p>
            <a href={forProvidersPath} className="group focus-ring mt-m inline-flex items-center gap-xxs rounded-xs text-s font-medium text-accent">
              <span className="underline decoration-dotted underline-offset-4 group-hover:text-neutral-10">What&apos;s included, and get in touch</span>
              <ArrowUpRight aria-hidden className="size-4 shrink-0 group-hover:text-neutral-10" />
            </a>
          </Card>
        </Section>
      </main>

      <footer className="mx-auto mt-xxl max-w-[1440px] px-m sm:px-l">
        <div className="flex flex-wrap gap-x-s gap-y-xxs py-xl text-s text-neutral-7">
          <span>
            Sandbox bench · <Tracked>{(track) => (hasResults(track) ? dayRange(track.window) : "not published yet")}</Tracked>
          </span>
          <span aria-hidden className="hidden sm:inline">·</span>
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
          <span aria-hidden className="hidden sm:inline">·</span>
          <HomeLinks />
          <span aria-hidden className="hidden sm:inline">·</span>
          <a className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href={forProvidersPath}>
            For providers
          </a>
          <span aria-hidden className="hidden sm:inline">·</span>
          <a className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="https://github.com/opencoredev/sandbox-bench">
            Source on GitHub
          </a>
          <span aria-hidden className="hidden sm:inline">·</span>
          <a className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="https://leodev.cv">
            By Leo (@leodev)
          </a>
        </div>
      </footer>
    </>
  );
}
