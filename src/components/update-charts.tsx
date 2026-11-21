import type { ReactNode } from "react";

import { TierTable } from "@/components/cpu-tiers";
import { MetricChart } from "@/components/metric-chart";
import { RealTaskHeadline, taskTimes } from "@/components/real-tasks";
import { RealtaskBurstChart } from "@/components/realtask-burst";
import { ordinal, SectionTitle } from "@/components/seo/page-parts";
import { trackIds, trackInfo, tracks } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { isExtraTier, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { profileIds, profileInfo } from "@/lib/realistic";
import type { ProfileId } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { realtaskBurst } from "@/lib/realtask-burst-data";
import { providerTrack } from "@/lib/seo/provider";
import type { UpdateCharts as Charts } from "@/lib/updates";

/** The charts an update page shows: the home page's compact headline charts, every one in view at once. */

const pilot = `Pilot · ${realistic.coverage.headline.attempts} runs per provider`;
const realTaskSub = `Create to delete · Median s · lower is better · ${pilot}`;

/** One chart in a card, titled as the home page's headline cards are, with a provider's standing above it when the update is about one. */
function ChartCard({ marker, title, sub, standing, children }: { marker: string; title: string; sub: string; standing?: ReactNode; children: ReactNode }) {
  return (
    <div className="surface flex min-w-0 flex-col p-m sm:p-l">
      <h3 className="flex items-center gap-xs font-brand text-l font-medium">
        <span aria-hidden className="size-s shrink-0" style={{ backgroundColor: marker }} />
        <span className="min-w-0">{title}</span>
      </h3>
      <p className="mt-xxs text-s text-pretty text-neutral-7">{sub}</p>
      {standing ? <p className="mt-s text-s text-pretty">{standing}</p> : null}
      <div className="mt-m">{children}</div>
    </div>
  );
}

const TrackTitle = ({ id }: { id: TrackId }) => <SectionTitle id={`track-${id}`}>{trackInfo[id].label}</SectionTitle>;

/** Fix and test and Build on one track, side by side. */
function RealTaskPair({ track }: { track: TrackId }) {
  return (
    <section aria-labelledby={`track-${track}`} className="pt-xxl">
      <TrackTitle id={track} />
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">{trackInfo[track].description}</p>
      <div className="grid gap-m md:grid-cols-2">
        {profileIds.map((profile) => (
          <ChartCard key={profile} marker="var(--color-3)" title={`Real task: ${profileInfo[profile].label.toLowerCase()}`} sub={realTaskSub}>
            <RealTaskHeadline track={tracks[track]} profile={profile} />
          </ChartCard>
        ))}
      </div>
    </section>
  );
}

/** "2nd of 14 · 0.41 s", or why there is no result. */
function Rank({ rank, of, value, after }: { rank: number; of: number; value: string; after?: string }) {
  return (
    <>
      <span className="font-medium text-neutral-10">
        {ordinal(rank)} of {of}
      </span>{" "}
      <span className="text-neutral-7">
        · <span className="font-mono tabular-nums">{value}</span>
        {after}
      </span>
    </>
  );
}

const NoResult = ({ why }: { why: string }) => <span className="text-neutral-7">No result: {why.replace(/\.$/, "")}.</span>;

/** A metric's standing for one provider, as its provider page ranks it: medians inside each other's 95% intervals are tied. */
function MetricStanding({ id, track, metric }: { id: ProviderId; track: TrackId; metric: string }) {
  const row = providerTrack(track, id)?.groups.flatMap((g) => g.rows).find((r) => r.id === metric);
  if (!row) return <NoResult why="not run" />;
  const s = row.standing;
  switch (s.kind) {
    case "ranked":
      return <Rank rank={s.rank} of={s.of} value={s.median} after={s.tiedWith.length > 0 ? `, tied with ${s.tiedWith.map(providerName).join(", ")}` : undefined} />;
    case "blank":
      return <NoResult why={s.why.charAt(0).toLowerCase() + s.why.slice(1)} />;
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

/** A real task's standing for one provider: its place among the timed providers, fastest first. */
function TaskStanding({ id, track, profile }: { id: ProviderId; track: TrackId; profile: ProfileId }) {
  const all = taskTimes(tracks[track], profile);
  // Ranked on each provider's first CPU tier, as every rank on the site is; the chart beside it keeps the tiers for Every CPU tier.
  const timed = all.timed.filter((r) => !isExtraTier(r.provider));
  const missing = all.missing;
  const i = timed.findIndex((r) => r.provider === id);
  const row = timed[i];
  if (row) return <Rank rank={i + 1} of={timed.length} value={`${formatShort(row.medianWallS, "s")} s`} />;
  return <NoResult why={missing.find((m) => m.id === id)?.why ?? "not in the realistic pilot"} />;
}

/** One provider's place on each headline metric, a compact chart beside each, on one track. */
function ProviderTrack({ id, track }: { id: ProviderId; track: TrackId }) {
  const t = tracks[track];
  const short = "Median s · lower is better";
  return (
    <section aria-labelledby={`track-${track}`} className="pt-xxl">
      <TrackTitle id={track} />
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">{trackInfo[track].description}</p>
      <div className="grid gap-m md:grid-cols-2">
        <ChartCard marker="var(--color-2)" title="Cold start" sub={short} standing={<MetricStanding id={id} track={track} metric="cold" />}>
          <MetricChart track={t} metric={t.metric("cold")} what="" compact highlight={id} />
        </ChartCard>
        <ChartCard marker="var(--color-3)" title="100 tool calls" sub={short} standing={<MetricStanding id={id} track={track} metric="tool-replay" />}>
          <MetricChart track={t} metric={t.metric("tool-replay")} what="" compact highlight={id} />
        </ChartCard>
        {profileIds.map((profile) => (
          <ChartCard key={profile} marker="var(--color-3)" title={`Real task: ${profileInfo[profile].label.toLowerCase()}`} sub={realTaskSub} standing={<TaskStanding id={id} track={track} profile={profile} />}>
            <RealTaskHeadline track={t} profile={profile} highlight={id} />
          </ChartCard>
        ))}
      </div>
    </section>
  );
}

export function UpdateCharts({ charts }: { charts: Charts }) {
  switch (charts.kind) {
    case "real-tasks":
      return charts.tracks.map((track) => <RealTaskPair key={track} track={track} />);
    case "provider":
      return trackIds
        .filter((track) => tracks[track].providers.some((p) => p.id === charts.provider))
        .map((track) => <ProviderTrack key={track} id={charts.provider} track={track} />);
    case "realtask-burst":
      return (
        <section className="pt-xxl">
          <RealtaskBurstChart data={realtaskBurst} />
        </section>
      );
    case "tiers":
      return (
        <section className="pt-xxl">
          <SectionTitle id="tiers">{providerName(charts.provider)} on each CPU tier</SectionTitle>
          <div className="surface mt-l p-m sm:p-l">
            <TierTable brand={charts.provider} track={tracks["same-spec"]} realistic={realistic} burst={realtaskBurst} />
          </div>
        </section>
      );
    default: {
      const _exhaustive: never = charts;
      return _exhaustive;
    }
  }
}
