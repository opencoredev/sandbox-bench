/**
 * The newest changes to the benchmark, newest first, for the list beside the
 * home page title. Keep three: add a line when a provider joins or a result
 * changes, and drop the oldest. Every claim here must match the charts it
 * links to.
 */
export interface Update {
  date: string;
  title: string;
  text: string;
  href: string;
}

export const updates: readonly Update[] = [
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
    href: "#real-tasks/fix-and-test",
  },
  {
    date: "Nov 18",
    title: "Instabox added",
    text: "Instabox on both machines, with bursts and both real tasks.",
    href: "/providers/instabox/",
  },
];
