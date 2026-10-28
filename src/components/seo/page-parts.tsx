import type { ReactNode } from "react";

import { Lockup } from "@/components/brand";

/** The pieces every SEO page (provider, comparison) shares, so they read as one site. */

export const link = "focus-ring -my-xs inline-block rounded-xs py-xs text-accent underline decoration-dotted underline-offset-4 hover:text-neutral-10";

export function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export const Fact = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="flex flex-col gap-xxs">
    <dt className="text-s text-neutral-7">{term}</dt>
    <dd className="text-m text-neutral-10">{children}</dd>
  </div>
);

export const SectionTitle = ({ id, children }: { id: string; children: ReactNode }) => (
  <h2 id={id} className="flex items-center gap-s font-brand text-l font-medium">
    <span aria-hidden className="size-s shrink-0 bg-neutral-10" />
    {children}
  </h2>
);

export const SiteHeader = () => (
  <header className="sticky top-0 z-30 bg-linear-to-b from-neutral-1 from-40% to-transparent px-m pt-s pb-l sm:px-l">
    <div className="mx-auto flex max-w-[1100px] items-center gap-s">
      <a href="/" className="surface focus-ring flex h-12 shrink-0 items-center px-m" aria-label="Sandbox bench, full results">
        <Lockup />
      </a>
      <a href="/" className="surface focus-ring ml-auto flex h-12 items-center px-m text-s text-neutral-8 hover:text-neutral-10">
        Full results
      </a>
    </div>
  </header>
);

export const Breadcrumb = ({ current }: { current: string }) => (
  <nav aria-label="Breadcrumb" className="pt-l text-s text-neutral-7">
    <a className="focus-ring rounded-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="/">
      Sandbox bench
    </a>{" "}
    / <span aria-current="page">{current}</span>
  </nav>
);

export const SiteFooter = ({ label, updated }: { label: string; updated: string }) => (
  <footer className="mx-auto mt-xxl max-w-[1100px] px-m sm:px-l">
    <div className="flex flex-wrap gap-x-s gap-y-xxs py-xl text-s text-neutral-7">
      <span>
        Sandbox bench · {label} · updated {updated}
      </span>
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <a className="focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="https://github.com/opencoredev/sandbox-bench">
        Source on GitHub
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
