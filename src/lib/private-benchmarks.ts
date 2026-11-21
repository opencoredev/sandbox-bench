/**
 * The words for private benchmarks, the paid service for sandbox providers,
 * shared by the home page section and /for-providers/. No price appears
 * anywhere on the site: providers ask through the form.
 */

export const privateTitle = "Private benchmarks for sandbox providers";

export const privateSummary =
  "We run the harness behind this site against your sandboxes every day, in the regions you choose, and share the results only with your team. A slower cold start or a new failure shows up the next day, with the logs to trace it.";

/** What a provider gets, one item each. */
export const privateOffer = [
  {
    title: "Daily private runs",
    text: "The suite you see on this site, cold start through real tasks and bursts, run every day on your account in the regions you choose.",
  },
  {
    title: "Run logs",
    text: "Every attempt with its timings and the exact error, so a failure leads back to the request that caused it.",
  },
  {
    title: "Reruns",
    text: "If a result looks wrong, we run it again on the same harness and settings and tell you what changed.",
  },
  {
    title: "Uptime checks",
    text: "Between the daily runs we keep checking that sandboxes still start and run commands, so an outage doesn't wait for the next run to show up.",
  },
  {
    title: "Regression alerts",
    text: "When a result gets worse than your recent runs, or a test starts failing, we tell you the same day and link the runs that show it.",
  },
  {
    title: "Cost against your bill",
    text: "We compare what our meter recorded for the runs with the charges on your bill, and show you where the two differ.",
  },
  {
    title: "A shared Slack channel",
    text: "One channel with Leo, who runs the bench, for questions, reruns and results.",
  },
] as const satisfies readonly { title: string; text: string }[];

export const independenceTitle = "Paying never changes the public results";

/** Said wherever the service is offered. */
export const independence = [
  "The public benchmark runs on our own accounts, with the same tests and the same rules for every provider, whether or not they pay us.",
  "A private customer doesn't choose what we publish, how we test or when. Your private runs use an account you give us, and their results stay between us and your team.",
] as const;
