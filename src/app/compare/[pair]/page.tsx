import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProviderLogo } from "@/components/provider-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, Fact, link, ordinal, RawData, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { trackInfo } from "@/lib/data";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { compareResults, costKindsDiffer, rowOf } from "@/lib/seo/compare";
import type { CompareRow, CompareTrack, Side } from "@/lib/seo/compare";
import { caveats, disclosure } from "@/lib/seo/copy";
import { comparePage, comparePages, comparePath, isProviderPage, lastModified, providerPath, site } from "@/lib/seo/pages";
import type { ComparePage } from "@/lib/seo/pages";
import { providerNotes, taskText } from "@/lib/seo/provider";
import type { ProviderTrack } from "@/lib/seo/provider";

export const dynamicParams = false;

export function generateStaticParams() {
  return comparePages.map((p) => ({ pair: p.slug }));
}

type Props = { params: Promise<{ pair: string }> };

async function pageOf(props: Props): Promise<ComparePage> {
  const { pair } = await props.params;
  const p = comparePage(pair);
  if (!p) notFound();
  return p;
}

const card = "Sandbox bench: cloud sandboxes for AI agents, measured";

const pairName = (p: ComparePage) => `${providerName(p.a)} vs ${providerName(p.b)}`;
const titleOf = (p: ComparePage) => `${pairName(p)}: sandbox benchmark, cold start, agent tasks and cost`;

const machineOf = (trackId: CompareTrack["id"]) => (trackId === "same-spec" ? `the same ${trackInfo["same-spec"].short} machine` : "each one's default machine");

/** "E2B is ahead on 9 of 22 tests, Daytona on 10, and 3 are tied": the track's tally in words. */
function tallyText(p: ComparePage, t: CompareTrack) {
  const { compared, a, b, tied } = t.tally;
  return `${providerName(p.a)} is ahead on ${a} of the ${compared} tests both finished, ${providerName(p.b)} on ${b}, and ${tied} ${tied === 1 ? "is" : "are"} tied within their 95% intervals`;
}

/** "cold start: E2B 0.79 s vs Daytona 0.60 s, Daytona ahead": one row in a few words. */
function rowText(p: ComparePage, r: CompareRow) {
  if (r.a.kind !== "ranked" || r.b.kind !== "ranked") return null;
  const v = r.verdict.kind === "ahead" ? `${providerName(r.verdict.leader)} ahead` : "tied";
  return `${r.label.toLowerCase()} ${providerName(p.a)} ${r.a.median} vs ${providerName(p.b)} ${r.b.median} (${v})`;
}

function summary(p: ComparePage) {
  const t = compareResults(p.a, p.b).tracks[0];
  if (!t) return `${pairName(p)} sandbox results from Sandbox bench.`;
  const cold = rowOf(t, "cold");
  const coldText = cold ? rowText(p, cold) : null;
  return `${pairName(p)} on ${machineOf(t.id)}: ${tallyText(p, t)}.${coldText ? ` Median ${coldText}.` : ""} Medians, p95s and 95% intervals on two tracks.`;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await pageOf(props);
  const title = titleOf(p);
  const description = summary(p);
  const path = comparePath(p.slug);
  return {
    title,
    description,
    alternates: { canonical: path },
    // The site's own card: a page that sets openGraph gets no image from the root segment.
    openGraph: { title, description, type: "article", siteName: "Sandbox bench", url: `${site}${path}`, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: card }] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: "/twitter-image", alt: card }] },
  };
}

