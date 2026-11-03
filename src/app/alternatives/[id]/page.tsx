import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProviderLogo } from "@/components/provider-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, Fact, link, ordinal, RawData, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { trackInfo } from "@/lib/data";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { alternativesResults, verdictCount } from "@/lib/seo/alternatives";
import type { Alternative, AlternativesTrack } from "@/lib/seo/alternatives";
import type { CompareRow } from "@/lib/seo/compare";
import { caveats, disclosure, untested } from "@/lib/seo/copy";
import { alternativesPages, alternativesPath, comparePath, comparePages, comparisonsWith, isAlternativesPage, isProviderPage, lastModified, providerPath, providersPath, site } from "@/lib/seo/pages";
import type { AlternativesPageId } from "@/lib/seo/pages";
import { pauseText, providerNotes, taskText } from "@/lib/seo/provider";
import type { ProviderTrack } from "@/lib/seo/provider";
import { openGraphImages, twitterImages } from "@/lib/seo/social";

export const dynamicParams = false;

export function generateStaticParams() {
  return alternativesPages.map((id) => ({ id }));
}

type Props = { params: Promise<{ id: string }> };

async function pageId(props: Props): Promise<AlternativesPageId> {
  const { id } = await props.params;
  if (!isAlternativesPage(id)) notFound();
  return id;
}

const machineOf = (trackId: AlternativesTrack["id"]) => (trackId === "same-spec" ? `the same ${trackInfo["same-spec"].short} machine` : "each one's default machine");

const titleOf = (id: AlternativesPageId) => {
  const n = alternativesResults(id)[0]?.alternatives.length ?? 0;
  return `${providerName(id)} alternatives: ${n} sandboxes measured against ${providerName(id)}`;
};

/** "4 start faster than E2B, 3 slower and 1 is tied": the cold start verdicts in words. */
function coldText(id: AlternativesPageId, t: AlternativesTrack) {
  const c = verdictCount(t, (a) => a.cold);
  if (c.tied === 0) return `${c.ahead} start faster than ${providerName(id)} and ${c.behind} slower, none tied`;
  return `${c.ahead} start faster than ${providerName(id)}, ${c.behind} slower and ${c.tied} ${c.tied === 1 ? "is" : "are"} tied`;
}

function summary(id: AlternativesPageId) {
  const t = alternativesResults(id)[0];
  if (!t) return `${providerName(id)} alternatives from Sandbox bench.`;
  return `${t.alternatives.length} ${providerName(id)} alternatives timed through one SDK on ${machineOf(t.id)}: ${coldText(id, t)}. Test-by-test tallies, cost per task and pause support, with 95% intervals.`;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const id = await pageId(props);
  const title = titleOf(id);
  const description = summary(id);
  const path = alternativesPath(id);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, type: "article", siteName: "Sandbox bench", url: `${site}${path}`, images: openGraphImages },
    twitter: { card: "summary_large_image", title, description, images: twitterImages },
  };
}

/** One test from the alternative's side: its median and rank, and how it compares with the target. */
function Versus({ target, row }: { target: ProviderId; row: CompareRow | null }) {
  if (!row) return <span className="text-neutral-7">n/a</span>;
  if (row.a.kind !== "ranked") return <span className="text-neutral-7">{row.a.why}</span>;
  const v = row.verdict;
  const against = (() => {
    switch (v.kind) {
      case "ahead":
        return v.leader === target ? `behind ${providerName(target)}` : `ahead of ${providerName(target)}`;
      case "tied":
        return `tied with ${providerName(target)}`;
      case "not-compared":
        return `${providerName(target)} has no result`;
      default: {
        const _exhaustive: never = v;
        return _exhaustive;
      }
    }
  })();
  return (
    <span>
      <span className="font-mono whitespace-nowrap">{row.a.median}</span>{" "}
      <span className="text-s whitespace-nowrap text-neutral-7">
        {ordinal(row.a.rank)} of {row.a.of}
      </span>
      <span className="block text-s text-neutral-8">{against}</span>
    </span>
  );
}

