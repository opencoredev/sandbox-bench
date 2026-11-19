import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Columns } from "@/components/columns";
import { NoCostResults, costColumns } from "@/components/cost";
import { ComingNext, CompactNotes, Footnotes, MetricChart } from "@/components/metric-chart";
import { ProviderLogo } from "@/components/provider-logo";
import { RealTaskHeadline } from "@/components/real-tasks";
import { columnsOf as taskCostColumns } from "@/components/realistic";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, link, ordinal, RawData, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { TrackSwitch } from "@/components/track-switch";
import { hasTaskCosts } from "@/lib/cost";
import { allocationNotes } from "@/lib/notes";
import { providerFormerName, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { headlineRows, noCostReason, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { openGraphImages, twitterImages } from "@/lib/seo/social";
import { caveats, disclosure } from "@/lib/seo/copy";
import { alternativesPath, comparePath, comparisonsWith, isAlternativesPage, isProviderPage, lastModified, providerPages, providerPath, providersPath, site } from "@/lib/seo/pages";
import type { ProviderPageId } from "@/lib/seo/pages";
import { hasResults, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Track, TrackId } from "@/lib/data";
import { fingerprintDate } from "@/lib/hardware";
import { headline, providerNotes, providerResults, realTaskCost, realTaskTime, taskText } from "@/lib/seo/provider";
import type { MetricRow, Placing, ProviderTrack } from "@/lib/seo/provider";

export const dynamicParams = false;

export function generateStaticParams() {
  return providerPages.map((id) => ({ id }));
}

type Props = { params: Promise<{ id: string }> };

async function pageId(props: Props): Promise<ProviderPageId> {
  const { id } = await props.params;
  if (!isProviderPage(id)) notFound();
  return id;
}

const titleOf = (id: ProviderPageId) => `${providerName(id)} sandbox benchmark: cold start, agent tasks and cost`;

/** The machine a track ran on, in words, from the track's own definition. */
const machineOf = (trackId: ProviderTrack["id"]) => (trackId === "same-spec" ? `the same ${trackInfo["same-spec"].short} machine` : "its default machine");

/** One sentence of measured facts for the meta description, from the landing track, machine first. */
function summary(id: ProviderPageId) {
  const r = providerResults(id);
  const t = r.tracks[0];
  if (!t) return `${r.name} sandbox results from Sandbox bench.`;
  const cold = headline(t, "cold");
  const tool = headline(t, "tool-replay");
  const parts = [
    cold ? `${cold.median} cold start (${ordinal(cold.rank)} of ${cold.of}${cold.tied ? ", tied" : ""})` : null,
    tool ? `${tool.median} ${tool.label.toLowerCase()}` : null,
    t.cost.kind === "priced" ? `${t.cost.perThousand} per 1,000 tasks (${t.cost.tag})` : null,
  ].filter((x) => x !== null);
  return `${r.name} sandbox on ${machineOf(t.id)}: ${parts.join(", ")}. Medians, p95s and 95% intervals.`;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const id = await pageId(props);
  const title = titleOf(id);
  const description = summary(id);
  const url = `${site}${providerPath(id)}`;
  return {
    title,
    description,
    alternates: { canonical: providerPath(id) },
    openGraph: { title, description, type: "article", siteName: "Sandbox bench", url, images: openGraphImages },
    twitter: { card: "summary_large_image", title, description, images: twitterImages },
  };
}

const names = (ids: readonly ProviderId[]) => ids.map(providerName).join(", ");

/** A metric row as a placing: its median and rank, or why it has none. */
function placingOf(row: MetricRow | undefined): Placing & { tied: boolean } {
  if (!row) return { kind: "blank", why: "Not measured on this track", tied: false };
  const s = row.standing;
  switch (s.kind) {
    case "blank":
      return { kind: "blank", why: s.why, tied: false };
    case "ranked":
      return { kind: "ranked", value: s.median, rank: s.rank, of: s.of, tied: s.tiedWith.length > 0 };
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

const rowOf = (t: ProviderTrack, metricId: string) => t.groups.flatMap((g) => g.rows).find((r) => r.id === metricId);

/** The best median in words, for a tile's foot: "Fastest: E2B 0.52 s", or nothing when this provider leads. */
function leaderLine(row: MetricRow | undefined) {
  if (!row || row.standing.kind !== "ranked" || !row.standing.leader) return undefined;
  return `${row.better === "lower" ? "Lowest" : "Highest"}: ${providerName(row.standing.leader.id)} ${row.standing.leader.median}`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Tile {
  label: string;
  /** The chart below the tiles this one opens. */
  anchor: string;
  placing: Placing & { tied?: boolean };
  caption?: string;
}

/** The provider's headline results on one track, the home page's stat strip with this provider's value and rank in each. */
function tilesOf(id: ProviderPageId, t: ProviderTrack): Tile[] {
  const cold = rowOf(t, "cold");
  const replay = rowOf(t, "tool-replay");
  const cost = realTaskCost(t.id, id, "fix-and-test");
  return [
    { label: "Cold start", anchor: `${t.id}-cold`, placing: placingOf(cold), caption: leaderLine(cold) },
    { label: "100 tool calls", anchor: `${t.id}-tool-replay`, placing: placingOf(replay), caption: leaderLine(replay) },
    { label: "Real task: fix and test", anchor: `${t.id}-fix-and-test`, placing: realTaskTime(t.id, id, "fix-and-test"), caption: "Create to delete, median" },
    { label: "Real task: build", anchor: `${t.id}-build`, placing: realTaskTime(t.id, id, "build"), caption: "Create to delete, median" },
    // Only where the provider has a cost: a tile saying "no cost" would crowd out the results it does have.
    ...(cost.kind === "ranked"
      ? [{ label: "Fix and test cost", anchor: `${t.id}-fix-and-test-cost`, placing: cost, caption: cost.notCounted.length ? `Per 1,000 completed. Can't be the cheapest pick: ${cost.notCounted.join("; ")}` : "Per 1,000 completed tasks" }]
      : []),
  ];
}

/** One big number and where it ranks, linking to its chart below. */
function StatTile({ tile }: { tile: Tile }) {
  const p = tile.placing;
  return (
    <a href={`#${tile.anchor}`} className="surface surface-link group focus-ring flex h-full flex-col px-m py-s">
      <span className="flex items-start justify-between gap-xs text-s text-neutral-7">
        {tile.label}
        <ArrowDown aria-hidden className="mt-0.5 size-4 shrink-0 group-hover:text-neutral-10" />
      </span>
      {p.kind === "ranked" ? (
        <>
          <span className="mt-xs font-mono text-l tabular-nums sm:text-xl">{p.value}</span>
          <span className="mt-xs text-s font-medium text-neutral-10">
            {ordinal(p.rank)} of {p.of}
            {p.tied ? <span className="font-normal text-neutral-7">, tied</span> : null}
          </span>
        </>
      ) : (
        <>
          <span className="mt-xs text-l text-neutral-8">No result</span>
          <span className="mt-xs text-xs text-pretty text-neutral-7">{capital(p.why)}</span>
        </>
      )}
      {tile.caption ? <span className="mt-auto pt-xs text-xs text-pretty text-neutral-7">{tile.caption}</span> : null}
    </a>
  );
}

function StatTiles({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  const tiles = tilesOf(id, t);
  return (
    <ul className="grid grid-cols-2 gap-s lg:grid-cols-5">
      {tiles.map((tile) => (
        <li key={tile.label} className="last:odd:col-span-2 lg:last:odd:col-span-1">
          <StatTile tile={tile} />
        </li>
      ))}
    </ul>
  );
}

/** Where a chart lives on the home page, on this track: `/#startup/cold`, `/?track=default#startup/cold`. */
const fullChart = (trackId: TrackId, section: string, tab: string) => `/${trackId === "default" ? "?track=default" : ""}#${section}/${tab}`;

/** A comparison card, as the home page's headline cards: a title that opens the full chart, a one-line subtitle, the compact chart. */
function ChartCard({ anchor, marker, title, sub, href, children }: { anchor: string; marker: string; title: string; sub: string; href: string; children: ReactNode }) {
  return (
    <div id={anchor} className="surface flex min-w-0 scroll-mt-24 flex-col p-m sm:p-l">
      <h3 className="font-brand text-l font-medium">
        <a href={href} className="group focus-ring flex items-center gap-xs rounded-xs">
          <span aria-hidden className="size-s shrink-0" style={{ backgroundColor: marker }} />
          <span className="min-w-0 truncate group-hover:underline group-hover:decoration-neutral-6 group-hover:underline-offset-4">{title}</span>
          <ArrowUpRight aria-hidden className="ml-auto size-5 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
        </a>
      </h3>
      <p className="mt-xxs mb-m truncate text-s text-neutral-7">{sub}</p>
      {children}
    </div>
  );
}

/** Fix and test's cost per 1,000 completed tasks, every costed provider, with why the others have none. */
function TaskCostChart({ id, track }: { id: ProviderPageId; track: Track }) {
  const { costed, uncosted } = headlineRows(realistic, runTrackOf[track.id], "fix-and-test");
  if (costed.length === 0) return <ComingNext compact>No fix and test costs on this track yet.</ComingNext>;
  return (
    <>
      <Columns columns={taskCostColumns(costed, track.id)} label="Fix and test: cost per 1,000 completed tasks by provider" compact linked highlight={id} />
      <CompactNotes items={uncosted.map((r) => ({ mark: undefined, id: r.provider, note: `no cost (${noCostReason(r)})` }))} />
    </>
  );
}

/** The quick task's cost per 1,000, as the home page's headline card draws it. */
function QuickCostChart({ id, track }: { id: ProviderPageId; track: Track }) {
  if (!hasTaskCosts(track)) return <NoCostResults compact />;
  const { columns, marks } = costColumns(track);
  const machine = allocationNotes(track);
  return (
    <>
      <Columns columns={columns} label="Cost per 1,000 tasks by provider" compact linked highlight={id} />
      <CompactNotes items={[...marks].map(([pid, mark]) => ({ mark, id: pid, note: machine[pid] ?? "" }))} />
    </>
  );
}

/** Every provider's result on the headline tests, this provider bright and the rest dimmed. */
function Charts({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  const track = tracks[t.id];
  const short = "Median s · lower is better";
  const task = "Create to delete · Median s · lower is better";
  return (
    <div className="grid gap-m md:grid-cols-2">
      <ChartCard anchor={`${t.id}-cold`} marker="var(--color-2)" title="Cold start" sub={short} href={fullChart(t.id, "startup", "cold")}>
        <MetricChart track={track} metric={track.metric("cold")} what="" compact highlight={id} />
      </ChartCard>
      <ChartCard anchor={`${t.id}-tool-replay`} marker="var(--color-3)" title="100 tool calls" sub={short} href={fullChart(t.id, "agent", "tool-replay")}>
        <MetricChart track={track} metric={track.metric("tool-replay")} what="" compact highlight={id} />
      </ChartCard>
      <ChartCard anchor={`${t.id}-fix-and-test`} marker="var(--color-3)" title="Real task: fix and test" sub={task} href={fullChart(t.id, "real-tasks", "fix-and-test")}>
        <RealTaskHeadline track={track} profile="fix-and-test" highlight={id} />
      </ChartCard>
      <ChartCard anchor={`${t.id}-build`} marker="var(--color-3)" title="Real task: build" sub={task} href={fullChart(t.id, "real-tasks", "build")}>
        <RealTaskHeadline track={track} profile="build" highlight={id} />
      </ChartCard>
      <ChartCard anchor={`${t.id}-fix-and-test-cost`} marker="var(--color-1)" title="Fix and test, per 1,000" sub="Per completed task · USD · lower is better" href={fullChart(t.id, "task-cost", "fix-and-test")}>
        <TaskCostChart id={id} track={track} />
      </ChartCard>
      <ChartCard anchor={`${t.id}-quick-cost`} marker="var(--color-1)" title="Quick task cost, per 1,000" sub="Create, 100 tool calls, delete · USD · lower is better" href={fullChart(t.id, "cost", "task")}>
        <QuickCostChart id={id} track={track} />
      </ChartCard>
    </div>
  );
}

/**
 * Renders a part of the page once per track, as the home page's Tracked does,
 * so the machine switch flips this page too. A track with no results for this
 * provider says so instead.
 */
function ByTrack({ id, r, children }: { id: ProviderPageId; r: ReturnType<typeof providerResults>; children: (t: ProviderTrack) => ReactNode }) {
  return (
    <>
      {trackIds.map((tid) => {
        const t = r.tracks.find((x) => x.id === tid);
        return (
          <div key={tid} data-track-view={tid}>
            {t && hasResults(tracks[tid]) ? (
              children(t)
            ) : (
              <Card className="text-s text-neutral-7">
                <span className="font-medium text-neutral-10">{trackInfo[tid].label}:</span> no results for {providerName(id)} on this track yet.
              </Card>
            )}
          </div>
        );
      })}
    </>
  );
}

/** One term and its value, label left and value right, so a long value wraps under itself. */
const Row = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-m sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
    <dt className="text-s text-neutral-7">{term}</dt>
    <dd className="text-s text-pretty text-neutral-10">{children}</dd>
  </div>
);

/** Who it ties with and who leads, in a few words: "Tied with E2B · lowest median: Modal 0.38 s". */
function context(row: MetricRow, s: Extract<MetricRow["standing"], { kind: "ranked" }>) {
  const tie = s.tiedWith.length ? `Tied with ${names(s.tiedWith)}` : "";
  const lead = s.leader ? `${row.better === "lower" ? "lowest" : "highest"} median: ${providerName(s.leader.id)} ${s.leader.median}` : "";
  return [tie, tie ? lead : capital(lead)].filter((x) => x !== "").join(" · ");
}

function Standing({ row }: { row: MetricRow }) {
  const s = row.standing;
  switch (s.kind) {
    case "blank":
      return <span className="text-xs text-neutral-7">{s.why}</span>;
    case "ranked": {
      const more = context(row, s);
      return (
        <>
          <span className="font-medium whitespace-nowrap text-neutral-10">
            {ordinal(s.rank)} of {s.of}
          </span>
          {more ? <span className="mt-0.5 block text-xs text-pretty text-neutral-7">{more}</span> : null}
        </>
      );
    }
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

/** A phone's version of one test's row: name and rank on a line, then the numbers, then who ties and leads. */
function PhoneRow({ row }: { row: MetricRow }) {
  const s = row.standing;
  return (
    <li className="py-xs">
      <p className="flex items-baseline justify-between gap-s text-s">
        <span className="text-neutral-10">{row.label}</span>
        {s.kind === "ranked" ? (
          <span className="font-medium whitespace-nowrap text-neutral-10">
            {ordinal(s.rank)} of {s.of}
          </span>
        ) : (
          <span className="text-neutral-7">n/a</span>
        )}
      </p>
      {s.kind === "ranked" ? (
        <>
          <p className="mt-0.5 font-mono text-xs text-neutral-8 tabular-nums">
            <span className="text-neutral-10">{s.median}</span> · p95 {s.p95} · 95%: {s.ci}
          </p>
          <p className="mt-0.5 text-xs text-pretty text-neutral-7">
            {capital(row.better)} is better{context(row, s) ? ` · ${context(row, s)}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-xs text-pretty text-neutral-7">{s.why}</p>
      )}
    </li>
  );
}

function MetricTable({ title, rows }: { title: string; rows: readonly MetricRow[] }) {
  return (
    <div>
      <h3 className="mb-xs text-m font-medium text-neutral-10">{title}</h3>
      {/* Phones get one stacked block per test; a five-column table doesn't fit. */}
      <ul className="flex flex-col sm:hidden">
        {rows.map((r) => (
          <PhoneRow key={r.id} row={r} />
        ))}
      </ul>
      {/* Fixed columns so every group's table lines up. */}
      <table className="hidden w-full table-fixed text-left text-s sm:table">
        <thead className="text-xs text-neutral-7">
          <tr>
            <th scope="col" className="w-[30%] py-xxs pr-m font-normal">Test</th>
            <th scope="col" className="w-[12%] py-xxs pr-m font-normal">Median</th>
            <th scope="col" className="w-[11%] py-xxs pr-m font-normal">p95</th>
            <th scope="col" className="w-[19%] py-xxs pr-m font-normal">95% interval</th>
            <th scope="col" className="py-xxs font-normal">Rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <th scope="row" className="py-xs pr-m font-normal text-neutral-10">
                {r.label} <span className="block text-xs text-neutral-7">{r.better} is better</span>
              </th>
              {r.standing.kind === "ranked" ? (
                <>
                  <td className="py-xs pr-m font-mono whitespace-nowrap text-neutral-10 tabular-nums">{r.standing.median}</td>
                  <td className="py-xs pr-m font-mono whitespace-nowrap text-neutral-8 tabular-nums">{r.standing.p95}</td>
                  <td className="py-xs pr-m font-mono text-xs whitespace-nowrap text-neutral-8 tabular-nums">{r.standing.ci}</td>
                </>
              ) : (
                <>
                  <td className="py-xs pr-m text-neutral-7">n/a</td>
                  <td />
                  <td />
                </>
              )}
              <td className="py-xs">
                <Standing row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pause and resume in words: the measured split, the site's note, or whether it is supported. */
function pauseLine(t: ProviderTrack) {
  if (t.pause.supported && "split" in t.pause && t.pause.split)
    return `supported; pause ${t.pause.split.pause.toFixed(2)} s and resume ${t.pause.split.resume.toFixed(2)} s median over ${t.pause.split.n} runs.`;
  if ("note" in t.pause && t.pause.note) return t.pause.note;
  return t.pause.supported ? "supported." : "not supported.";
}

function TrackSection({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  const name = providerName(id);
  const heading = `${name} on ${machineOf(t.id)}`;
  const href = t.id === "same-spec" ? "/" : "/?track=default";
  // The longer explanations sit in the folded notes, so the list reads at a glance.
  const notes = [
    ...(t.machine.note ? [{ lead: "Machine", text: t.machine.note }] : []),
    ...(t.cost.kind === "priced" ? [{ lead: "Cost", text: `${t.cost.perTask} per task, ${t.cost.source} (${t.cost.basis.toLowerCase()}). ${taskText()}` }] : []),
    ...(t.pricePerHour !== null && (t.wholeMachine.counterfactual || t.priceNote)
      ? [{ lead: "List price", text: `${t.pricePerHour} per hour for this machine, compute only${t.wholeMachine.counterfactual ? "; a counterfactual, since it bills usage, not the whole machine" : ""}${t.priceNote ? `; ${t.priceNote}` : ""}.` }]
      : []),
  ];
  return (
    // Not `track-${t.id}`: the machine switch reads `#track-default` as its own style element (lib/tracks.ts).
    <section aria-labelledby={`machine-${t.id}`} className="pt-xxl">
      <SectionTitle id={`machine-${t.id}`}>{heading}</SectionTitle>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
        {t.description} Runs from {t.run.start} to {t.run.end}, {t.providerCount} providers. See every provider side by side on the{" "}
        <a className={link} href={href}>
          full results
        </a>
        .
      </p>
      <Card>
        <dl className="grid gap-x-xl gap-y-s md:grid-cols-2">
          <Row term="Asked for">{t.machine.asked}</Row>
          <Row term="Measured inside">
            {t.machine.measured ?? "not measured"}
            {t.id === "same-spec" && !t.machine.equalSpec ? <span className="text-neutral-7"> (machine differs)</span> : ""}
          </Row>
          {t.ranIn ? <Row term="Ran in">{t.ranIn}</Row> : null}
          <Row term="Success rate">
            <span className="font-mono tabular-nums">{t.reliability.successRate === null ? "n/a" : `${(t.reliability.successRate * 100).toFixed(2)}%`}</span>{" "}
            <span className="text-neutral-7">
              ({t.reliability.succeeded.toLocaleString("en-US")} of {t.reliability.attempts.toLocaleString("en-US")})
            </span>
          </Row>
          <Row term="Cost per 1,000 tasks">
            {t.cost.kind === "priced" ? (
              <>
                <span className="font-mono tabular-nums">{t.cost.perThousand}</span> <span className="text-neutral-7">({t.cost.tag})</span>
              </>
            ) : (
              <span className="text-neutral-7">{t.cost.note}</span>
            )}
          </Row>
          {t.cost.kind === "priced" ? (
            <Row term="Cost per task">
              <span className="font-mono tabular-nums">{t.cost.perTask}</span>
            </Row>
          ) : null}
          <Row term="Billing">{capital(t.billing)}</Row>
          {t.pricePerHour !== null ? (
            <Row term="List price">
              <span className="font-mono tabular-nums">{t.pricePerHour}</span> per hour for this machine, compute only
            </Row>
          ) : null}
          <Row term="Pause and resume">{capital(pauseLine(t))}</Row>
          <Row term={`Failures counted against ${name}`}>
            {t.failures.length === 0 ? "None." : t.failures.map((f) => `${f.reason} (${f.count} ${f.count === 1 ? "test" : "tests"})`).join("; ")}
          </Row>
        </dl>
        <Footnotes items={notes} />
      </Card>
      <Card className="mt-m">
        <div className="flex flex-col gap-xl">
          {t.groups.map((g) => (g.rows.length ? <MetricTable key={g.title} title={g.title} rows={g.rows} /> : null))}
        </div>
      </Card>
      {t.picks.length ? (
        <Card className="mt-m">
          <h3 className="mb-xs text-m font-medium text-neutral-10">Quick picks on this track, all providers</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-s">
              <thead className="text-xs text-neutral-7">
                <tr>
                  <th scope="col" className="py-xxs pr-m font-normal">Need</th>
                  <th scope="col" className="py-xxs pr-m font-normal">Pick</th>
                  <th scope="col" className="py-xxs font-normal">Runner-up</th>
                </tr>
              </thead>
              <tbody>
                {t.picks.map((q) => (
                  <tr key={q.need} className="align-top">
                    <th scope="row" className="py-xs pr-m font-normal text-neutral-7">{q.need}</th>
                    <td className="py-xs pr-m text-neutral-10">
                      {q.pick}
                      {q.note ? <span className="mt-xxs block text-xs text-pretty text-neutral-7">{q.note}</span> : null}
                    </td>
                    <td className="py-xs text-neutral-8">{q.runnerUp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

// The switch appears only once both tracks have results, as on the home page.
const showSwitch = trackIds.every((tid) => hasResults(tracks[tid]));

export default async function ProviderPage(props: Props) {
  const id = await pageId(props);
  const r = providerResults(id);
  const name = r.name;
  const formerly = providerFormerName(id);
  const url = `${site}${providerPath(id)}`;
  const others = providerPages.filter((p) => p !== id);
  const h = r.hardware;
  const rivals = Math.max(0, (r.tracks[0]?.providerCount ?? 1) - 1);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: titleOf(id),
        description: summary(id),
        dateModified: lastModified(providerPath(id)),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        about: { "@type": "SoftwareApplication", name: `${name} sandbox`, applicationCategory: "DeveloperApplication" },
        publisher: { "@type": "Organization", name: "opencoredev", url: "https://github.com/opencoredev" },
        author: { "@type": "Person", name: "Leo", alternateName: "@leodev", url: "https://leodev.cv" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: "Sandbox providers", item: `${site}${providersPath}` },
          { "@type": "ListItem", position: 3, name: `${name} sandbox benchmark`, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      {/* Hidden hover cards near a chart's edge are wider than a phone screen; clip them rather than let the page scroll sideways. */}
      <main className="mx-auto max-w-[1100px] overflow-x-clip px-m sm:px-l">
        <Breadcrumb current={name} parent={{ name: "Providers", href: providersPath }} />
        <h1 className="flex items-center gap-s pt-m font-brand text-xl font-medium text-balance sm:text-xxl">
          <ProviderLogo id={id} size={40} />
          {name} sandbox benchmark
        </h1>
        <div className="flex flex-col gap-l pt-s pb-l lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-[60ch] text-m text-pretty text-neutral-10 sm:text-l">
            Where {name} ranks against {rivals} other sandbox providers on cold start, real coding tasks, tool calls and cost.
          </p>
          {showSwitch ? <TrackSwitch /> : null}
        </div>

        <ByTrack id={id} r={r}>
          {(t) => (
            <>
              <p className="mb-s text-s text-neutral-7">
                {trackInfo[t.id].label} · {t.providerCount} providers · {t.run.start} to {t.run.end} · medians, rank among providers with a result
              </p>
              <StatTiles id={id} t={t} />
            </>
          )}
        </ByTrack>

        <section aria-labelledby="compared" className="pt-xxl">
          <SectionTitle id="compared">How {name} compares</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            {name}&apos;s bar is bright and the rest are dimmed. Each title opens the full chart; each bar opens that provider&apos;s page.
          </p>
          <ByTrack id={id} r={r}>
            {(t) => <Charts id={id} t={t} />}
          </ByTrack>
        </section>

        {r.tracks.map((t) => (
          <TrackSection key={t.id} id={id} t={t} />
        ))}

        <section aria-labelledby="caveats" className="pt-xxl">
          <SectionTitle id="caveats">How to read these numbers</SectionTitle>
          <Card className="mt-l">
            <p className="max-w-[80ch] text-s text-pretty text-neutral-8">
              {formerly ? `${name} was called ${formerly} before its rebrand. ` : ""}
              {h ? `${fingerprintDate(id) === null ? "Our hardware probe found" : "The fingerprints of our runs show"} ${name} runs each sandbox as a ${h.runsAs.split(",")[0]}. ` : ""}
              We timed it through one SDK against {rivals}{" "}other sandbox providers: cold start, real agent work, everyday calls, pause and snapshots, bursts, machine speed, reliability and cost per task. Each result is a median with its p95 and 95% interval, on two tracks: the same {trackInfo["same-spec"].short}{" "}machine for every provider, and each provider&apos;s default machine.
            </p>
            <p className="mt-s max-w-[80ch] text-s text-pretty text-neutral-7">{disclosure}</p>
            <ul className="mt-m flex max-w-[80ch] list-disc flex-col gap-xs pl-m text-s text-pretty text-neutral-8">
              {[...providerNotes(id), ...caveats].map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="more" className="pt-xxl">
          <SectionTitle id="more">More results</SectionTitle>
          <Card className="mt-l">
            <ul className="grid gap-x-l gap-y-xs text-s sm:grid-cols-2 lg:grid-cols-3">
              {isAlternativesPage(id) ? (
                <li>
                  <a className={link} href={alternativesPath(id)}>
                    {name} alternatives, measured against {name}
                  </a>
                </li>
              ) : null}
              {comparisonsWith(id).map((c) => (
                <li key={c.slug}>
                  <a className={link} href={comparePath(c.slug)}>
                    {providerName(c.a)} vs {providerName(c.b)}, side by side
                  </a>
                </li>
              ))}
              {others.map((o) => (
                <li key={o}>
                  <a className={link} href={providerPath(o)}>
                    {providerName(o)} sandbox benchmark
                  </a>
                </li>
              ))}
              <li>
                <a className={link} href={providersPath}>
                  Every sandbox provider we benchmark
                </a>
              </li>
              <li>
                <a className={link} href="/">
                  Every provider on the same {trackInfo["same-spec"].short} machine
                </a>
              </li>
              <li>
                <a className={link} href="/?track=default">
                  Every provider on its default machine
                </a>
              </li>
              <RawData />
            </ul>
          </Card>
        </section>
      </main>

      <SiteFooter label={name} updated={lastModified(providerPath(id))} />
    </>
  );
}
