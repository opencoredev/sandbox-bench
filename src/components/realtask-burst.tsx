import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, NotOnChart, Who, sentence } from "@/components/metric-chart";
import { Card } from "@/components/tabs";
import { formatShort } from "@/lib/format";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { wallText } from "@/lib/realistic";
import { burstTimes, slowdownText } from "@/lib/realtask-burst";
import type { BurstRan, RealtaskBurst } from "@/lib/realtask-burst";

/** The section id, shared with the nav and the update that links here. */
export const realtaskBurstSection = "real-tasks-at-once";

const failures = (p: BurstRan) => {
  const failed = p.tasks.filter((t) => !t.completed);
  const counts = new Map<string, number>();
  for (const t of failed) {
    const why = t.failure?.reason ?? "did not complete";
    counts.set(why, (counts.get(why) ?? 0) + 1);
  }
  const reasons = [...counts].map(([why, n]) => (counts.size > 1 ? `${n}: ${why}` : why));
  return failed.length === 0 ? undefined : `${failed.length} of ${p.attempts} tasks failed (${reasons.join("; ")}); the time is the median of the rest`;
};

function marksFor(timed: readonly BurstRan[]) {
  let next = 0;
  const marks = new Map<ProviderId, { mark: number; note: string }>();
  for (const p of timed) {
    const note = [failures(p), p.changeNote ?? undefined].filter((x) => x !== undefined).map(sentence).join(" ");
    if (note) marks.set(p.provider, { mark: ++next, note });
  }
  return marks;
}

function columnsOf(timed: readonly BurstRan[], marks: ReturnType<typeof marksFor>): Column[] {
  return timed.map((p) => ({
    provider: p.provider,
    label: formatShort(p.medianWallS, "s"),
    mark: marks.get(p.provider)?.mark,
    tag: p.slowdown === null ? undefined : `${p.slowdown.toFixed(2)}×`,
    segments: [{ value: p.medianWallS, color: providerColor(p.provider), fill: "solid" }],
    detail: [
      ["Median time, 5 at once", wallText(p.medianWallS)],
      ...(p.soloMedianWallS === null ? [] : [[p.solo ? "One at a time, same day" : "One at a time", wallText(p.soloMedianWallS)] as const]),
      ...(p.slowdown === null ? [] : [["Change", slowdownText(p.slowdown)] as const]),
      ...(p.slowdownWithoutUpload === null ? [] : [["Without the upload", slowdownText(p.slowdownWithoutUpload)] as const]),
      ["Completed", `${p.completed} of ${p.attempts}`],
      ...(p.medianUploadS === null ? [] : [["Toolchain upload", p.soloMedianUploadS === null ? wallText(p.medianUploadS) : `${wallText(p.medianUploadS)} (alone ${wallText(p.soloMedianUploadS)})`] as const]),
      ...(p.roundAllDoneS.length === 0 ? [] : [["All 5 done", p.roundAllDoneS.map((s) => wallText(s)).join(", ")] as const]),
    ],
  }));
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Fix and test started several times together on each provider: does it stay as fast with a fleet of agents working at once? */
export function RealtaskBurstChart({ data }: { data: RealtaskBurst }) {
  const { timed, missing } = burstTimes(data);
  const marks = marksFor(timed);
  const title = `Fix and test, ${data.size} at once`;
  return (
    <Card>
      <ChartHead title={title} sub={`${data.size} Fix and test tasks started together, ${data.rounds} rounds · 4 vCPU, 8 GB · Median seconds per task · Tag: time at 5 at once ÷ time alone · Lower is better`} />
      <Columns columns={columnsOf(timed, marks)} label={`${title}: time to finish by provider`} />
      <NotOnChart ids={missing.map((m) => m.id)} />
      <Footnotes
        items={[
          ...[...marks].map(([id, m]) => ({ mark: m.mark, text: <><Who id={id} />: {m.note}</> })),
          ...missing.map(({ id, why }) => ({ text: <><Who id={id} />: no result ({why}).</> })),
          { lead: "Time", text: "Each task is the published Fix and test workload, from the create request to confirmed deletion. The bar is the median of the tasks that finished." },
          {
            lead: "Compared with alone",
            text: `One provider ran at a time. Each ran one task alone, ${data.size} at once, one alone and ${data.size} at once again, all on ${dayOf(data.run.startedAt)}, so both numbers share the hour and our network. The tag divides the time at ${data.size} at once by the median of the two tasks alone. With only two tasks alone, a change within about 10% is not a measurable slowdown.`,
          },
          { lead: "Upload", text: `Every task uploads the same 152 MB toolchain from our machine in Florida. ${data.size} at once share that upload link, which adds a few seconds to most providers; the hover card shows the change with and without it.` },
          { lead: "Runs", text: `${data.rounds} rounds of ${data.size} per provider (SDK commit ${data.run.sdkCommit.slice(0, 7)}). Few runs, so read the times as descriptive.` },
          { lead: "Cost", text: "Timing only. These runs weren't reconciled against bills, so they add nothing to the cost charts." },
        ]}
      />
    </Card>
  );
}