function Cost({ t }: { t: ProviderTrack }) {
  switch (t.cost.kind) {
    case "priced":
      return (
        <>
          <span className="font-mono">{t.cost.perThousand}</span> <span className="text-s text-neutral-7">({t.cost.label.toLowerCase()})</span>
        </>
      );
    case "none":
      return <span className="text-neutral-7">{t.cost.note}</span>;
    default: {
      const _exhaustive: never = t.cost;
      return _exhaustive;
    }
  }
}

function AlternativeCard({ target, t, a }: { target: AlternativesPageId; t: AlternativesTrack; a: Alternative }) {
  const side = a.pair.sides.a;
  const { compared, a: ahead, b: behind, tied } = a.pair.tally;
  const pair = comparePages.find((c) => (c.a === a.id && c.b === target) || (c.a === target && c.b === a.id));
  return (
    <Card>
      <h3 className="flex items-center gap-xs font-medium text-neutral-10">
        <ProviderLogo id={a.id} size={20} />
        {providerName(a.id)}
      </h3>
      <p className="mt-xs text-s text-pretty text-neutral-8">
        Ahead of {providerName(target)} on {ahead} of the {compared} tests both finished, behind on {behind}, tied on {tied}.
        {t.id === "same-spec" && !side.machine.equalSpec ? " Machine differs: it measured something other than the requested size inside." : ""}
      </p>
      <dl className="mt-m grid grid-cols-2 gap-m">
        <Fact term="Cold start, median">
          <Versus target={target} row={a.cold} />
        </Fact>
        <Fact term="Tool replay, median">
          <Versus target={target} row={a.tool} />
        </Fact>
        <Fact term="Cost per 1,000 tasks">
          <Cost t={side} />
        </Fact>
        <Fact term="Pause and resume">
          <span className="text-s">{pauseText(side)}</span>
        </Fact>
      </dl>
      <ul className="mt-m flex flex-wrap gap-x-m gap-y-xxs text-s">
        {isProviderPage(a.id) ? (
          <li>
            <a className={link} href={providerPath(a.id)}>
              Every {providerName(a.id)} result
            </a>
          </li>
        ) : null}
        {pair ? (
          <li>
            <a className={link} href={comparePath(pair.slug)}>
              {providerName(pair.a)} vs {providerName(pair.b)}, test by test
            </a>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

function TrackSection({ id, t }: { id: AlternativesPageId; t: AlternativesTrack }) {
  const name = providerName(id);
  const href = t.id === "same-spec" ? "/" : "/?track=default";
  const target = t.target;
  return (
    <section aria-labelledby={`track-${t.id}`} className="pt-xxl">
      <SectionTitle id={`track-${t.id}`}>
        {name} alternatives on {machineOf(t.id)}
      </SectionTitle>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
        {t.description} Runs from {t.run.start} to {t.run.end}, {t.providerCount} providers. Of the {t.alternatives.length}{" "}alternatives, {coldText(id, t)} within the 95% intervals. Ranks are out of every provider on this track; see them all on the{" "}
        <a className={link} href={href}>
          full results
        </a>
        .
      </p>
      <Card>
        <h3 className="mb-s flex items-center gap-xs font-medium text-neutral-10">
          <ProviderLogo id={id} size={20} />
          {name} on this track, for reference
        </h3>
        <dl className="grid gap-m sm:grid-cols-2 lg:grid-cols-4">
          <Fact term="Cold start, median">
            {(() => {
              const s = t.alternatives[0]?.cold?.b;
              return s && s.kind === "ranked" ? (
                <>
                  <span className="font-mono">{s.median}</span>{" "}
                  <span className="text-s text-neutral-7">
                    {ordinal(s.rank)} of {s.of}
                  </span>
                </>
              ) : (
                <span className="text-neutral-7">n/a</span>
              );
            })()}
          </Fact>
          <Fact term="Tool replay, median">
            {(() => {
              const s = t.alternatives[0]?.tool?.b;
              return s && s.kind === "ranked" ? (
                <>
                  <span className="font-mono">{s.median}</span>{" "}
                  <span className="text-s text-neutral-7">
                    {ordinal(s.rank)} of {s.of}
                  </span>
                </>
              ) : (
                <span className="text-neutral-7">n/a</span>
              );
            })()}
          </Fact>
          <Fact term="Cost per 1,000 tasks">
            <Cost t={target} />
          </Fact>
          <Fact term="Pause and resume">
            <span className="text-s">{pauseText(target)}</span>
          </Fact>
        </dl>
        <p className="mt-l max-w-[80ch] text-s text-pretty text-neutral-7">
          {taskText()}{" "}Cost kinds differ between providers (billed, metered, estimate) and aren&apos;t directly comparable.
        </p>
      </Card>
      <div className="mt-m grid gap-m md:grid-cols-2">
        {t.alternatives.map((a) => (
          <AlternativeCard key={a.id} target={id} t={t} a={a} />
        ))}
      </div>
    </section>
  );
}

export default async function AlternativesPage(props: Props) {
  const id = await pageId(props);
  const name = providerName(id);
  const tracks = alternativesResults(id);
  const landing = tracks[0];
  const path = alternativesPath(id);
  const url = `${site}${path}`;
  const heading = `${name} alternatives`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: titleOf(id),
        description: summary(id),
        dateModified: lastModified(path),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        about: { "@type": "SoftwareApplication", name: `${name} sandbox`, applicationCategory: "DeveloperApplication" },
        publisher: { "@type": "Organization", name: "opencoredev", url: "https://github.com/opencoredev" },
        author: { "@type": "Person", name: "Leo", alternateName: "@leodev", url: "https://leodev.cv" },
        mainEntity: {
          "@type": "ItemList",
          name: `${name} alternatives we benchmark`,
          itemListElement: (landing?.alternatives ?? []).map((a, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${providerName(a.id)} sandbox`,
            url: isProviderPage(a.id) ? `${site}${providerPath(a.id)}` : `${site}/`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: "Providers", item: `${site}${providersPath}` },
          { "@type": "ListItem", position: 3, name: heading, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current={heading} parent={{ name: "Providers", href: providersPath }} />
        <div className="flex flex-col gap-s pt-s pb-l">
          <h1 className="flex items-center gap-s font-brand text-xl font-medium text-balance sm:text-xxl">
            <ProviderLogo id={id} size={32} />
            {name} alternatives, measured
          </h1>
          <p className="max-w-[72ch] text-m text-pretty text-neutral-8">
            Looking for an alternative to {name}? We timed {name} and {landing?.alternatives.length ?? 0}{" "}other cloud sandbox products through one SDK, on two tracks: the same {trackInfo["same-spec"].short}{" "}machine for every provider, and each provider&apos;s default machine. Below, each alternative is set against {name} test by test: how many tests it is ahead on, behind on or tied, its cold start and tool replay next to {name}&apos;s, its cost per task and whether it can pause. Two medians inside each other&apos;s 95% intervals count as a tie, not a win.
          </p>
          <p className="max-w-[72ch] text-s text-pretty text-neutral-7">{disclosure}</p>
        </div>

        {tracks.map((t) => (
          <TrackSection key={t.id} id={id} t={t} />
        ))}

        {landing && landing.picks.length ? (
          <section aria-labelledby="picks" className="pt-xxl">
            <SectionTitle id="picks">Quick picks, {name} included</SectionTitle>
            <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">The results page&apos;s own picks on {machineOf(landing.id)}, by need. They follow the medians, so a close runner-up can be a tie.</p>
            <Card>
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
                    {landing.picks.map((q) => (
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
          </section>
        ) : null}

        <section aria-labelledby="untested" className="pt-xxl">
          <SectionTitle id="untested">Providers we haven&apos;t tested</SectionTitle>
          <Card className="mt-l">
            <p className="max-w-[80ch] text-s text-pretty text-neutral-8">
              Sandbox providers we haven&apos;t run through the bench yet include {`${untested.slice(0, -1).join(", ")} and ${untested.at(-1) ?? ""}`}, so this page has no numbers for them.
            </p>
          </Card>
        </section>

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
              <li>
                <a className={link} href={providerPath(id)}>
                  {name} sandbox benchmark
                </a>
              </li>
              {comparisonsWith(id).map((c) => (
                <li key={c.slug}>
                  <a className={link} href={comparePath(c.slug)}>
                    {providerName(c.a)} vs {providerName(c.b)}, side by side
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

      <SiteFooter label={heading} updated={lastModified(path)} />
    </>
  );
}
