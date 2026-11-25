import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Lockup } from "@/components/brand";
import { SectionLinks, SectionMenu } from "@/components/section-nav";
import type { Sections } from "@/components/section-nav";
import { TrackSwitch } from "@/components/track-switch";
import { ctaAttributes } from "@/lib/cta";

export { ordinal } from "@/lib/format";

/** The pieces every SEO page (provider, comparison) shares, so they read as one site. */

export const link = "focus-ring -my-xs inline-block rounded-xs py-xs text-accent underline decoration-dotted underline-offset-4 hover:text-neutral-10";

export const Fact = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="flex flex-col gap-xxs">
    <dt className="text-s text-neutral-7">{term}</dt>
    <dd className="text-m text-neutral-10">{children}</dd>
  </div>
);

/** A section heading. `scroll-mt-24` keeps an anchored heading clear of the sticky header (84 px tall). */
export const SectionTitle = ({ id, children }: { id: string; children: ReactNode }) => (
  <h2 id={id} className="flex scroll-mt-24 items-center gap-s font-brand text-l font-medium">
    <span aria-hidden className="size-s shrink-0 bg-neutral-10" />
    {children}
  </h2>
);

/**
 * The home page's header on every other page: same width, padding and logo
 * position, so the logo never moves between pages. A page with sections of its
 * own passes them, and gets the home page's section bar on wide screens and its
 * section menu on narrower ones; `trackSwitch` adds the machine switch. A
 * compact "All results" link sits beside the logo, which also goes home.
 */
export function SiteHeader({ sections, trackSwitch = false }: { sections?: Sections; trackSwitch?: boolean }) {
  const hasSections = sections !== undefined && sections.length > 0;
  return (
    <header className="sticky top-0 z-30 bg-linear-to-b from-neutral-1 from-40% to-transparent px-m pt-s pb-l sm:px-l">
      {/* As on the home page: logo left, the section bar centred between two equal columns, controls right. */}
      <div className={`mx-auto flex max-w-[1440px] items-center gap-s ${hasSections ? "xl:grid xl:grid-cols-[1fr_minmax(0,auto)_1fr]" : ""}`}>
        <div className="flex shrink-0 items-center gap-s justify-self-start">
          <a href="/" className="surface focus-ring flex h-12 shrink-0 items-center px-m" aria-label="Sandbox bench, full results">
            <Lockup />
          </a>
          <a href="/" className="surface focus-ring hidden h-12 items-center gap-xxs px-m text-s text-neutral-8 hover:text-neutral-10 sm:flex">
            <ArrowLeft aria-hidden className="size-4" />
            All results
          </a>
        </div>
        {hasSections ? (
          <div className="hidden min-w-0 xl:block">
            <SectionLinks sections={sections} />
          </div>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-s justify-self-end">
          {trackSwitch ? (
            <div className="hidden md:block">
              <TrackSwitch size="small" />
            </div>
          ) : null}
          {hasSections ? (
            <div className="min-w-0 xl:hidden">
              <SectionMenu sections={sections} menuTop={trackSwitch ? <TrackSwitch /> : undefined} />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

const crumb = "focus-ring rounded-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10";

/** Sandbox bench / [parent /] current. `parent` is the section a page sits in, such as the providers index. */
export const Breadcrumb = ({ current, parent }: { current: string; parent?: { name: string; href: string } }) => (
  <nav aria-label="Breadcrumb" className="pt-l text-s text-neutral-7">
    <a className={crumb} href="/">
      Sandbox bench
    </a>{" "}
    /{" "}
    {parent ? (
      <>
        <a className={crumb} href={parent.href}>
          {parent.name}
        </a>{" "}
        /{" "}
      </>
    ) : null}
    <span aria-current="page">{current}</span>
  </nav>
);

/** `width` matches the page's main column: "wide" for pages laid out at the home page's 1440 px. */
export const SiteFooter = ({ label, updated, width = "narrow" }: { label: string; updated: string; width?: "narrow" | "wide" }) => (
  <footer className={`mx-auto mt-xxl px-m sm:px-l ${width === "wide" ? "max-w-[1440px]" : "max-w-[1100px]"}`}>
    <div className="flex flex-wrap gap-x-s gap-y-xxs py-xl text-s text-neutral-7">
      <span>
        Sandbox bench · {label} · updated {updated}
      </span>
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <a {...ctaAttributes({ cta: "github", placement: "page_footer" })} className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="https://github.com/opencoredev/sandbox-bench">
        Source on GitHub
      </a>
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <a className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="https://leodev.cv">
        By Leo (@leodev)
      </a>
    </div>
  </footer>
);

/** The raw-data links every page ends with. */
export const RawData = () => (
  <li>
    Raw data:{" "}
    <a className={link} href="/results.json">
      results.json
    </a>{" "}
    ·{" "}
    <a className={link} href="/results.md">
      results.md
    </a>{" "}
    ·{" "}
    <a className={link} href="/llms.txt">
      llms.txt
    </a>
  </li>
);
