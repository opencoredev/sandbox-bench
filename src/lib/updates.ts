/**
 * The newest changes to the benchmark, newest first, for the list beside the
 * home page title. Keep three: add a line when a provider joins or a result
 * changes, and drop the oldest. Every claim here must match the charts it
 * links to.
 */
/** A page by path, or a section and one of its tabs on the home page. */
export type Update = { date: string; title: string; text: string } & ({ href: string } | { section: string; tab: string });

export const updates: readonly Update[] = [
  {
    date: "Nov 18",
    title: "Every provider on real tasks",
    text: "Luxor and Superserve reran with 20 GB disks, so every provider now has results for both real tasks on the Same machine track (boxd's nearest size has 16 GB).",
    section: "real-tasks",
    tab: "build",
  },
  {
    date: "Nov 18",
    title: "Beam added",
    text: "Beam Sandboxes on both machines. Fastest at 100 tool calls on 4 vCPU and 8 GB; its 128 MiB default is too small for the real tasks.",
    href: "/providers/beam/",
  },
  {
    date: "Nov 18",
    title: "Real tasks, timed",
    text: "Fix and test and Build get their own time-to-finish charts, from create to confirmed delete, beside what each costs.",
    section: "real-tasks",
    tab: "fix-and-test",
  },
];
