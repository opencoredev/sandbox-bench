import type { Metadata } from "next";

import { PriceCalculator, ProviderCell, RealTaskCost } from "@/components/price-calculator";
import type { RunTrackId, TaskCostRow, TaskProfile } from "@/components/price-calculator";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb, link, SectionTitle, SiteFooter, SiteHeader } from "@/components/seo/page-parts";
import { Card } from "@/components/tabs";
import { costKinds } from "@/lib/cost";
import { eurUsd } from "@/lib/fx";
import { defaultInputs, estimateAll, formatUsd, sizeText, workloadOf } from "@/lib/pricing/calc";
import { basisOpen, priceTableSource, rateCards } from "@/lib/pricing/rates";
import type { RateCard } from "@/lib/pricing/rates";
import type { ProviderId } from "@/lib/providers";
import { isPreemptible, providerName } from "@/lib/providers";
import { flagsOf, headlineRows } from "@/lib/realistic";
import type { Costed } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { comparePages, comparePath, lastModified, pricingPath, providerPages, providerPath, providersPath, site } from "@/lib/seo/pages";
import { openGraphImages, twitterImages } from "@/lib/seo/social";

const title = "Sandbox pricing calculator: E2B, Daytona, Modal, Vercel";
const description = `A month's bill on ${rateCards.length} cloud sandboxes for AI agents at list price, with each one's billing rules and what the estimate assumes, and what a real coding task cost on each when we ran it.`;

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: pricingPath },
  openGraph: { title, description, type: "website", siteName: "Sandbox bench", url: `${site}${pricingPath}`, images: openGraphImages },
  twitter: { card: "summary_large_image", title, description, images: twitterImages },
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const host = (url: string) => new URL(url).host.replace(/^www\./, "");
/** A list price as the provider writes it: four significant figures at most, so $0.141912 reads $0.1419. */
const money = (v: number, currency: RateCard["currency"]) => `${currency === "EUR" ? "€" : "$"}${Number(v.toPrecision(4))}`;

/** The list price in words: "$0.0504 per vCPU-hour and $0.0162 per GiB-hour of memory". */
function priceText(card: RateCard) {
  switch (card.rates.kind) {
    case "resource":
      return `${money(card.rates.cpuHour, card.currency)} per ${card.cpuUnit} per hour and ${money(card.rates.memoryGiBHour, card.currency)} per GiB of memory per hour`;
    case "size":
      return card.rates.sizes.map((s) => `${money(s.hourly, card.currency)} an hour for ${sizeText(s)}`).join(", ");
    default: {
      const _exhaustive: never = card.rates;
      return _exhaustive;
    }
  }
}

const idleText = {
  full: "Billed for the whole size while it runs, busy or idle",
  memory: "CPU billed only while busy; memory billed while it runs",
  none: "CPU billed only while busy; no memory fee listed",
} as const satisfies Record<RateCard["idle"], string>;

const minimumText = (c: RateCard) => {
  const parts = [c.minimumSeconds > 0 ? `${c.minimumSeconds / 60}-minute minimum` : null, c.perSandbox > 0 ? `${money(c.perSandbox * 1_000_000, c.currency)} per million sandboxes created` : null].filter((x) => x !== null);
  return parts.length > 0 ? parts.join(", ") : "None listed";
};

/** The caveats a real-task row carries on the homepage's charts that change how it compares: size, list-price parts, spot capacity. */
function rowNotes(r: Costed): string[] {
  const size = r.track === "same-machine" ? flagsOf(r).flatMap((f) => (f.short === "wrong size" ? [f.text] : [])) : [];
  const listed = r.estimatedPart ? [`includes ${formatUsd(r.estimatedPart.usd).replace(/^under /, "less than ")} per task for ${r.estimatedPart.labels.join(" and ")}`] : [];
  const spot = isPreemptible(r.provider) ? ["spot capacity, which the provider can stop before the task ends"] : [];
  return [...size, ...listed, ...spot];
}

/** Measured cost per completed real task for one machine track and task, from the real-task runs. */
function taskScenario(track: RunTrackId, profile: TaskProfile) {
  const { costed, uncosted } = headlineRows(realistic, track, profile);
  return {
    rows: costed.map((r): TaskCostRow => ({ id: r.provider, usdPerTask: r.cost.usdPerCompleted, how: costKinds[r.cost.kind].label, completed: r.completed, attempts: r.attempts, notes: rowNotes(r) })),
    missing: uncosted.map((r): ProviderId => r.provider),
  };
}

function taskRows() {
  const all = {
    "same-machine": { "fix-and-test": taskScenario("same-machine", "fix-and-test"), build: taskScenario("same-machine", "build") },
    default: { "fix-and-test": taskScenario("default", "fix-and-test"), build: taskScenario("default", "build") },
  } satisfies Record<RunTrackId, Record<TaskProfile, ReturnType<typeof taskScenario>>>;
  const pick = <K extends "rows" | "missing">(k: K) => ({
    "same-machine": { "fix-and-test": all["same-machine"]["fix-and-test"][k], build: all["same-machine"].build[k] },
    default: { "fix-and-test": all.default["fix-and-test"][k], build: all.default.build[k] },
  });
  return { rows: pick("rows"), missing: pick("missing") };
}

