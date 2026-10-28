import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProviderLogo } from "@/components/provider-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, Fact, link, ordinal, RawData, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { caveats, disclosure } from "@/lib/seo/copy";
import { comparePath, comparisonsWith, isProviderPage, lastModified, providerPages, providerPath, site } from "@/lib/seo/pages";
import type { ProviderPageId } from "@/lib/seo/pages";
import { trackInfo } from "@/lib/data";
import { headline, providerNotes, providerResults, taskText } from "@/lib/seo/provider";
import type { MetricRow, ProviderTrack } from "@/lib/seo/provider";

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

const card = "Sandbox bench: cloud sandboxes for AI agents, measured";

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
    cold ? `${cold.median} cold start (${ordinal(cold.rank)} of ${cold.of})` : null,
    tool ? `${tool.median} ${tool.label.toLowerCase()}` : null,
    t.cost.kind === "priced" ? `${t.cost.perThousand} per 1,000 tasks (${t.cost.label.toLowerCase()})` : null,
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
    // The site's own card: a page that sets openGraph gets no image from the root segment.
    openGraph: { title, description, type: "article", siteName: "Sandbox bench", url, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: card }] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: "/twitter-image", alt: card }] },
  };
}

const names = (ids: readonly ProviderId[]) => ids.map(providerName).join(", ");

