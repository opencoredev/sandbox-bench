import type { Metadata } from "next";

import { ProviderLogo } from "@/components/provider-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, link, ordinal, RawData, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { agentData } from "@/lib/agent-data";
import { trackIds, trackInfo } from "@/lib/data";
import type { TrackId } from "@/lib/data";
import { providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { caveats, disclosure, untested } from "@/lib/seo/copy";
import { comparePages, comparePath, isProviderPage, lastModified, providerPages, providerPath, providersPath, site } from "@/lib/seo/pages";
import { headline, providerTrack, taskText } from "@/lib/seo/provider";
import type { ProviderTrack } from "@/lib/seo/provider";

const card = "Sandbox bench: cloud sandboxes for AI agents, measured";
const landing = trackIds[0];

/** Every provider with results on the landing track, in the order the published model lists them. */
const providerIds = (): ProviderId[] => agentData().tracks[landing].providers.map((p) => p.id);

const title = "Cloud sandbox providers for AI agents, benchmarked";

function description() {
  const ids = providerIds();
  const names = ids.map(providerName);
  const list = `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
  return `${ids.length} cloud sandbox products timed through one SDK: ${list}. Cold start, agent tasks, cost per task and reliability, with medians and 95% intervals.`;
}

export function generateMetadata(): Metadata {
  const d = description();
  return {
    title,
    description: d,
    alternates: { canonical: providersPath },
    // The site's own card: a page that sets openGraph gets no image from the root segment.
    openGraph: { title, description: d, type: "website", siteName: "Sandbox bench", url: `${site}${providersPath}`, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: card }] },
    twitter: { card: "summary_large_image", title, description: d, images: [{ url: "/twitter-image", alt: card }] },
  };
}

type Row = { id: ProviderId; tracks: Record<TrackId, ProviderTrack | null> };

const rows = (): Row[] => providerIds().map((id) => ({ id, tracks: { "same-spec": providerTrack("same-spec", id), default: providerTrack("default", id) } }));

/** Cold start median and rank on one track, or why there is none. */
function ColdCell({ t }: { t: ProviderTrack | null }) {
  const cold = t ? headline(t, "cold") : null;
  if (!t || !cold) return <span className="text-neutral-7">n/a</span>;
  return (
    <span>
      <span className="font-mono whitespace-nowrap text-neutral-10">{cold.median}</span>{" "}
      <span className="block text-xs text-neutral-7 sm:inline sm:whitespace-nowrap">
        {ordinal(cold.rank)} of {cold.of}
        {cold.tied ? ", tied" : ""}
      </span>
      {t.id === "same-spec" && !t.machine.equalSpec ? <span className="block text-xs text-neutral-7">machine differs</span> : null}
    </span>
  );
}

function CostCell({ t }: { t: ProviderTrack | null }) {
  if (!t) return <span className="text-neutral-7">n/a</span>;
  switch (t.cost.kind) {
    case "priced":
      return (
        <span>
          <span className="font-mono whitespace-nowrap text-neutral-10">{t.cost.perThousand}</span>{" "}
          <span className="block text-xs text-neutral-7 sm:inline">({t.cost.label.toLowerCase()})</span>
        </span>
      );
    case "none":
      return <span className="text-neutral-7">{t.cost.note}</span>;
    default: {
      const _exhaustive: never = t.cost;
      return _exhaustive;
    }
  }
}

function ProviderName({ id }: { id: ProviderId }) {
  const name = providerName(id);
  return (
    <span className="flex min-w-0 items-center gap-xs">
      <ProviderLogo id={id} size={16} />
      {isProviderPage(id) ? (
        <a className={link} href={providerPath(id)}>
          {name}
        </a>
      ) : (
        <span className="text-neutral-10">{name}</span>
      )}
    </span>
  );
}

export default function ProvidersPage() {
  const all = rows();
  const url = `${site}${providersPath}`;
  const sameSpec = trackInfo["same-spec"].short;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: title,
        description: description(),
        dateModified: lastModified(providersPath),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        publisher: { "@type": "Organization", name: "opencoredev", url: "https://github.com/opencoredev" },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: providerPages.map((id, i) => ({ "@type": "ListItem", position: i + 1, name: `${providerName(id)} sandbox benchmark`, url: `${site}${providerPath(id)}` })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: "Sandbox providers", item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current="Providers" />
        <div className="flex flex-col gap-s pt-s pb-l">
          <h1 className="font-brand text-xl font-medium text-balance sm:text-xxl">Sandbox providers we benchmark</h1>
          <p className="max-w-[72ch] text-m text-pretty text-neutral-8">
            Sandbox bench times {all.length}{" "}cloud sandbox products for AI agents through one SDK: cold start, real agent work, everyday calls, pause and snapshots, bursts, machine speed, reliability and cost per task. Every timed result is a median with its p95 and 95% interval, on two tracks: every provider asked for the same {sameSpec}{" "}machine (or its nearest size), and each provider&apos;s default machine. A row marked “machine differs” measured something else inside. Upstash appears twice because Box and Ephemeral Box are separate products.
          </p>
          <p className="max-w-[72ch] text-s text-pretty text-neutral-7">{disclosure}</p>
        </div>

        <section aria-labelledby="providers">
          <SectionTitle id="providers">Every provider at a glance</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            Cold start is the provider&apos;s own time from create() to the first command. {taskText()} Cost kinds differ, so compare them with care. Linked names have their own page with every test.
          </p>
          <Card>
            <table className="w-full table-fixed text-left text-s">
              <thead className="text-neutral-7">
                <tr>
                  <th scope="col" className="w-[36%] py-xxs pr-s font-normal sm:w-[30%] sm:pr-m">Provider</th>
                  <th scope="col" className="py-xxs pr-s font-normal sm:pr-m">Cold start, {sameSpec}</th>
                  <th scope="col" className="py-xxs pr-s font-normal sm:pr-m">Cold start, default</th>
                  <th scope="col" className="py-xxs font-normal">Cost per 1,000 tasks, {sameSpec}</th>
                </tr>
              </thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id} className="align-top">
                    <th scope="row" className="py-xs pr-s font-normal break-words sm:pr-m">
                      <ProviderName id={r.id} />
                    </th>
                    <td className="py-xs pr-s sm:pr-m">
                      <ColdCell t={r.tracks["same-spec"]} />
                    </td>
                    <td className="py-xs pr-s sm:pr-m">
                      <ColdCell t={r.tracks.default} />
                    </td>
                    <td className="py-xs">
                      <CostCell t={r.tracks["same-spec"]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section aria-labelledby="untested" className="pt-xxl">
          <SectionTitle id="untested">Not tested yet</SectionTitle>
          <Card className="mt-l">
            <p className="max-w-[80ch] text-s text-pretty text-neutral-8">
              {`${untested.slice(0, -1).join(", ")} and ${untested.at(-1) ?? ""}`}{" "}have not been run through the bench, so there are no numbers for them here.
            </p>
          </Card>
        </section>

        <section aria-labelledby="caveats" className="pt-xxl">
          <SectionTitle id="caveats">How to read these numbers</SectionTitle>
          <Card className="mt-l">
            <ul className="flex max-w-[80ch] list-disc flex-col gap-xs pl-m text-s text-pretty text-neutral-8">
              {caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="more" className="pt-xxl">
          <SectionTitle id="more">More results</SectionTitle>
          <Card className="mt-l">
            <ul className="flex flex-col gap-xs text-s">
              {providerPages.map((id) => (
                <li key={id}>
                  <a className={link} href={providerPath(id)}>
                    {providerName(id)} sandbox benchmark
                  </a>
                </li>
              ))}
              {comparePages.map((c) => (
                <li key={c.slug}>
                  <a className={link} href={comparePath(c.slug)}>
                    {providerName(c.a)} vs {providerName(c.b)}, side by side
                  </a>
                </li>
              ))}
              <li>
                <a className={link} href="/">
                  Every provider on the same {sameSpec} machine
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

      <SiteFooter label="Providers" updated={lastModified(providersPath)} />
    </>
  );
}
