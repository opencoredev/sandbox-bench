import type { TieredProvider } from "@/lib/providers";
import type { ProviderPageId } from "@/lib/seo/pages";
import type { TrackId } from "@/lib/tracks";

/**
 * Every change to the benchmark, newest first. The home page hero shows the
 * newest three; /updates/ lists them all, and each has its own page at
 * /updates/<slug>/. Add one when a provider joins or a result changes, and
 * never change a slug once it ships. Every claim here must match the charts
 * its page shows.
 */
export type UpdateCharts =
  /** The real-task time charts, Fix and test and Build, on these tracks. */
  | { kind: "real-tasks"; tracks: readonly [TrackId, ...TrackId[]] }
  /** A provider's standing on the headline metrics, on both tracks. */
  | { kind: "provider"; provider: ProviderPageId }
  /** Fix and test, several at once on each provider, on the same machine. */
  | { kind: "realtask-burst" }
  /** One provider's CPU tiers side by side, on the same machine. */
  | { kind: "tiers"; provider: TieredProvider };

export interface Update {
  /** The page's address under /updates/. */
  slug: string;
  /** yyyy-mm-dd. */
  date: string;
  title: string;
  /** One or two sentences for the hero and the index. */
  text: string;
  /** The update's own page, one paragraph per entry. */
  body: readonly string[];
  charts: UpdateCharts;
  /** The home page section and tab the update's page links to last, and the section's name. */
  /** `tab` only for a section with tabs. */
  home: { section: string; tab?: string; label: string };
}

