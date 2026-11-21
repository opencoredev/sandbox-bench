import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
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
import type { Sections } from "@/components/section-nav";
import { Breadcrumb, link, ordinal, RawData, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { TrackSwitch } from "@/components/track-switch";
import { hasTaskCosts } from "@/lib/cost";
import { allocationNotes } from "@/lib/notes";
import { privateTitle } from "@/lib/private-benchmarks";
import { providerColor, providerFormerName, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { headlineRows, noCostReason, notCountedWhy, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { openGraphImages, twitterImages } from "@/lib/seo/social";
import { caveats, disclosure } from "@/lib/seo/copy";
import { alternativesPath, comparePath, comparisonsWith, forProvidersPath, isAlternativesPage, isProviderPage, lastModified, providerPages, providerPath, providersPath, site } from "@/lib/seo/pages";
import type { ProviderPageId } from "@/lib/seo/pages";
import { hasResults, trackIds, trackInfo, tracks } from "@/lib/data";
import type { Track, TrackId } from "@/lib/data";
import { fingerprintDate } from "@/lib/hardware";
import { faqJsonLd, highlights, machineOf, providerFaqs, providerNotes, providerResults, providerSummary, rankText, scorecard, taskText, verdict } from "@/lib/seo/provider";
import type { Faq, MetricRow, Placed, ProviderTrack, ScorecardEntry } from "@/lib/seo/provider";

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

/** One sentence of measured facts for the meta description: cold start, tool calls, and the real task's time and cost. */
const summary = (id: ProviderPageId) => providerSummary(id);

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

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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

/**
 * Fix and test's cost per 1,000 completed tasks, every costed provider, with
 * the home page chart's notes: who can't be the cheapest pick and why (such as
 * boxd's larger machine), and why the others have no cost.
 */
function TaskCostChart({ id, track }: { id: ProviderPageId; track: Track }) {
  const { costed, uncosted } = headlineRows(realistic, runTrackOf[track.id], "fix-and-test");
  if (costed.length === 0) return <ComingNext compact>No fix and test costs on this track yet.</ComingNext>;
  return (
    <>
      <Columns columns={taskCostColumns(costed, track.id)} label="Fix and test: cost per 1,000 completed tasks by provider" compact linked highlight={id} />
      <CompactNotes
        items={[
          ...costed.flatMap((r) => {
            const why = notCountedWhy(r);
            return why.length > 0 ? [{ mark: undefined, id: r.provider, note: `not counted as cheapest: ${why.join("; ")}` }] : [];
          }),
          ...uncosted.map((r) => ({ mark: undefined, id: r.provider, note: `no cost (${noCostReason(r)})` })),
        ]}
      />
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

/**
 * One term and its value, label left and value right, so a long value wraps under itself.
 * On the narrowest phones the value goes under its label, and an unbroken string such as an
 * error class name may break anywhere rather than run past the column.
 */
const Row = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="grid gap-x-m gap-y-xxs min-[420px]:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
    <dt className="text-s text-neutral-7">{term}</dt>
    <dd className="text-s text-pretty [overflow-wrap:anywhere] text-neutral-10">{children}</dd>
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
          <p className="mt-0.5 text-xs text-neutral-8 tabular-nums">
            <span className="font-medium text-neutral-10">{s.median}</span> · p95 {s.p95} · 95%: <span className="font-mono">{s.ci}</span>
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
                  <td className="py-xs pr-m font-medium whitespace-nowrap text-neutral-10 tabular-nums">{r.standing.median}</td>
                  <td className="py-xs pr-m whitespace-nowrap text-neutral-8 tabular-nums">{r.standing.p95}</td>
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

/** The provider's mark on a tile of its own, edged and faintly tinted in its colour. */
function LogoBadge({ id }: { id: ProviderPageId }) {
  const color = providerColor(id);
  const style: CSSProperties = {
    background: `color-mix(in oklch, ${color} 9%, var(--neutral-2))`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 38%, transparent)`,
  };
  return (
    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-m sm:size-14" style={style}>
      <ProviderLogo id={id} size={28} />
    </span>
  );
}

/** What the provider runs on, in a few short facts under the verdict. */
function MetaStrip({ r, t }: { r: ReturnType<typeof providerResults>; t: ProviderTrack }) {
  const h = r.hardware;
  const facts = [
    { term: "Machine", value: t.machine.measured ?? t.machine.asked },
    ...(h ? [{ term: "Runs as", value: h.runsAs.split(",")[0] ?? h.runsAs }] : []),
    ...(h ? [{ term: "CPU", value: h.chip }] : []),
    { term: "Region", value: t.ranIn ?? h?.region ?? "Not shown" },
    { term: "Billing", value: capital(t.billing) },
  ];
  return (
    <dl className="mt-l grid grid-cols-2 gap-x-l gap-y-s border-t border-neutral-3 pt-m sm:flex sm:flex-wrap sm:gap-x-xl">
      {facts.map((f) => (
        <div key={f.term} className="min-w-0">
          <dt className="text-xs text-neutral-7">{f.term}</dt>
          <dd className="mt-0.5 text-s text-pretty text-neutral-10">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Where a scorecard tile leads: the chart on this page where there is one, else the home page's chart on this track. */
function scoreHref(t: ProviderTrack, e: ScorecardEntry): { href: string; here: boolean } {
  switch (e.category.id) {
    case "speed":
      return { href: `#${t.id}-cold`, here: true };
    case "real-tasks":
      return { href: `#${t.id}-fix-and-test`, here: true };
    case "cost":
      return { href: `#${t.id}-fix-and-test-cost`, here: true };
    default:
      return { href: fullChart(t.id, e.category.link.section, e.category.link.tab ?? ""), here: false };
  }
}

/** One category's score, as the home page's Scores by category shows it, with the provider's rank. */
function ScoreTile({ id, t, e }: { id: ProviderPageId; t: ProviderTrack; e: ScorecardEntry }) {
  const { href, here } = scoreHref(t, e);
  const Icon = here ? ArrowDown : ArrowUpRight;
  const c = e.cell;
  const rank = e.rank ? <span className="text-s font-medium whitespace-nowrap text-neutral-10">{rankText(e.rank)}</span> : null;
  return (
    <a href={href} className="surface surface-link group focus-ring flex h-full flex-col p-m">
      <span className="flex items-start justify-between gap-xs">
        <span className="min-w-0">
          <span className="block text-s font-medium text-neutral-10">{e.category.label}</span>
          <span className="block text-xs text-neutral-7">{e.category.measure}</span>
        </span>
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
      </span>
      {c.kind === "scored" ? (
        <>
          <span className="mt-m flex items-baseline gap-xxs">
            <span className="font-brand text-xxl leading-none font-medium tabular-nums text-neutral-10">{c.score}</span>
            <span className="text-s text-neutral-7">/ 100</span>
          </span>
          <span className="mt-s block h-1.5 w-full overflow-hidden rounded-full bg-neutral-4">
            <span className="block h-full rounded-full" style={{ width: `${c.score}%`, backgroundColor: providerColor(id) }} />
          </span>
          <span className="mt-auto flex items-baseline justify-between gap-s pt-s">
            <span className="text-s tabular-nums text-neutral-8">{c.display} median</span>
            {rank}
          </span>
        </>
      ) : c.kind === "valued" ? (
        <>
          <span className="mt-m font-brand text-xxl leading-none font-medium tabular-nums text-neutral-10">{c.display}</span>
          <span className="mt-s block text-xs text-neutral-7">Per 1,000 completed tasks</span>
          <span className="mt-auto flex items-baseline justify-between gap-s pt-s">
            <span className="text-s text-neutral-8">{e.category.better === "lower" ? "Cheapest first" : "Highest first"}</span>
            {rank}
          </span>
        </>
      ) : (
        <>
          <span className="mt-m font-brand text-l leading-none font-medium text-neutral-8">{c.kind === "excluded" ? "Not counted" : "Not measured"}</span>
          <span className="mt-auto pt-s text-xs text-pretty text-neutral-7">{c.kind === "excluded" ? capital(c.why) : "No result on this track yet, not a 0."}</span>
        </>
      )}
    </a>
  );
}

function Scorecard({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  return (
    <ul className="grid grid-cols-1 gap-s min-[480px]:grid-cols-2 lg:grid-cols-4">
      {scorecard(t.id, id).map((e) => (
        <li key={e.category.id}>
          <ScoreTile id={id} t={t} e={e} />
        </li>
      ))}
    </ul>
  );
}

/** The machine, where it ran, what it costs and how often it failed, with the longer notes folded. */
function SpecCard({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  const name = providerName(id);
  // The longer explanations sit in the folded notes, so the list reads at a glance.
  const notes = [
    ...(t.machine.note ? [{ lead: "Machine", text: t.machine.note }] : []),
    ...(t.cost.kind === "priced" ? [{ lead: "Cost", text: `${t.cost.perTask} per task, ${t.cost.source} (${t.cost.basis.toLowerCase()}). ${taskText()}` }] : []),
    ...(t.pricePerHour !== null && (t.wholeMachine.counterfactual || t.priceNote)
      ? [{ lead: "List price", text: `${t.pricePerHour} per hour for this machine, compute only${t.wholeMachine.counterfactual ? "; a counterfactual, since it bills usage, not the whole machine" : ""}${t.priceNote ? `; ${t.priceNote}` : ""}.` }]
      : []),
  ];
  return (
    <Card className="flex h-full flex-col">
      <h3 className="mb-m text-m font-medium text-neutral-10">Machine, region and billing</h3>
      <dl className="flex flex-col gap-s">
        <Row term="Asked for">{t.machine.asked}</Row>
        <Row term="Measured inside">
          {t.machine.measured ?? "not measured"}
          {t.id === "same-spec" && !t.machine.equalSpec ? <span className="text-neutral-7"> (machine differs)</span> : ""}
        </Row>
        {t.ranIn ? <Row term="Ran in">{t.ranIn}</Row> : null}
        <Row term="Billing">{capital(t.billing)}</Row>
        <Row term="Quick task cost">
          {t.cost.kind === "priced" ? (
            <>
              <span className="tabular-nums">{t.cost.perThousand}</span> per 1,000 <span className="text-neutral-7">({t.cost.tag})</span>
            </>
          ) : (
            <span className="text-neutral-7">{t.cost.note}</span>
          )}
        </Row>
        {t.pricePerHour !== null ? (
          <Row term="List price">
            <span className="tabular-nums">{t.pricePerHour}</span> per hour for this machine, compute only
          </Row>
        ) : null}
        <Row term="Pause and resume">{capital(pauseLine(t))}</Row>
        <Row term="Success rate">
          <span className="tabular-nums">{t.reliability.successRate === null ? "n/a" : `${(t.reliability.successRate * 100).toFixed(2)}%`}</span>{" "}
          <span className="text-neutral-7">
            ({t.reliability.succeeded.toLocaleString("en-US")} of {t.reliability.attempts.toLocaleString("en-US")})
          </span>
        </Row>
        <Row term={`Failures counted against ${name}`}>
          {t.failures.length === 0 ? "None." : t.failures.map((f) => `${f.reason} (${f.count} ${f.count === 1 ? "failure" : "failures"})`).join("; ")}
        </Row>
      </dl>
      <Footnotes items={notes} />
    </Card>
  );
}

/** A ranked result in one line: the test on the left, its value and rank on the right. */
function PlacedItem({ p }: { p: Placed }) {
  return (
    <li className="flex items-baseline justify-between gap-m border-t border-neutral-3 py-xs first:border-t-0">
      <span className="min-w-0 text-s text-neutral-10">{p.label}</span>
      <span className="shrink-0 text-right text-s whitespace-nowrap">
        <span className="tabular-nums text-neutral-8">{p.value}</span>
        <span className="text-neutral-6"> · </span>
        <span className="font-medium text-neutral-10">{rankText(p.rank)}</span>
        {p.tied ? <span className="text-neutral-7">, tied</span> : null}
      </span>
    </li>
  );
}

/** The provider's three best and worst placings on this track, computed from its ranks, plus where to compare it next. */
function StandsOut({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  const name = providerName(id);
  const { leads, trails } = highlights(t, id);
  const compares = comparisonsWith(id);
  const block = (title: string, items: readonly Placed[], empty: string) => (
    <div>
      <h4 className="mb-xxs text-s font-medium text-neutral-8">{title}</h4>
      {items.length ? (
        <ul>
          {items.map((p) => (
            <PlacedItem key={p.id} p={p} />
          ))}
        </ul>
      ) : (
        <p className="py-xs text-s text-neutral-7">{empty}</p>
      )}
    </div>
  );
  return (
    <Card className="flex h-full flex-col">
      <h3 className="mb-xxs text-m font-medium text-neutral-10">Where {name} stands out and trails</h3>
      <p className="mb-m text-xs text-pretty text-neutral-7">Its best and worst ranks on this machine, from the tests below. Top and bottom third of the field only.</p>
      <div className="flex flex-col gap-m">
        {block("Stands out", leads, `No result in the top third on ${machineOf(t.id)}.`)}
        {block("Trails", trails, `No result in the bottom third on ${machineOf(t.id)}.`)}
      </div>
      <ul className="mt-auto flex flex-wrap gap-x-l gap-y-xxs border-t border-neutral-3 pt-s text-s">
        {isAlternativesPage(id) ? (
          <li>
            <a className={link} href={alternativesPath(id)}>
              {name} alternatives
            </a>
          </li>
        ) : null}
        {compares.map((c) => (
          <li key={c.slug}>
            <a className={link} href={comparePath(c.slug)}>
              {providerName(c.a)} vs {providerName(c.b)}
            </a>
          </li>
        ))}
        <li>
          <a className={link} href={t.id === "same-spec" ? "/#scores" : "/?track=default#scores"}>
            Every provider&apos;s scores
          </a>
        </li>
      </ul>
    </Card>
  );
}

/** Every test on one track, grouped as the home page groups them. */
function Results({ t }: { t: ProviderTrack }) {
  const href = t.id === "same-spec" ? "/" : "/?track=default";
  return (
    <>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
        {t.description} Runs from {t.run.start} to {t.run.end}, {t.providerCount} providers. See every provider side by side on the{" "}
        <a className={link} href={href}>
          full results
        </a>
        .
      </p>
      <Card>
        <div className="flex flex-col gap-xl">
          {t.groups.map((g) => (g.rows.length ? <MetricTable key={g.title} title={g.title} rows={g.rows} /> : null))}
        </div>
      </Card>
    </>
  );
}

function FaqList({ faqs }: { faqs: readonly Faq[] }) {
  return (
    <Card className="mt-l">
      <div className="flex flex-col">
        {faqs.map((f) => (
          <div key={f.question} className="border-t border-neutral-3 py-m first:border-t-0 first:pt-0 last:pb-0">
            <h3 className="text-m font-medium text-pretty text-neutral-10">{f.question}</h3>
            <p className="mt-xs max-w-[80ch] text-s text-pretty text-neutral-8">{f.answer}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// The switch appears only once both tracks have results, as on the home page.
const showSwitch = trackIds.every((tid) => hasResults(tracks[tid]));

/** The header's section links: id (the section title's), label. FAQ drops out where a provider has none. */
const sections = [
  ["scores", "Scores"],
  ["profile", "At a glance"],
  ["compared", "Compare"],
  ["results", "Every test"],
  ["faq", "FAQ"],
] as const satisfies Sections;

export default async function ProviderPage(props: Props) {
  const id = await pageId(props);
  const r = providerResults(id);
  const name = r.name;
  const formerly = providerFormerName(id);
  const url = `${site}${providerPath(id)}`;
  const others = providerPages.filter((p) => p !== id);
  const h = r.hardware;
  const rivals = Math.max(0, (r.tracks[0]?.providerCount ?? 1) - 1);
  const faqs = providerFaqs(id);

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
      ...(faqs.length ? [{ "@id": `${url}#faq`, ...faqJsonLd(faqs) }] : []),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader sections={faqs.length ? sections : sections.filter(([sid]) => sid !== "faq")} trackSwitch={showSwitch} />

      {/* The home page's width, so the page lines up under the logo. Hidden hover cards near a chart's edge are wider than a
          phone screen; clip them rather than let the page scroll sideways. */}
      <main className="mx-auto max-w-[1440px] overflow-x-clip px-m sm:px-l">
        <Breadcrumb current={name} parent={{ name: "Providers", href: providersPath }} />

        <header className="pt-l">
          <div className="flex min-w-0 items-center gap-m">
            <LogoBadge id={id} />
            <div className="min-w-0">
              <h1 className="font-brand text-xl font-medium text-balance sm:text-xxl">{name} sandbox benchmark</h1>
              <p className="mt-xxs text-s text-neutral-7">
                {formerly ? `Formerly ${formerly} · ` : ""}Ranked against {rivals} other sandbox providers
              </p>
            </div>
          </div>
          {/* From tablet width up the switch sits in the header, as on the home page. */}
          {showSwitch ? (
            <div className="mt-l md:hidden">
              <TrackSwitch />
            </div>
          ) : null}
          <div className="mt-l">
            <ByTrack id={id} r={r}>
              {(t) => <p className="max-w-[64ch] text-m text-pretty text-neutral-9 sm:text-l">{verdict(t, id)}</p>}
            </ByTrack>
          </div>
          <ByTrack id={id} r={r}>
            {(t) => <MetaStrip r={r} t={t} />}
          </ByTrack>
        </header>

        <section aria-labelledby="scores" className="pt-xxl">
          <SectionTitle id="scores">Scores by category</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            The same scores as the home page: 100 is the best provider, twice as slow scores 50. Cost is in dollars, cheapest first.
          </p>
          <ByTrack id={id} r={r}>
            {(t) => <Scorecard id={id} t={t} />}
          </ByTrack>
        </section>

        <section aria-labelledby="profile" className="pt-xxl">
          <SectionTitle id="profile">{name} at a glance</SectionTitle>
          <ByTrack id={id} r={r}>
            {(t) => (
              <div className="mt-l grid gap-m lg:grid-cols-2">
                <SpecCard id={id} t={t} />
                <StandsOut id={id} t={t} />
              </div>
            )}
          </ByTrack>
        </section>

        <section aria-labelledby="compared" className="pt-xxl">
          <SectionTitle id="compared">How {name} compares</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            {name}&apos;s bar is bright and the rest are dimmed. Each title opens the full chart; each bar or name opens that provider&apos;s page.
          </p>
          <ByTrack id={id} r={r}>
            {(t) => <Charts id={id} t={t} />}
          </ByTrack>
        </section>

        <section aria-labelledby="results" className="pt-xxl">
          <SectionTitle id="results">Every test</SectionTitle>
          <ByTrack id={id} r={r}>
            {(t) => <Results t={t} />}
          </ByTrack>
        </section>

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

        {faqs.length ? (
          <section aria-labelledby="faq" className="pt-xxl">
            <SectionTitle id="faq">Frequently asked questions</SectionTitle>
            <FaqList faqs={faqs} />
          </section>
        ) : null}

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
              <li>
                <a className={link} href={forProvidersPath}>
                  {privateTitle}
                </a>
              </li>
              <RawData />
            </ul>
          </Card>
        </section>
      </main>

      <SiteFooter label={name} updated={lastModified(providerPath(id))} width="wide" />
    </>
  );
}
