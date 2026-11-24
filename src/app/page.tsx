import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Lockup } from "@/components/brand";
import { HomeLogoLink } from "@/components/home-logo-link";
import { ByLocation } from "@/components/by-location";
import { tieredWithData } from "@/components/cpu-tiers";
import { MethodList } from "@/components/method-list";
import { IdleChart, taskCostSection } from "@/components/realistic";
import { realTasksSection } from "@/components/real-tasks";
import { realtaskBurstSection } from "@/components/realtask-burst";
import { ExpandedBenchmarks, expandedSection } from "@/components/expanded-benchmarks";
import { stressSection } from "@/components/stress";
import { hasExpanded } from "@/lib/expanded";
import { expanded } from "@/lib/expanded-data";
import { hasStress } from "@/lib/stress";
import { latestUpdates, updateDay } from "@/lib/updates";
import { Who, sentence } from "@/components/metric-chart";
import { JumpLink } from "@/components/jump";
import { LazyTrackSection } from "@/components/home-lazy";
import { HomeSection } from "@/components/home-sections";
import type { HomeSectionId } from "@/components/home-sections";
import { landingTrack } from "@/lib/tracks";
import { HomeJsonLd } from "@/components/seo/home-json-ld";
import { HomeLinks } from "@/components/seo/home-links";
import { homeMetadata } from "@/lib/seo/home";
import { forProvidersPath, updatePath, updatesPath } from "@/lib/seo/pages";
import { independenceTitle, privateOffer, privateSummary, privateTitle } from "@/lib/private-benchmarks";
import { SectionLinks, SectionMenu } from "@/components/section-nav";
import { scoresSection } from "@/components/scores";
import { Card } from "@/components/tabs";
import { Tracked } from "@/components/track";
import { TierSwitch } from "@/components/tier-switch";
import { TrackSwitch } from "@/components/track-switch";
import { TraceWaterfall } from "@/components/trace-waterfall";
import { hasResults, isPreview, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Track } from "@/lib/data";
import { dayRange } from "@/lib/format";
import { isExtraTier, providerBrand } from "@/lib/providers";
import { realistic } from "@/lib/realistic-data";

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