function Standing({ row }: { row: MetricRow }) {
  const s = row.standing;
  switch (s.kind) {
    case "blank":
      return <span className="text-neutral-7">{s.why}</span>;
    case "ranked": {
      const tie = s.tiedWith.length ? `, tied with ${names(s.tiedWith)}` : "";
      const lead = s.leader ? ` · best: ${providerName(s.leader.id)} ${s.leader.median}` : "";
      return (
        <span>
          <span className="text-neutral-10">
            {ordinal(s.rank)} of {s.of}
          </span>
          <span className="text-neutral-7">
            {tie}
            {lead}
          </span>
        </span>
      );
    }
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

function MetricTable({ title, rows }: { title: string; rows: readonly MetricRow[] }) {
  return (
    <div>
      <h3 className="mb-xs font-medium text-neutral-10">{title}</h3>
      {/* Fixed columns from sm up so every group's table lines up; phones keep test, median and rank. */}
      <table className="w-full text-left text-s sm:table-fixed">
        <thead className="text-neutral-7">
          <tr>
            <th scope="col" className="py-xxs pr-m font-normal sm:w-[30%]">Test</th>
            <th scope="col" className="py-xxs pr-m font-normal sm:w-[11%]">Median</th>
            <th scope="col" className="hidden py-xxs pr-m font-normal sm:table-cell sm:w-[10%]">p95</th>
            <th scope="col" className="hidden py-xxs pr-m font-normal sm:table-cell sm:w-[18%]">95% interval</th>
            <th scope="col" className="py-xxs font-normal">Rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <th scope="row" className="py-xxs pr-m font-normal text-neutral-10">
                {r.label} <span className="text-neutral-7">({r.better} is better)</span>
              </th>
              {r.standing.kind === "ranked" ? (
                <>
                  <td className="py-xxs pr-m font-mono sm:whitespace-nowrap">
                    <span className="whitespace-nowrap">{r.standing.median}</span>
                    {/* Phones have no p95 or interval columns, so both sit under the median. */}
                    <span className="block text-xs text-neutral-7 sm:hidden">p95 {r.standing.p95}</span>
                    <span className="block text-xs text-neutral-7 sm:hidden">95%: {r.standing.ci}</span>
                  </td>
                  <td className="hidden py-xxs pr-m font-mono whitespace-nowrap text-neutral-8 sm:table-cell">{r.standing.p95}</td>
                  <td className="hidden py-xxs pr-m font-mono whitespace-nowrap text-neutral-8 sm:table-cell">{r.standing.ci}</td>
                </>
              ) : (
                <>
                  <td className="py-xxs pr-m text-neutral-7">n/a</td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden sm:table-cell" />
                </>
              )}
              <td className="py-xxs">
                <Standing row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrackSection({ id, t }: { id: ProviderPageId; t: ProviderTrack }) {
  const name = providerName(id);
  const heading = `${name} on ${machineOf(t.id)}`;
  const href = t.id === "same-spec" ? "/" : "/?track=default";
  return (
    <section aria-labelledby={`track-${t.id}`} className="pt-xxl">
      <SectionTitle id={`track-${t.id}`}>{heading}</SectionTitle>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
        {t.description} Runs from {t.run.start} to {t.run.end}, {t.providerCount} providers. See every provider side by side on the{" "}
        <a className={link} href={href}>
          full results
        </a>
        .
      </p>
      <Card>
        <dl className="grid gap-m sm:grid-cols-2 lg:grid-cols-4">
          <Fact term="Asked for">{t.machine.asked}</Fact>
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
        </dl>
        <ul className="mt-l flex max-w-[80ch] flex-col gap-xxs text-s text-pretty text-neutral-7">
          {t.machine.note ? <li>Machine: {t.machine.note}</li> : null}
          {t.ranIn ? <li>Ran in: {t.ranIn}.</li> : null}
          {t.cost.kind === "priced" ? (
            <li>
              Cost: {t.cost.perTask} per task, {t.cost.source} ({t.cost.basis.toLowerCase()}). {taskText()}
            </li>
          ) : null}
          {t.pricePerHourUsd !== null ? <li>List price: ${t.pricePerHourUsd} per hour for this machine, compute only.</li> : null}
          <li>
            Pause and resume:{" "}
            {t.pause.supported && "split" in t.pause && t.pause.split
              ? `supported; pause ${t.pause.split.pause.toFixed(2)} s and resume ${t.pause.split.resume.toFixed(2)} s median over ${t.pause.split.n} runs.`
              : "note" in t.pause && t.pause.note
                ? t.pause.note
                : t.pause.supported
                  ? "supported."
                  : "not supported."}
          </li>
          <li>
            Failures counted against {name}:{" "}
            {t.failures.length === 0 ? "none." : t.failures.map((f) => `${f.reason} (${f.count} ${f.count === 1 ? "test" : "tests"})`).join("; ")}
          </li>
        </ul>
      </Card>
      <Card className="mt-m">
        <div className="flex flex-col gap-l">
          {t.groups.map((g) => (g.rows.length ? <MetricTable key={g.title} title={g.title} rows={g.rows} /> : null))}
        </div>
      </Card>
      {t.picks.length ? (
        <Card className="mt-m">
          <h3 className="mb-xs font-medium text-neutral-10">Quick picks on this track, all providers</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-s">
              <thead className="text-neutral-7">
                <tr>
                  <th scope="col" className="py-xxs pr-m font-normal">Need</th>
                  <th scope="col" className="py-xxs pr-m font-normal">Pick</th>
                  <th scope="col" className="py-xxs font-normal">Runner-up</th>
                </tr>
              </thead>
              <tbody>
                {t.picks.map((q) => (
                  <tr key={q.need} className="align-top">
                    <th scope="row" className="py-xxs pr-m font-normal text-neutral-7">{q.need}</th>
                    <td className="py-xxs pr-m text-neutral-10">{q.pick}</td>
                    <td className="py-xxs text-neutral-8">{q.runnerUp}</td>
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

export default async function ProviderPage(props: Props) {
  const id = await pageId(props);
  const r = providerResults(id);
  const name = r.name;
  const url = `${site}${providerPath(id)}`;
  const others = providerPages.filter((p) => p !== id);
  const h = r.hardware;
  const glance = r.tracks.flatMap((t) => {
    const cold = headline(t, "cold");
    return cold ? [{ track: t, cold }] : [];
  });

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
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: `${name} sandbox benchmark`, item: url },
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
          <h1 className="flex items-center gap-s font-brand text-xl font-medium text-balance sm:text-xxl">
            <ProviderLogo id={id} size={32} />
            {name} sandbox benchmark
          </h1>
          <p className="max-w-[72ch] text-m text-pretty text-neutral-8">
            {h ? `Our hardware probe found ${name} runs each sandbox as a ${h.runsAs.split(",")[0]}. ` : ""}
            We timed it through one SDK against {Math.max(0, (r.tracks[0]?.providerCount ?? 1) - 1)}{" "}other sandbox providers: cold start, real agent work, everyday calls, pause and snapshots, bursts, machine speed, reliability and cost per task. Each result is a median with its p95 and 95% interval, on two tracks: the same {trackInfo["same-spec"].short}{" "}machine for every provider, and each provider&apos;s default machine.
          </p>
          <p className="max-w-[72ch] text-s text-pretty text-neutral-7">{disclosure}</p>
        </div>

        {glance.length ? (
          <div className="grid gap-m sm:grid-cols-2">
            {glance.map(({ track: t, cold }) => {
              const tool = headline(t, "tool-replay");
              return (
                <Card key={t.id}>
                  <p className="text-s text-neutral-7">{t.label}</p>
                  <dl className="mt-s grid grid-cols-2 gap-m">
                    <Fact term="Cold start, median">
                      <span className="font-mono">{cold.median}</span>{" "}
                      <span className="text-s text-neutral-7">
                        {ordinal(cold.rank)} of {cold.of}
                        {cold.tied ? ", tied" : ""}
                      </span>
                    </Fact>
                    {tool ? (
                      <Fact term="Tool replay, median">
                        <span className="font-mono">{tool.median}</span>{" "}
                        <span className="text-s text-neutral-7">
                          {ordinal(tool.rank)} of {tool.of}
                          {tool.tied ? ", tied" : ""}
                        </span>
                      </Fact>
                    ) : null}
                  </dl>
                </Card>
              );
            })}
          </div>
        ) : null}

        {r.tracks.map((t) => (
          <TrackSection key={t.id} id={id} t={t} />
        ))}

        <section aria-labelledby="caveats" className="pt-xxl">
          <SectionTitle id="caveats">How to read these numbers</SectionTitle>
          <Card className="mt-l">
            <ul className="flex max-w-[80ch] list-disc flex-col gap-xs pl-m text-s text-pretty text-neutral-8">
              {[...providerNotes(id), ...caveats].map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="more" className="pt-xxl">
          <SectionTitle id="more">More results</SectionTitle>
          <Card className="mt-l">
            <ul className="flex flex-col gap-xs text-s">
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