function SideCell({ s }: { s: Side }) {
  switch (s.kind) {
    case "blank":
      return <span className="text-neutral-7">{s.why}</span>;
    case "ranked":
      return (
        <span>
          <span className="font-mono whitespace-nowrap text-neutral-10">{s.median}</span>{" "}
          {/* Phones put the rank on its own line so four columns fit. */}
          <span className="block text-xs whitespace-nowrap text-neutral-7 sm:inline">
            {ordinal(s.rank)} of {s.of}
          </span>
          <span className="block font-mono text-xs text-neutral-7">p95 {s.p95}</span>
          <span className="block font-mono text-xs text-neutral-7">95%: {s.ci}</span>
        </span>
      );
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

function VerdictCell({ r }: { r: CompareRow }) {
  const v = r.verdict;
  switch (v.kind) {
    case "ahead":
      return <span className="text-neutral-10">{providerName(v.leader)}</span>;
    case "tied":
      return <span className="text-neutral-8">
          Tied<span className="hidden sm:inline">, within the noise</span>
        </span>;
    case "not-compared":
      return <span className="text-neutral-7">
          <span className="sm:hidden">n/a</span>
          <span className="hidden sm:inline">Not compared</span>
        </span>;
    default: {
      const _exhaustive: never = v;
      return _exhaustive;
    }
  }
}

function CompareTable({ p, title, rows }: { p: ComparePage; title: string; rows: readonly CompareRow[] }) {
  return (
    <div>
      <h3 className="mb-xs font-medium text-neutral-10">{title}</h3>
      <div>
        <table className="w-full table-fixed text-left text-s">
          <thead className="text-neutral-7">
            <tr>
              <th scope="col" className="w-[28%] py-xxs pr-s font-normal sm:pr-m">Test</th>
              <th scope="col" className="w-[28%] py-xxs pr-s font-normal sm:w-[27%] sm:pr-m">{providerName(p.a)}</th>
              <th scope="col" className="w-[28%] py-xxs pr-s font-normal sm:w-[27%] sm:pr-m">{providerName(p.b)}</th>
              <th scope="col" className="py-xxs font-normal">Ahead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <th scope="row" className="py-xs pr-s font-normal break-words text-neutral-10 sm:pr-m">
                  {r.label} <span className="block text-xs text-neutral-7 sm:inline sm:text-s">({r.better} is better)</span>
                </th>
                <td className="py-xs pr-s break-words sm:pr-m">
                  <SideCell s={r.a} />
                </td>
                <td className="py-xs pr-s break-words sm:pr-m">
                  <SideCell s={r.b} />
                </td>
                <td className="py-xs">
                  <VerdictCell r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pauseText(t: ProviderTrack) {
  if (t.pause.supported && "split" in t.pause && t.pause.split) return `pause ${t.pause.split.pause.toFixed(2)} s, resume ${t.pause.split.resume.toFixed(2)} s (median of ${t.pause.split.n})`;
  if ("note" in t.pause && t.pause.note) return t.pause.note;
  return t.pause.supported ? "supported" : "not supported";
}

function SideFacts({ id, t }: { id: ProviderId; t: ProviderTrack }) {
  return (
    <div>
      <h3 className="mb-s flex items-center gap-xs font-medium text-neutral-10">
        <ProviderLogo id={id} size={20} />
        {providerName(id)}
      </h3>
      <dl className="grid gap-m sm:grid-cols-2">
        <Fact term="Measured inside">
          {t.machine.measured ?? "not measured"}
          {t.id === "same-spec" && !t.machine.equalSpec ? " (machine differs)" : ""}
        </Fact>
        <Fact term="Cost per 1,000 tasks">
          {t.cost.kind === "priced" ? (
            <>
              {t.cost.perThousand} <span className="text-neutral-7">({t.cost.label.toLowerCase()})</span>
            </>
          ) : (
            <span className="text-neutral-7">{t.cost.note}</span>
          )}
        </Fact>
        <Fact term="Success rate">
          {t.reliability.successRate === null ? "n/a" : `${(t.reliability.successRate * 100).toFixed(2)}%`}{" "}
          <span className="text-neutral-7">
            ({t.reliability.succeeded.toLocaleString("en-US")} of {t.reliability.attempts.toLocaleString("en-US")})
          </span>
        </Fact>
        <Fact term="Pause and resume">{pauseText(t)}</Fact>
      </dl>
      <ul className="mt-m flex flex-col gap-xxs text-s text-pretty text-neutral-7">
        <li>Asked for: {t.machine.asked}.</li>
        {t.machine.note ? <li>Machine: {t.machine.note}</li> : null}
        {t.ranIn ? <li>Ran in: {t.ranIn}.</li> : null}
        {t.cost.kind === "priced" ? (
          <li>
            Cost: {t.cost.perTask} per task, {t.cost.source} ({t.cost.basis.toLowerCase()}).
          </li>
        ) : null}
        <li>
          Failures counted against {providerName(id)}:{" "}
          {t.failures.length === 0 ? "none." : t.failures.map((f) => `${f.reason} (${f.count} ${f.count === 1 ? "test" : "tests"})`).join("; ")}
        </li>
      </ul>
    </div>
  );
}

function TrackSection({ p, t }: { p: ComparePage; t: CompareTrack }) {
  const href = t.id === "same-spec" ? "/" : "/?track=default";
  const { a, b } = t.sides;
  return (
    <section aria-labelledby={`track-${t.id}`} className="pt-xxl">
      <SectionTitle id={`track-${t.id}`}>
        {pairName(p)} on {machineOf(t.id)}
      </SectionTitle>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
        {t.description} Runs from {t.run.start} to {t.run.end}, {t.providerCount} providers. {tallyText(p, t)}. Ranks are out of every provider on this track; see them all on the{" "}
        <a className={link} href={href}>
          full results
        </a>
        .
      </p>
      <Card>
        <div className="grid gap-l md:grid-cols-2">
          <SideFacts id={p.a} t={a} />
          <SideFacts id={p.b} t={b} />
        </div>
        {costKindsDiffer(a, b) && a.cost.kind === "priced" && b.cost.kind === "priced" ? (
          <p className="mt-l max-w-[80ch] text-s text-pretty text-neutral-8">
            {providerName(p.a)}&apos;s cost is {a.cost.label.toLowerCase()} and {providerName(p.b)}&apos;s is {b.cost.label.toLowerCase()}, so the two aren&apos;t directly comparable. {taskText()}
          </p>
        ) : (
          <p className="mt-l max-w-[80ch] text-s text-pretty text-neutral-7">{taskText()}</p>
        )}
      </Card>
      <Card className="mt-m">
        <div className="flex flex-col gap-l">
          {t.groups.map((g) => (g.rows.length ? <CompareTable key={g.title} p={p} title={g.title} rows={g.rows} /> : null))}
        </div>
      </Card>
    </section>
  );
}

export default async function ComparePageView(props: Props) {
  const p = await pageOf(props);
  const r = compareResults(p.a, p.b);
  const path = comparePath(p.slug);
  const url = `${site}${path}`;
  const name = pairName(p);
  const notes = [...providerNotes(p.a), ...providerNotes(p.b)];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: titleOf(p),
        description: summary(p),
        dateModified: lastModified(path),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        about: [p.a, p.b].map((id) => ({ "@type": "SoftwareApplication", name: `${providerName(id)} sandbox`, applicationCategory: "DeveloperApplication" })),
        publisher: { "@type": "Organization", name: "opencoredev", url: "https://github.com/opencoredev" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current={name} />
        <div className="flex flex-col gap-s pt-s pb-l">
          <h1 className="flex flex-wrap items-center gap-s font-brand text-xl font-medium text-balance sm:text-xxl">
            <ProviderLogo id={p.a} size={32} />
            {r.names.a} vs {r.names.b}
            <ProviderLogo id={p.b} size={32} />
          </h1>
          <p className="max-w-[72ch] text-m text-pretty text-neutral-8">
            We timed {r.names.a} and {r.names.b} through one SDK, alongside {Math.max(0, (r.tracks[0]?.providerCount ?? 2) - 2)}{" "}other sandbox providers, on two tracks: the same {trackInfo["same-spec"].short}{" "}machine for every provider, and each provider&apos;s default machine. Every result is a median with its p95 and 95% interval. When the two medians sit inside each other&apos;s intervals, we call it a tie.
          </p>
          <p className="max-w-[72ch] text-s text-pretty text-neutral-7">{disclosure}</p>
        </div>

        {r.tracks.length ? (
          <div className="grid gap-m sm:grid-cols-2">
            {r.tracks.map((t) => {
              const lines = ["cold", "tool-replay"].flatMap((mid) => {
                const row = rowOf(t, mid);
                const text = row ? rowText(p, row) : null;
                return row && text ? [{ id: mid, text }] : [];
              });
              return (
                <Card key={t.id}>
                  <p className="text-s text-neutral-7">{t.label}</p>
                  <p className="mt-s text-m text-pretty text-neutral-10">{tallyText(p, t)}.</p>
                  <ul className="mt-s flex flex-col gap-xxs text-s text-neutral-8">
                    {lines.map((l) => (
                      <li key={l.id}>Median {l.text}.</li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        ) : null}

        {r.tracks.map((t) => (
          <TrackSection key={t.id} p={p} t={t} />
        ))}

        <section aria-labelledby="caveats" className="pt-xxl">
          <SectionTitle id="caveats">How to read these numbers</SectionTitle>
          <Card className="mt-l">
            <ul className="flex max-w-[80ch] list-disc flex-col gap-xs pl-m text-s text-pretty text-neutral-8">
              {[...notes, ...caveats].map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="more" className="pt-xxl">
          <SectionTitle id="more">More results</SectionTitle>
          <Card className="mt-l">
            <ul className="flex flex-col gap-xs text-s">
              {[p.a, p.b].flatMap((id) =>
                isProviderPage(id)
                  ? [
                      <li key={id}>
                        <a className={link} href={providerPath(id)}>
                          {providerName(id)} sandbox benchmark
                        </a>
                      </li>,
                    ]
                  : [],
              )}
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

      <SiteFooter label={name} updated={lastModified(path)} />
    </>
  );
}
