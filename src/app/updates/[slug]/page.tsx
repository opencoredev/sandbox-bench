import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProviderLogo } from "@/components/provider-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, link, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { UpdateCharts } from "@/components/update-charts";
import { providerName } from "@/lib/providers";
import { lastModified, providerPath, site, updatePath, updatesPath } from "@/lib/seo/pages";
import { openGraphImages, twitterImages } from "@/lib/seo/social";
import { homeHref, updateDate, updates } from "@/lib/updates";
import type { UpdateSlug } from "@/lib/updates";

export const dynamicParams = false;

export function generateStaticParams() {
  return updates.map((u) => ({ slug: u.slug }));
}

type Props = { params: Promise<{ slug: string }> };
type ShippedUpdate = (typeof updates)[number];

async function updateOf(props: Props): Promise<ShippedUpdate> {
  const { slug } = await props.params;
  const u = updates.find((x) => x.slug === slug);
  if (!u) notFound();
  return u;
}

const titleOf = (u: ShippedUpdate) => `${u.title}: Sandbox bench update, ${updateDate(u)}`;
const pathOf = (u: { slug: UpdateSlug }) => updatePath(u.slug);

export async function generateMetadata(props: Props): Promise<Metadata> {
  const u = await updateOf(props);
  const title = titleOf(u);
  const description = u.text;
  const url = `${site}${pathOf(u)}`;
  return {
    title,
    description,
    alternates: { canonical: pathOf(u) },
    openGraph: { title, description, type: "article", siteName: "Sandbox bench", url, publishedTime: u.date, images: openGraphImages },
    twitter: { card: "summary_large_image", title, description, images: twitterImages },
  };
}

const action = "surface surface-link focus-ring group flex items-center justify-between gap-s px-m py-s text-m";

export default async function UpdatePage(props: Props) {
  const u = await updateOf(props);
  const url = `${site}${pathOf(u)}`;
  const provider = u.charts.kind === "provider" ? u.charts.provider : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": url,
        url,
        headline: u.title,
        description: u.text,
        datePublished: u.date,
        dateModified: lastModified(pathOf(u)),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        publisher: { "@type": "Organization", name: "opencoredev", url: "https://github.com/opencoredev" },
        author: { "@type": "Person", name: "Leo", alternateName: "@leodev", url: "https://leodev.cv" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: "Updates", item: `${site}${updatesPath}` },
          { "@type": "ListItem", position: 3, name: u.title, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current={u.title} parent={{ name: "Updates", href: updatesPath }} />
        <div className="flex flex-col gap-s pt-l">
          <p className="text-s font-medium text-accent">
            Update · <time dateTime={u.date}>{updateDate(u)}</time>
          </p>
          <h1 className="flex items-center gap-s font-brand text-xl font-medium text-balance sm:text-xxl">
            {provider ? <ProviderLogo id={provider} size={32} /> : null}
            {u.title}
          </h1>
          <div className="flex max-w-[72ch] flex-col gap-s text-m text-pretty text-neutral-8">
            {u.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          {provider ? (
            <p className="text-m">
              <a className={link} href={providerPath(provider)}>
                Every {providerName(provider)} result, with p95s and 95% intervals
              </a>
            </p>
          ) : null}
        </div>

        <p className="text-s text-neutral-7">The charts show the current standings, so their ranks can differ from this post&apos;s as providers join.</p>
        <UpdateCharts charts={u.charts} />

        <nav aria-label="More" className="grid gap-m pt-xxl sm:grid-cols-2">
          <a className={action} href={homeHref(u)}>
            <span>
              <span className="block text-s text-neutral-7">Every provider, on the home page</span>
              {u.home.label}
            </span>
            <ArrowUpRight aria-hidden className="size-5 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
          </a>
          <a className={action} href={updatesPath}>
            <span>
              <span className="block text-s text-neutral-7">What else changed</span>
              All updates
            </span>
            <ArrowUpRight aria-hidden className="size-5 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
          </a>
        </nav>
      </main>

      <SiteFooter label={`Update, ${updateDate(u)}`} updated={lastModified(pathOf(u))} />
    </>
  );
}