export const updates = [
  {
    slug: "maritime-added",
    date: "2026-11-24",
    title: "Maritime added",
    text: "Maritime on both machines, with snapshots, bursts, both real tasks and costs metered from its own usage API. Its traffic leaves from Hetzner in Germany and Finland; it was among the slowest at cold start and the slowest on both real tasks, at the third-lowest Fix and test cost.",
    body: [
      "Maritime joined on both tracks from its own runs on Nov 23 and 24 (UTC, sandbox-sdk 619307b): pause and resume, snapshots, bursts and both real tasks included. Its default is its small preset, 2 vCPU, 4 GB and a 12 GB disk; on 4 vCPU and 8 GB it ran its medium preset, which has a 50 GB disk. Outbound traffic left from Hetzner in Falkenstein, Germany for 495 of 522 sandboxes and Helsinki, Finland for 27, so every call from our server in Florida crosses the Atlantic.",
      "On 4 vCPU and 8 GB it started in 1.62 s (100 of 100), 13th of 15, and ran 100 tool calls in 18.8 s, 8th. A snapshot took 11.2 s, starting from one 2.93 s, and pause and resume 16.6 s (99 of 100); its one failure on this track was a pause that got no response. On the default machine it started in 2.14 s (96 of 100), 14th of 15, with 6 creates taking 80 to 167 s, and pause and resume took 6.33 s.",
      "Maritime allows 30 creates a minute per API key, so, as with Instabox, each burst of 10 and 25 started a minute apart. Ten at once were all ready in 2.27 s on the default machine and 2.41 s on 4 vCPU, and 25 at once in 3.25 s and 4.71 s. Our first bursts ran back to back, and Maritime refused the creates past its rate with HTTP 429; so did the first 27 creates of the 4 vCPU main tests, which started two seconds later. We reran both with the spacing on Nov 24 and replaced the first runs, as we did for E2B's bursts; their failures, 6 besides the 429s, aren't counted, and the charts say so.",
      "Costs come from Maritime's own per-sandbox usage records at $0.0055 per vCPU-hour and $0.00275 per GB-hour: $0.14 per 1,000 quick tasks on the default machine and $0.29 on 4 vCPU. Fix and test took 281 s and 158 s, the slowest on both machines, at $1.65 and $2.13 per 1,000, third cheapest on both. Build finished 4 of 5 on 4 vCPU (300 s, $5.51 per 1,000) but only 1 of 5 on the default machine: one was killed with exit 137 with 4 GB of memory, and three lost their command stream before the build finished, as did the one failure on 4 vCPU. There is no held-open run, because its usage API leaves out the $0.08 per GB-month it charges for a paused sandbox's disk.",
      "Five Fix and test tasks at once, run on Nov 24, finished 7 of 10, with a median of 359 s against 187 s for one alone; the other 3 failed a Vue test step. With fewer than 8 of 10 finished, the chart doesn't tag a change from alone.",
    ],
    charts: { kind: "provider", provider: "maritime" },
    home: { section: "real-tasks", tab: "fix-and-test", label: "Real tasks" },
  },
  {
    slug: "beam-cpu-tiers",
    date: "2026-11-20",
    title: "Beam's CPU tiers, side by side",
    text: "Beam sells its sandbox on three CPU tiers. Shared and Spot ran on faster AMD hosts and did Fix and test for a quarter and a tenth of Performance's cost, but moved files and made calls more slowly from Dallas.",
    body: [
      "Beam now sells the same sandbox on three CPU tiers: Performance, the default, with no CPU sharing; Shared, on vCPUs shared with other customers; and Spot, on spare capacity Beam can take back with 30 seconds' notice. On our 4 vCPU, 8 GB machine they list at $0.28, $0.088 and $0.036 an hour.",
      "We ran Shared and Spot through the same quick tests and real tasks as every provider. Both landed on AMD hosts in Dallas, where Performance ran on Intel hosts in Warrenton, Virginia, and both were faster on every CPU, memory and disk test, about 1.7 times on all cores. Calls that cross Beam's network were slower: 100 tool calls took 14 s against 11 s, and writing and reading a 10 MB file took 28 s on Shared and 20 s on Spot against 2.9 s.",
      "On the same day, Fix and test took 115 s on Performance, 83 s on Shared and 97 s on Spot, at $9.12, $2.22 and $1.08 per 1,000. Build took 149 s, 133 s and 195 s: Spot spent about a minute uploading the dependency cache. Five tasks at once slowed Shared and Spot more than Performance. Beam's own real-task results on the main charts are now that day's Performance run; its Nov 18 run took 138 s and 186 s.",
      "The site shows each provider once by default, on the tier a new account gets; Every CPU tier adds the others to every chart, and ranks and Cheapest picks always use the first tier.",
    ],
    charts: { kind: "tiers", provider: "beam" },
    home: { section: "tiers", label: "CPU tiers" },
  },
  {
    slug: "real-tasks-at-once",
    date: "2026-11-19",
    title: "Real tasks, 5 at once",
    text: "Fix and test started 5 at a time on each provider. Most stay within 10% of one task alone; Luxor finished only 2 of 10.",
    body: [
      "A fleet of agents runs real work in parallel, so we started the Fix and test task 5 at a time on each provider, on 4 vCPU and 8 GB, in two rounds, and compared it with the same task run alone in the same hour.",
      "Most providers took within about 10% of their time alone, which two runs alone can't tell apart from no change. Superserve and Vercel slowed the most, about 1.1 times. Luxor finished only 2 of 10: the other 8 failed while uploading the toolchain, which works when one task runs alone. Upstash Ephemeral failed Vue's timing-sensitive Suspense test twice.",
      "Daytona didn't run: our account allows 10 vCPU, and 5 tasks at 4 vCPU need 20. These runs measure time only and add nothing to the cost charts.",
    ],
    charts: { kind: "realtask-burst" },
    home: { section: "real-tasks", tab: "fix-and-test", label: "Real tasks" },
  },
  {
    slug: "every-provider-on-real-tasks",
    date: "2026-11-18",
    title: "Every provider on real tasks",
    text: "Luxor and Superserve reran with 20 GB disks, so every provider now has results for both real tasks on the Same machine track (boxd's nearest size has 16 GB).",
    body: [
      "On their first same-machine runs, Luxor and Superserve had too little free disk for the real tasks: Luxor's Build and both of Superserve's tasks never started.",
      "We reran both on 4 vCPU and 8 GB with 20 GB disks, changing nothing else. Superserve finished every run of both tasks. Luxor finished every Build and all but one Fix and test, where a timing-sensitive Vue test failed once, as it did for Daytona.",
      "Their default-machine results and every other provider's results are unchanged. boxd has no 4 vCPU, 8 GB size and ran its nearest, 4 vCPU and 16 GB.",
    ],
    charts: { kind: "real-tasks", tracks: ["same-spec"] },
    home: { section: "real-tasks", tab: "build", label: "Real tasks" },
  },
  {
    slug: "beam-added",
    date: "2026-11-18",
    title: "Beam added",
    text: "Beam Sandboxes on both machines. Fastest at 100 tool calls on 4 vCPU and 8 GB; its 128 MiB default is too small for the real tasks.",
    body: [
      "Beam Sandboxes joined on both tracks, from its own runs on Nov 18.",
      "Its default sandbox is 1 CPU and 128 MiB, too little memory for the real tasks, so it has no real-task times on Default machines. Our account's 30 vCPU quota kept its same-machine bursts from running.",
    ],
    charts: { kind: "provider", provider: "beam" },
    home: { section: "agent", tab: "tool-replay", label: "Tool calls" },
  },
  {
    slug: "real-tasks-timed",
    date: "2026-11-18",
    title: "Real tasks, timed",
    text: "Fix and test and Build get their own time-to-finish charts, from create to confirmed delete, beside what each costs.",
    body: [
      "The two real coding tasks, a Vue bug fixed and its tests run and a Jitsi Meet production build, each get a chart of how long they take to finish, beside the charts of what they cost.",
      "Each run starts at the create request and ends when the delete is confirmed, so setup, installing the toolchain, the work itself and cleanup all count, and CPU, disk and network all matter.",
    ],
    charts: { kind: "real-tasks", tracks: ["same-spec", "default"] },
    home: { section: "real-tasks", tab: "fix-and-test", label: "Real tasks" },
  },
  {
    slug: "instabox-added",
    date: "2026-11-18",
    title: "Instabox added",
    text: "Instabox on both machines, with bursts and both real tasks.",
    body: [
      "Instabox joined on both tracks, from its own runs on Nov 18: pause and resume, snapshots and bursts included.",
      "Each burst of 10 and 25 started a minute apart, to stay inside Instabox's start rate of 50 a minute on its Builder plan.",
    ],
    charts: { kind: "provider", provider: "instabox" },
    home: { section: "startup", tab: "cold", label: "Start-up" },
  },
] as const satisfies readonly Update[];

export type UpdateSlug = (typeof updates)[number]["slug"];

/** The hero's list: the newest three. */
export const latestUpdates = updates.slice(0, 3);

/** The home page section an update links to, opened on its tab: the `#section/tab` hash JumpLink and TabCard read. */
export const homeHref = ({ home }: Pick<Update, "home">) => (home.tab === undefined ? `/#${home.section}` : `/#${home.section}/${home.tab}`);

/** "Nov 18", for the hero. */
export const updateDay = (u: Pick<Update, "date">) => new Date(`${u.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Nov 18, 2026", for the update's own page and the index. */
export const updateDate = (u: Pick<Update, "date">) => new Date(`${u.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
