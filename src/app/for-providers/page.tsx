import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { independence, independenceTitle, privateOffer, privateSummary, privateTitle } from "@/lib/private-benchmarks";
import { forProvidersPath, lastModified, site } from "@/lib/seo/pages";
import { openGraphImages, twitterImages } from "@/lib/seo/social";
import { ctaAttributes } from "@/lib/cta";

const description = "Daily private runs of the Sandbox bench harness for sandbox providers, in the regions you choose: run logs, reruns, uptime checks, regression alerts, a shared Slack channel and cost checked against your bill.";

export const metadata: Metadata = {
  title: privateTitle,
  description,
  alternates: { canonical: forProvidersPath },
  openGraph: { title: privateTitle, description, type: "website", siteName: "Sandbox bench", url: `${site}${forProvidersPath}`, images: openGraphImages },
  twitter: { card: "summary_large_image", title: privateTitle, description, images: twitterImages },
};

export default function ForProvidersPage() {
  const url = `${site}${forProvidersPath}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: privateTitle,
        description,
        dateModified: lastModified(forProvidersPath),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sandbox bench", item: `${site}/` },
          { "@type": "ListItem", position: 2, name: "For providers", item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current="For providers" />
        <h1 className="pt-l font-brand text-xl font-medium text-balance sm:text-xxl">{privateTitle}</h1>
        <p className="mt-s max-w-[64ch] text-m text-pretty text-neutral-8">{privateSummary}</p>
        <p className="mt-m">
          <a href="#contact" {...ctaAttributes({ cta: "contact_jump", placement: "for_providers_hero" })} className="surface surface-link focus-ring inline-flex h-10 items-center px-m text-s font-medium text-neutral-10">
            Get in touch
          </a>
        </p>

        <section aria-labelledby="included" className="pt-xxl">
          <SectionTitle id="included">What you get</SectionTitle>
          <ul className="mt-l grid gap-m sm:grid-cols-2 lg:grid-cols-3">
            {privateOffer.map((item) => (
              <li key={item.title} className="surface flex flex-col gap-xxs p-m last:sm:col-span-2 sm:p-l lg:last:col-span-3">
                <h3 className="text-m font-medium text-neutral-10">{item.title}</h3>
                <p className="text-s text-pretty text-neutral-8">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="independence" className="pt-xxl">
          <SectionTitle id="independence">{independenceTitle}</SectionTitle>
          <Card className="mt-l">
            <div className="flex max-w-[72ch] gap-s">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-neutral-7" />
              <div className="flex flex-col gap-xs text-s text-pretty text-neutral-8">
                {independence.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="contact-title" id="contact" className="scroll-mt-24 pt-xxl">
          <SectionTitle id="contact-title">Get in touch</SectionTitle>
          <p className="mt-xs mb-l max-w-[64ch] text-m text-pretty text-neutral-8">Tell us which regions and tests matter to you. We&apos;ll reply with what a private run would cover.</p>
          {/* On the page, not in a card: the theme's inputs are drawn for the page background, and vanish on a card's fill. */}
          <div className="max-w-[860px]">
            <ContactForm />
          </div>
        </section>
      </main>

      <SiteFooter label="For providers" updated={lastModified(forProvidersPath)} />
    </>
  );
}
