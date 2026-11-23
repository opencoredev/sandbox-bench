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
    slug: "archil-added",
    date: "2026-11-23",
    title: "Archil added",
    text: "Archil on both machines, with bursts, locations, stress and expanded tests. The fastest pip install and preview URL first byte on both.",
    body: [
      "Archil joined on both tracks, from its own runs on Nov 23: pause and resume, bursts of 10 and 25, the quick task's cost, calls from Frankfurt and Florida, SDK setup, the stress tests, the expanded benchmarks and Fix and test 5 at once. Its snapshot tests didn't run, because our Archil adapter has no snapshots.",
      "It had the fastest pip install, 2.9 s, and the fastest preview URL first byte, 0.14 s, on both machines.",
      "Its quick-task cost on Default machines comes from a second cost run: in the first, one tool replay timed out after 180 s, and cost per task needs all 10 tasks to finish. Archil's costs are shown as unsettled, because Archil drops a deleted sandbox's record within about half an hour, so we can't confirm a charge is final.",
      "Its ratio at 5 at once to one task alone is held back: one of its two tasks alone spent 127 s uploading the toolchain from our machine, against 4 s for the other, so two tasks can't set its baseline.",
    ],
    charts: { kind: "provider", provider: "archil" },
    home: { section: "agent", tab: "preview-first-byte", label: "Tool calls" },
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