/** A section's content for each track: the landing track's in the HTML, the other's built in the browser when the switch shows it. */
const PerTrack = ({ section }: { section: HomeSectionId }) => (
  <>
    {trackIds.map((id) => (
      <div key={id} data-track-view={id}>
        {id === landingTrack ? <HomeSection section={section} track={id} /> : <LazyTrackSection section={section} track={id} />}
      </div>
    ))}
  </>
);

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
    more: "The command is a bare true. Our SDK's setup after that point was never part of cold start or bursts. On the faster SDK it takes about 0.2 ms; the waterfall shows it beside each provider's time, from a separate run of 20 creates per provider.",
  },
  {
    term: "Runs",
    line: "100 runs per quick test, 30 per agent or snapshot test, and medians inside each other's 95% intervals count as tied.",
    more: "Bursts run 3 times per size, each timed until every sandbox in it runs a command, and a size is published only when all three finished. Every chart, cold start, SDK setup, snapshots, bursts and cost included, comes from the runs on our faster SDK (commit 1185278). Pause and resume are from the previous run (SDK a2316c3), because the new main runs skipped them; that chart says so. boxd is the exception: every boxd result, pause and resume included, comes from a full re-run on its New York region on Nov 19 (commit 5a8bdda, boxd SDK 0.3.2), except its cost per task, which is from its Nov 4 New York run (commit d8844f0). Baseten joined later: its results come from its own runs on Nov 12 and 13 and its resume from a separate run on Nov 17, because Baseten has no pause call and its sandboxes go on standby by themselves. Instabox joined on Nov 18: every Instabox result, pause and resume, snapshots and bursts included, comes from its own runs that day (commit 6074f7b), each burst of 10 and 25 started a minute apart to stay inside Instabox's start rate (50 a minute on its Builder plan). Beam joined on Nov 18: its results come from its own runs that day (commit 69d48ed). Each chart shows its attempt count. Download speed is left out because the test host rate-limited several providers.",
  },
  {
    term: "Cost",
    line: "One task per sandbox, up to 10 per provider, priced from each provider's bill wherever it gives one.",
    more: "Both Upstash products, Superserve and Daytona give a per-sandbox charge. E2B, boxd and Instabox give a usage record, priced at their published rates. Freestyle, Luxor, Baseten and Beam use our measured time at their list prices. Boat's cost is its usage at list price. Cheapest is the lowest exact cost. Credits and tax are left out. The main test sandboxes are not priced, because providers ran different mixes of tests in them.",
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
    more: "Superserve raised our template limit, so it now runs Same machine at 4 vCPU. Boat raised our plan from 200 to 1,680 creates a day, so it now runs the full suite, bursts of 25 included. Daytona was re-collected on Oct 22 after its account quota was raised from 10 vCPU / 10 GiB; earlier Daytona numbers were limited by that quota. Baseten raised our account's limits from 4 GB per sandbox and 10 sandboxes at once, so it runs Same machine and bursts of 25. Instabox ran on its Builder plan. Beam's default sandbox is 1 CPU and 128 MiB, too little memory for our dev server, Python install and realistic workloads; our Beam account's 30 vCPU quota keeps its Same machine bursts from running. Upstash appears twice because Box (long-lived, can pause) and Ephemeral Box (short-lived, for one-off agent jobs) are separate products. We will add results if a paid plan or quota increase lifts these.",
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
            <Tracked eager>{(track) => <Facts track={track} />}</Tracked>
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

        <PerTrack section="stats" />

        <Section
          id={scoresSection}
          title="Scores by category"
          lede="Speed, real tasks, bursts and reliability scored 0 to 100 against the best provider, plus real task cost in dollars. No overall score."
          tight
        >
          <PerTrack section="scores" />
        </Section>

        <div className="pt-xxl">
          <PerTrack section="headlines" />
        </div>

        <Section
          id="startup"
          title="Start-up"
          lede="Cold start is the wait before an agent can do anything: from create() until the first command runs, the provider's own time."
        >
          <PerTrack section="startup" />
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
          <PerTrack section="real-tasks" />
          <div id={realtaskBurstSection} className="mt-l scroll-mt-24">
            <PerTrack section="realtask-burst" />
          </div>
        </Section>

        <Section id="agent" title="Tool calls and agent steps" lede="The single steps a coding agent repeats: 100 tool calls in a row, package installs, a clone, a dev server and its preview.">
          <PerTrack section="agent" />
        </Section>

        <Section id="everyday" title="Everyday calls" lede="What an agent does hundreds of times per task: run a command, move files, reattach to a sandbox.">
          <PerTrack section="everyday" />
        </Section>

        <Section
          id="state"
          title="Pause & snapshots"
          lede="Pausing stops paying for idle time while an agent waits on a human, with every process kept. Where stop and start restarts the sandbox instead, we mark pause as not supported; where a sandbox pauses by itself when idle, only its resume is timed. Snapshots start many sandboxes from one prepared state."
        >
          <PerTrack section="state" />
        </Section>

        <Section
          id="scale"
          title="Bursts"
          lede="10 or 25 sandboxes started at once, as an agent fanning out would, timed until the last one runs a command."
        >
          <PerTrack section="scale" />
        </Section>

        {trackIds.some((id) => hasStress(tracks[id].stress)) ? (
          <Section
            id={stressSection}
            title="Stress"
            lede="CPU held busy for minutes, CPU shared by sandboxes started at once, and whether sandboxes started in a burst stay alive."
          >
            <PerTrack section="stress" />
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
          <PerTrack section="task-cost" />
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
          <PerTrack section="cost" />
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
            <PerTrack section="tiers" />
          </Section>
        ) : null}

        <Section id="reliability" title="Reliability" lede="How often each provider failed, and why. Only failures the provider caused are counted; Method lists the ones we set aside.">
          <PerTrack section="reliability" />
        </Section>

        <Section id="machines" title="Machines" lede="What each provider ran: what we asked for, what we measured inside, and the hardware underneath.">
          <PerTrack section="machines" />
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
            Sandbox bench · <Tracked eager>{(track) => (hasResults(track) ? dayRange(track.window) : "not published yet")}</Tracked>
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