const cardOf = (id: ProviderId) => rateCards.find((c) => c.id === id);

export default function SandboxPricingPage() {
  const w = workloadOf(defaultInputs);
  const priced = estimateAll(rateCards, w, eurUsd.rate).flatMap((e) => (e.kind === "priced" ? [e] : []));
  const cheapest = priced[0];
  const dearest = priced.at(-1);
  const { rows, missing } = taskRows();
  const fix = rows["same-machine"]["fix-and-test"];
  const fixCheap = fix[0];
  const fixDear = fix.at(-1);
  const scenario = `${w.sandboxes.toLocaleString("en-US")} sandboxes a month, ${w.activeMinutes} minutes each on ${sizeText(w)}`;
  const named = (["e2b", "daytona", "modal", "vercel"] as const).flatMap((id) => {
    const card = cardOf(id);
    const e = priced.find((x) => x.id === id);
    return card && e ? [{ card, e }] : [];
  });

  const faqs: { q: string; a: string }[] = [
    {
      q: "Which cloud sandbox is cheapest?",
      a: `It depends on size and on how long sandboxes sit idle. At list price, ${scenario} costs ${cheapest ? `${formatUsd(cheapest.monthlyUsd)} on ${providerName(cheapest.id)}` : "nothing we can price"}${dearest && dearest !== cheapest ? ` and ${formatUsd(dearest.monthlyUsd)} on ${providerName(dearest.id)}` : ""}. Measured on a real fix-and-test task on a 4 vCPU, 8 GB machine, ${fixCheap ? `${providerName(fixCheap.id)} cost ${formatUsd(fixCheap.usdPerTask)} per completed task` : "no provider has a measured cost"}${fixDear && fixDear !== fixCheap ? ` and ${providerName(fixDear.id)} ${formatUsd(fixDear.usdPerTask)}` : ""}.`,
    },
    ...named.map(({ card, e }) => ({
      q: `How much does ${providerName(card.id)} cost?`,
      a: `${providerName(card.id)} lists ${priceText(card)}, billed ${card.billed} (${host(card.source)}, checked ${day(card.checked)}). A ${sizeText(e.size)} sandbox comes to ${formatUsd(e.hourlyUsd)} an hour${card.minimumSeconds > 0 ? `, with a ${card.minimumSeconds / 60}-minute minimum` : ""}.${card.assumed.length > 0 ? ` This assumes ${card.assumed.join("; ")}.` : ""}${card.notIncluded.length > 0 ? ` Not included here: ${card.notIncluded.join("; ")}.` : ""}${card.plan ? ` ${card.plan}.` : ""}`,
    })),
    {
      q: "How does the calculator work it out?",
      a: "Each sandbox's busy minutes bill its whole size at the provider's list price. Idle minutes bill whatever the provider charges an idle sandbox: the whole size for most, memory only where CPU is billed on use. Minimum charges and rounding apply per sandbox. Where a provider sells fixed sizes, the smallest one that fits is priced. Where the price table leaves something open, such as rounding or whether a rate applies to the whole size, the estimate says what it assumes beside that provider. Euro prices are converted at the ECB rate. Modal counts a CPU as a physical core; it is priced one per vCPU entered, as the benchmark does. Disk, data transfer, plan fees and credits are left out.",
    },
    {
      q: "Why can a real task cost more or less than the list price suggests?",
      a: "A task's cost is its time in the sandbox times the price, so a provider that runs the work faster can cost less at a higher rate. The measured costs also count setup, failed attempts and, where a provider bills them, disk and data transfer, taken from its bill or usage records where it gives them.",
    },
  ];

  const url = `${site}${pricingPath}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#calculator`,
        name: "Sandbox pricing calculator",
        url,
        description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
        dateModified: lastModified(pricingPath),
        isPartOf: { "@type": "WebSite", name: "Sandbox bench", url: `${site}/` },
        author: { "@type": "Person", name: "Leo", alternateName: "@leodev", url: "https://leodev.cv" },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />
      <main className="mx-auto max-w-[1100px] px-m sm:px-l">
        <Breadcrumb current="Sandbox pricing calculator" parent={{ name: "Providers", href: providersPath }} />
        <h1 className="mt-s font-brand text-xl font-medium text-balance sm:text-xxl">Sandbox pricing calculator</h1>
        <p className="mt-s max-w-[72ch] text-l text-pretty text-neutral-10">
          A month&apos;s bill on {rateCards.length}{" "}cloud sandboxes for AI agents, from each one&apos;s published prices, and what a real coding task cost on each when we ran it.
        </p>
        {cheapest && dearest ? (
          <p className="mt-s max-w-[72ch] text-m text-pretty text-neutral-8">
            For {scenario}, list prices run from {formatUsd(cheapest.monthlyUsd)} on {providerName(cheapest.id)} to {formatUsd(dearest.monthlyUsd)} on {providerName(dearest.id)}. Change the numbers to match your agent.
          </p>
        ) : null}

        <section aria-labelledby="monthly" className="pt-xxl">
          <SectionTitle id="monthly">Monthly bill at list price</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            Busy time bills the whole size. Idle time bills what each provider charges an idle sandbox. Disk, data transfer, plan fees and credits are left out; each provider&apos;s are listed under{" "}
            <a className={link} href="#rates">
              How each provider bills
            </a>
            .
          </p>
          <PriceCalculator cards={rateCards} eurUsd={eurUsd.rate} />
        </section>

        <section aria-labelledby="real-task" className="pt-xxl">
          <SectionTitle id="real-task">What a real task costs</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            List prices don&apos;t say how long the work takes. These are measured: two real coding jobs, a Vue bug fixed and its tests run, and a Jitsi Meet production build, each in a fresh sandbox from create to confirmed delete, {realistic.coverage.headline.attempts} runs per provider. The cost per completed task counts setup and failed attempts, from each provider&apos;s bill or usage records where it gives them, otherwise our measured time at list price. The{" "}
            <a className={link} href="/#task-cost">
              full results
            </a>{" "}
            have the charts and notes.
          </p>
          <RealTaskCost rows={rows} missing={missing} />
        </section>

        <section aria-labelledby="rates" className="pt-xxl">
          <SectionTitle id="rates">How each provider bills</SectionTitle>
          <p className="mt-xs mb-l max-w-[72ch] text-m text-pretty text-neutral-8">
            The prices the calculator uses, from the benchmark&apos;s own price table,{" "}
            <a className={link} href={priceTableSource.url}>
              {priceTableSource.path}
            </a>{" "}
            as of {day(priceTableSource.date)}, with the day each provider&apos;s pricing page was read. Euro prices convert at {eurUsd.rate} dollars per euro (ECB, {eurUsd.date}).
          </p>
          <Card>
            <ul>
              {rateCards.map((c) => (
                <li key={c.id} className="grid gap-x-m gap-y-xs border-t border-neutral-3 py-m first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                  <ProviderCell id={c.id} />
                  <dl className="grid gap-x-m gap-y-xs text-s sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="sr-only">List price</dt>
                      <dd className="text-pretty text-neutral-10">
                        {priceText(c)}, billed {c.billed}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-7">Idle sandbox</dt>
                      <dd className="text-pretty text-neutral-8">
                        {idleText[c.idle]}
                        {c.assumed.includes(basisOpen) ? " (assumed: whether it bills the whole size isn't confirmed)" : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-7">Minimum charge</dt>
                      <dd className="text-pretty text-neutral-8">{minimumText(c)}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-7">Plan fee and free tier</dt>
                      <dd className="text-pretty text-neutral-8">{c.plan ?? "Not in our price data; see its pricing page"}</dd>
                    </div>
                    {c.assumed.length > 0 ? (
                      <div className="sm:col-span-2">
                        <dt className="text-neutral-7">Assumed</dt>
                        <dd className="text-pretty text-neutral-8">{c.assumed.join("; ")}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-neutral-7">Not in the estimate</dt>
                      <dd className="text-pretty text-neutral-8">{c.notIncluded.length > 0 ? c.notIncluded.join("; ") : "Nothing else listed"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="sr-only">Source</dt>
                      <dd className="text-neutral-7">
                        <a className={link} href={c.source}>
                          {host(c.source)}
                        </a>
                        , checked {day(c.checked)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="faq" className="pt-xxl">
          <SectionTitle id="faq">Questions</SectionTitle>
          <div className="mt-l flex flex-col gap-l">
            {faqs.map((f) => (
              <div key={f.q} className="max-w-[72ch]">
                <h3 className="text-m font-medium text-neutral-10">{f.q}</h3>
                <p className="mt-xxs text-m text-pretty text-neutral-8">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="more" className="pt-xxl">
          <SectionTitle id="more">Speed and cost, measured</SectionTitle>
          <ul className="mt-m flex flex-col gap-xs text-m">
            <li>
              <a className={link} href="/">
                Full benchmark results
              </a>
              : cold start, real tasks, tool calls, bursts and cost per task on every provider.
            </li>
            {comparePages.map((p) => (
              <li key={p.slug}>
                <a className={link} href={comparePath(p.slug)}>
                  {providerName(p.a)} vs {providerName(p.b)}
                </a>
                , test by test
              </li>
            ))}
            <li>
              Each provider&apos;s results:{" "}
              {providerPages.map((id, i) => (
                <span key={id}>
                  {i > 0 ? " · " : ""}
                  <a className={link} href={providerPath(id)}>
                    {providerName(id)}
                  </a>
                </span>
              ))}
            </li>
          </ul>
        </section>
      </main>
      <SiteFooter label="Sandbox pricing calculator" updated={lastModified(pricingPath)} />
    </>
  );
}
