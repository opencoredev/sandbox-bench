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
  | { kind: "provider"; provider: ProviderPageId };

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
  home: { section: string; tab: string; label: string };
}

export const updates = [
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
export const homeHref = ({ home }: Pick<Update, "home">) => `/#${home.section}/${home.tab}`;

/** "Nov 18", for the hero. */
export const updateDay = (u: Pick<Update, "date">) => new Date(`${u.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Nov 18, 2026", for the update's own page and the index. */
export const updateDate = (u: Pick<Update, "date">) => new Date(`${u.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
