import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { lastModified, site, updatePath, updatesPath } from "@/lib/seo/pages";
import { openGraphImages, twitterImages } from "@/lib/seo/social";
import { updateDate, updates } from "@/lib/updates";

const title = "Sandbox bench updates: new providers and changed results";
const description = "Every change to Sandbox bench, newest first: providers added, tests rerun and new charts, each with the results it changed.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: updatesPath },
  openGraph: { title, description, type: "website", siteName: "Sandbox bench", url: `${site}${updatesPath}`, images: openGraphImages },
  twitter: { card: "summary_large_image", title, description, images: twitterImages },
};

export default function UpdatesPage() {
  const url = `${site}${updatesPath}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: title,
        description,
        dateModified: lastModified(updatesPath),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        hasPart: updates.map((u) => ({ "@type": "Article", headline: u.title, datePublished: u.date, url: `${site}${updatePath(u.slug)}` })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: "Updates", item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current="Updates" />
        <h1 className="pt-l font-brand text-xl font-medium text-balance sm:text-xxl">Updates</h1>
        <p className="mt-s max-w-[72ch] text-m text-pretty text-neutral-8">Providers added, tests rerun and new charts, newest first. Each opens the results it changed.</p>

        <ol className="mt-xl flex flex-col gap-m">
          {updates.map((u) => (
            <li key={u.slug}>
              <a href={updatePath(u.slug)} className="surface surface-link group focus-ring flex flex-col gap-xxs p-m sm:p-l">
                <span className="text-xs font-medium text-accent">
                  Update · <time dateTime={u.date}>{updateDate(u)}</time>
                </span>
                <span className="flex items-start justify-between gap-s font-brand text-l font-medium">
                  <span className="group-hover:underline group-hover:decoration-neutral-6 group-hover:underline-offset-4">{u.title}</span>
                  <ArrowUpRight aria-hidden className="mt-1 size-5 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
                </span>
                <span className="max-w-[72ch] text-s text-pretty text-neutral-7">{u.text}</span>
              </a>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter label="Updates" updated={lastModified(updatesPath)} />
    </>
  );
}
