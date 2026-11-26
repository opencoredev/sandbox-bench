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
  | { kind: "tiers"; provider: TieredProvider }
  /** The like-for-like checks and the isolation table, on the same machine. */
  | { kind: "like-for-like" };

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
    date: "2026-11-26",
    title: "Archil added",
    text: "Archil on both machines, with real tasks, bursts, locations, stress and expanded tests. Fix and test in 64 s on the same machine, 2nd of 19, and the fastest preview URL first byte.",
    body: [
      "Archil joined on both tracks, from its own runs that began on Nov 23 UTC: the real tasks and the held-open test, pause and resume, bursts of 10 and 25, the quick task's cost, calls from Frankfurt and Florida, SDK setup, the stress tests, the expanded benchmarks and Fix and test 5 at once. Its expanded output streaming test is from a rerun on Nov 24 UTC on SDK 1.3.1, after we fixed a bug in our Archil adapter. Its snapshot tests didn't run, because our Archil adapter has no snapshots. Its like-for-like checks and the 15-minute sustained CPU test come from a rerun on Nov 26 UTC (SDK commit 28ac0a4): in minutes 12 to 15 it ran 103.9M ops/s, 101% of its first 3 minutes and the highest of 16.",
      "On the same 4 vCPU, 8 GiB machine it finished Fix and test in 64 s, 2nd of 19 behind Styne's 56 s, at $8.87 per 1,000 (usage cost, unsettled, compute and memory only). On its default machine, 1 vCPU and 2 GiB, the build never finished: its install step was killed (exit 137) in every run. One of its three 60-minute held-open runs didn't finish: Archil refused a command, which our adapter reads as the sandbox not running; Archil's own idle pause is the likely cause, and our adapter doesn't wake a sandbox it didn't pause.",
      "Its preview URL answered in 0.14 s, the fastest on the default machine and level with Styne on the same machine. Its pip install took 2.9 s on both machines, 2nd behind Styne.",
      "Its quick-task cost on Default machines comes from a second cost run, because one task in the first timed out after 180 s and cost per task needs all 10 tasks. The first cost run is left out of the cost figure; Archil's main results count their own failures, one tool replay that timed out starting included. Archil's costs are the usage cost its per-sandbox usage API reports, shown as unsettled: Archil drops a deleted sandbox's metadata record, its status and end time, within about half an hour, so we can't read the end time back to confirm a charge is final. Archil keeps the usage record for 90 days, and we read it right after each cost run.",
      "Its ratio at 5 at once to one task alone is held back: one of its two tasks alone spent 127 s uploading the toolchain from our machine, against 4 s for the other, so two tasks can't set its baseline.",
    ],
    charts: { kind: "provider", provider: "archil" },
    home: { section: "agent", tab: "preview-first-byte", label: "Tool calls" },
  },
  {
    slug: "microsandbox-added",
    date: "2026-11-25",
    title: "Microsandbox added, with its Shared CPU tier",
    text: "Microsandbox on both machines, with snapshots, bursts, both real tasks and costs metered from its own usage API, and its Shared CPU tier on 4 vCPU. It finished every real task run, but was the slowest at cold start and at 100 tool calls on both machines.",
    body: [
      "Microsandbox joined on both tracks from its own runs on Nov 25 (UTC), all on SDK commit 2248e8a with the benchmark harness at commit afdf664: snapshots, bursts and both real tasks included; it has no pause call. Its default is 1 vCPU, 512 MiB and a 4 GiB disk, too small for either real task, so those ran on 4 vCPU, 8 GiB and a 64 GiB disk only. On the default machine, outbound traffic left from Hetzner in Falkenstein, Germany.",
      "On the default machine it started in 6.6 s, 18th of 18, and ran 100 tool calls in 180 s, also last; on 4 vCPU it took 6.8 s and 179 s, last on both. Ten at once were all ready in 9.3 s on the default machine and 7.0 s on 4 vCPU, and 25 at once in 11 s on both. A snapshot took 11 s and 26 s, and a sandbox from one 5.9 s and 7.3 s.",
      "Costs come from Microsandbox's own per-sandbox usage meter at its Standard rates, $0.048 per vCPU-hour, $0.003 per GiB-hour of memory and $0.0000625 per GiB-hour of disk; they are provisional until checked against a settled bill. That comes to $12.28 per 1,000 quick tasks on 4 vCPU, from a rerun of the cost test that day after the first run had one failed quick task. On the default machine one of ten quick-task runs failed in each of three tries, so it has no quick-task cost there. Fix and test finished 5 of 5 in 130 s at $7.75 per 1,000, 8th cheapest of 18, and Build 5 of 5 in 237 s.",
      "Its Shared tier is the same sandbox on shared vCPUs, at $0.007 per vCPU-hour and $0.000375 per GiB-hour, run the same day on 4 vCPU. Its cold start and first command came within 6% of Standard's, and Fix and test took 141 s against 130 s at $1.30 per 1,000 against $7.75, both provisional meters. In bursts of 25 at once, 33 of its 75 creates got no answer from the guest agent, where all of Standard's succeeded. CPU tiers shows the two side by side.",
      "Five Fix and test tasks at once finished 10 of 10 on both tiers: a median of 209 s against 140 s for one alone on Standard, 1.49 times as long, and 197 s against 136 s on Shared, 1.45 times. Microsandbox wasn't in the like-for-like checks or the 15-minute sustained CPU test.",
    ],
    charts: { kind: "provider", provider: "microsandbox" },
    home: { section: "real-tasks", tab: "fix-and-test", label: "Real tasks" },
  },
  {
    slug: "buddy-added",
    date: "2026-11-25",
    title: "Buddy added",
    text: "Buddy on both machines, with snapshots, bursts, both real tasks and list-price costs. Its default 2 vCPU machine started in 0.93 s, but its 4 vCPU size took 6.10 s, the slowest cold start on that track, and Build didn't finish on the default machine.",
    body: [
      "Buddy joined on both tracks from its own runs on Nov 25 (UTC), all on SDK commit a5c99d2; the benchmark harness was at commit 1e5683a for the default machine's runs and 5afd423 for the 4 vCPU runs and the real tasks: pause and resume, snapshots, bursts and both real tasks included. Its default is its 2x4 size, 2 vCPU and 4 GB; on 4 vCPU and 8 GB it ran its 4x8 size, both with a 50 GB disk, 45.5 GiB usable. Buddy's GB are decimal, so the sandboxes show 3.73 GiB and 7.45 GiB of memory, and on the same-machine track it is marked as a different machine. All 260 sandboxes fingerprinted ran on an AMD EPYC 9645, as a Linux container in a KVM virtual machine, and their traffic left from Hivelocity in New York City.",
      "On the default machine it started in 0.93 s (100 of 100), 12th of 17, and ran 100 tool calls in 16.4 s, 9th. Ten at once were all ready in 1.03 s, 8th of 17, and 25 at once in 5.01 s. On 4 vCPU and 8 GB it started in 6.10 s (100 of 100), 17th of 17: Buddy's create call took 5.74 s at that size against 0.50 s at 2x4. Bursts there took 12.4 s for 10 and 23.3 s for 25, the slowest of 16. Pause and resume took 6.19 s and 6.09 s, a snapshot 2.29 s and 2.28 s, and a sandbox from a snapshot 6.26 s and 6.72 s, the slowest of 14 on both machines. All 1,076 of its attempts on each machine succeeded, and its memory bandwidth was the highest on both.",
      "Buddy allows 5,000 API requests an hour per route, resetting on the UTC hour, and our SDK checks a new sandbox's status with GET /sandboxes/{id} every 200 ms, so a busy hour runs out. Our first default bursts started at 01:32 UTC, in the hour that also held the snapshot and cost tests and the end of the main tests, and Buddy answered a burst of 10 with HTTP 429; we reran the bursts after the hour turned. Our first 4 vCPU main run got HTTP 429 on a GET /sandboxes/{id} status check during its 98th create, so we ran the 100 as two halves of 50 in separate hours (04:00 and 07:19 UTC), and the 4 vCPU bursts of 25 one an hour. A first 4 vCPU snapshot run restored each snapshot at Buddy's default 2x4 size, because our harness didn't yet pass the size on restore; we fixed that in harness commit 5afd423 and reran it. All three first runs are replaced and their failures aren't counted, among them one preview whose new hostname didn't resolve yet, and the charts say so.",
      "Buddy has no usage or billing API, so every Buddy cost is its list price on our measured sandbox lifetime: $0.00024 per CPU-minute and per GB-minute, billed per started minute, leaving out storage at $0.00011 per GB-hour of disk used. That comes to $1.44 per 1,000 quick tasks on the default machine and $2.88 on 4 vCPU. Fix and test finished 5 of 5 on both machines, in 134 s (5th of 13) and 96 s (9th of 17), at $4.32 and $5.76 per 1,000. Cheapest needs a cost billed or metered by the provider, so these list-price estimates are shown on the cost charts but never picked as Cheapest. Build finished 5 of 5 on 4 vCPU in 226 s ($12.67 per 1,000) but none of 5 on the default machine, with 2 vCPU and 3.73 GiB: each build ran past the 20-minute step limit and was cancelled. That leaves Buddy last of 13 in the default machine's Reliability column, at 5 of 10 real tasks. There is no held-open run, as there is no billing data to tie an idle sandbox's cost to.",
      "Five Fix and test tasks at once, run on Nov 25, finished 10 of 10, with a median of 109 s against 95 s for one alone, 1.15 times as long. Buddy wasn't in the like-for-like checks or the 15-minute sustained CPU test.",
    ],
    charts: { kind: "provider", provider: "buddy" },
    home: { section: "real-tasks", tab: "fix-and-test", label: "Real tasks" },
  },
  {
    slug: "maritime-added",
    date: "2026-11-24",
    title: "Maritime added",
    text: "Maritime on both machines, with snapshots, bursts, both real tasks and costs metered from its own usage API. Its traffic leaves from Hetzner in Germany and Finland; it was among the slowest at cold start and the slowest on both real tasks, at the third-lowest Fix and test cost billed or metered per sandbox.",
    body: [
      "Maritime joined on both tracks from its own runs on Nov 23 and 24 (UTC, sandbox-sdk 619307b): pause and resume, snapshots, bursts and both real tasks included. Its default is its small preset, 2 vCPU, 4 GB and a 12 GB disk; on 4 vCPU and 8 GB it ran its medium preset, which has a 50 GB disk. Outbound traffic left from Hetzner in Falkenstein, Germany for 495 of 522 sandboxes and Helsinki, Finland for 27.",
      "On 4 vCPU and 8 GB it started in 1.62 s (100 of 100), 14th of 16, and ran 100 tool calls in 18.8 s, 9th. A snapshot took 11.2 s, starting from one 2.93 s, and pause and resume 16.6 s (99 of 100); its one failure on this track was a pause that got no response. On the default machine it started in 2.14 s (96 of 100), 15th of 16, with 6 creates taking 80 to 167 s, and pause and resume took 6.33 s.",
      "Maritime allows 30 creates a minute per API key, so, as with Instabox, each burst of 10 and 25 started a minute apart. Ten at once were all ready in 2.27 s on the default machine and 2.41 s on 4 vCPU, and 25 at once in 3.25 s and 4.71 s. Our first bursts ran back to back, and Maritime refused the creates past its rate with HTTP 429; so did the first 27 creates of the 4 vCPU main tests, which started two seconds later. We reran both with the spacing on Nov 24 and replaced the first runs, as we did for E2B's bursts; their failures, 6 besides the 429s, aren't counted, and the charts say so.",
      "Costs come from Maritime's own per-sandbox usage records at $0.0055 per vCPU-hour and $0.00275 per GB-hour: $0.14 per 1,000 quick tasks on the default machine and $0.29 on 4 vCPU. Fix and test took 281 s and 158 s, the slowest on both machines, at $1.65 and $2.13 per 1,000, third cheapest on both among costs billed or metered per sandbox, after Instabox and Boat. Build finished 4 of 5 on 4 vCPU (300 s, $5.51 per 1,000) but only 1 of 5 on the default machine: one was killed with exit 137 with 4 GB of memory, and three lost their command stream before the build finished, as did the one failure on 4 vCPU. There is no held-open run, because its usage API leaves out the $0.08 per GB-month it charges for a paused sandbox's disk.",
      "Five Fix and test tasks at once, run on Nov 24, finished 7 of 10, with a median of 359 s against 187 s for one alone; the other 3 failed a Vue test step. With fewer than 8 of 10 finished, the chart doesn't tag a change from alone.",
    ],
    charts: { kind: "provider", provider: "maritime" },
    home: { section: "real-tasks", tab: "fix-and-test", label: "Real tasks" },
  },
  {
    slug: "like-for-like-checks",
    date: "2026-11-24",
    title: "Like-for-like checks",
    text: "Five checks run the same way on every provider's same-machine sandbox (4 vCPU, 8 GB requested; boxd 16 GiB): native CPU, disk past the page cache, 10 at once, the CPUs and memory a sandbox shows, and its isolation and kernel.",
    body: [
      "Some earlier numbers differed for reasons other than the machine: each image's Python version (3.11 to 3.14), reads served from the guest's memory cache, burst credit, and how many CPUs a sandbox shows build tools. These checks hold the code and method fixed, so those differences either drop out (Python, the guest's cache) or show up as measured results (burst credit, reported CPUs). They are measured the same way on every provider and are not scored.",
      "Native CPU: one static C program with no runtime, built once per CPU architecture from one source (Upstash runs ARM, so it ran the ARM build). On four cores, Upstash Ephemeral Box (5.58B ops/s), Upstash Box (5.57B), Boat (5.38B) and Styne (5.33B) led; In minutes 12–15 of a continuous 15-minute burn, 12 of the 14 still ran at 97% or more of that rate. boxd ran at 82% and Styne at 16%: its burst credit is shared across the account, and after 46 minutes without Styne load it measured 5.33B ops/s in the short runs, 5.09B in the burn's first 30 seconds and about 0.87B after that. Our account had run many Styne sandboxes earlier that day, and these runs don't measure how much credit was left; the Nov 25 Python sustained test ran at full speed for about a minute, then at about 16% of it.",
      "Disk: a 2 GiB file with direct I/O past the guest's cache, then synced 4 KB writes, with every written page read back and checked. Synced 4 KB writes ranged from 103 a second (Boat) to 53,440 (Upstash Ephemeral Box). Modal and Beam run under gVisor, whose own file layer sits between the sandbox and the disk, so their disk figures are shown but marked not comparable.",
      "CPUs and memory: Daytona and Upstash Box show 64 CPUs and Upstash Ephemeral Box 48 through nproc, with a 4-CPU quota, so build tools that size from nproc start more workers than the sandbox can run at once. All 14 held 6 GiB of memory while writing a 2 GiB file.",
      "Isolation and kernel: every provider answered the same read-only questions. Boat's and Styne's kernels turn off one CPU mitigation (spec_rstack_overflow=off); Boat also sets init_on_free=0 and Styne cpuidle_haltpoll.force=1. Superserve (HTTP 402, billing) did not run, nor did Baseten, because our API key was rejected.",
      "Maritime ran all five checks in its own run on Nov 24 (sandbox-sdk 27f304a, the same check code); each chart's run note says so. It kept its four-core speed for the full 15 minutes (minutes 12–15 at 100% of minutes 0–3), and its 10 at once is shown but not comparable, as 9 of its 10 burns verified.",
    ],
    charts: { kind: "like-for-like" },
    home: { section: "like-for-like", tab: "cpu", label: "Like-for-like checks" },
  },
  {
    slug: "styne-added",
    date: "2026-11-23",
    title: "Styne added",
    text: "Styne on both machines, with snapshots, bursts and both real tasks. It was the fastest at cold start, 100 tool calls and both real tasks, on both tracks.",
    body: [
      "Styne joined on both tracks, from its own runs on Nov 23: pause and resume, snapshots, bursts of 10 and 25 and both real tasks included. Its default machine is 4 vCPU, 8 GB and a 51 GB disk, so both tracks ran the same machine.",
      "On 4 vCPU and 8 GB it started in 0.20 s, against Modal's 0.38 s, and ran 100 tool calls in 7.6 s, against Beam's 11 s. It was also first on bursts of 10 and 25 and on taking and starting from a snapshot. Fix and test took 56 s and Build 89 s; the next fastest took 82 s and 138 s.",
      "At Styne's list price of $0.032 an hour for this size, Fix and test cost $0.55 per 1,000 and Build $0.89, the lowest figures on the chart. These are estimates from our measured time: Styne's usage API reports daily account totals, not per sandbox. Cheapest needs a cost from the provider's bill or usage meter for each sandbox, so Styne is shown on the chart but not picked; Instabox, at $0.76 and $1.26 metered on this machine, is Cheapest.",
      "Five Fix and test tasks at once took 87.5 s, still the fastest, but 1.44 times its 61 s alone, the largest change on that chart. Styne runs a burstable shared-CPU class: a new sandbox starts with up to 10 minutes of full-speed burst credit (less after sustained account load) before holding to 16% per vCPU, and replenishes credit while under baseline; our longest Styne real task took 131 s.",
      "To measure past that burst window, we ran a 15-minute sustained CPU test (30 back-to-back 30-second segments with 4 workers per sandbox) on every provider's same-machine sandbox (4 vCPU and 8 GB requested; boxd ran its nearest 4 vCPU, 16 GiB size, and container providers Daytona and both Upstash products exposed 48–64 host CPUs while capped to 4 workers). In the Nov 25 run, Styne's first two segments were the fastest of any provider, about 105M ops/s. In its third, from minute 1, it fell to 22M, and it held 16–17M ops/s, about 16% of that peak, for the rest of the 15 minutes. Its docs say a sandbox gets less burst credit after recent load on the account; this run doesn't measure how much our account had left. It finished last of the 15 providers that completed, at 16.6M ops/s in minutes 12–15. The other 14 held 94% to 103% of their minutes 0–3 speed, led by Luxor (84.7M), Beam (76.2M) and Instabox (75.5M). Baseten didn't run, because our API key was rejected.",
      "A live probe of one Styne sandbox found desktop AMD Ryzen 5000 (Vermeer) silicon: CPU family 25, model 33, stepping 0 at 4.29 GHz, which Cloud Hypervisor names \"AMD EPYC Processor\". The guest kernel command line sets spec_rstack_overflow=off and cpuidle_haltpoll.force=1, and lscpu reports \"Spec rstack overflow: Vulnerable\" and \"Tsa: Vulnerable: No microcode\". /proc/uptime on a sandbox created moments before read about 21 hours, so its guest kernel was up long before that create; that suggests it came from a pool or snapshot, though the probe doesn't show which.",
      "On the default track, 10 of 2,989 operations failed with Styne errors: 9 commands that returned HTTP 503 in one run, and one file write that returned HTTP 500. One of five default-track Builds failed while its sandbox was being created, with the same 503. The same-machine track had no failures.",
    ],
    charts: { kind: "provider", provider: "styne" },
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
