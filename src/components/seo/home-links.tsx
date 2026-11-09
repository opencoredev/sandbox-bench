import { providerName } from "@/lib/providers";
import { alternativesPages, alternativesPath, comparePages, comparePath, providerPages, providerPath, providersPath } from "@/lib/seo/pages";

const link = "focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10";

type PageLink = { href: string; label: string };

/** The homepage footer's links into the provider, comparison and alternatives pages, from the page registry. */
const comparePageLinks: readonly PageLink[] = [
  { href: providersPath, label: "Provider pages" },
  ...comparePages.map((p) => ({ href: comparePath(p.slug), label: `${providerName(p.a)} vs ${providerName(p.b)}` })),
  ...alternativesPages.map((id) => ({ href: alternativesPath(id), label: `${providerName(id)} alternatives` })),
];

/** One link per provider page, so every page is a click from the homepage. */
const providerPageLinks: readonly PageLink[] = providerPages.map((id) => ({ href: providerPath(id), label: providerName(id) }));

function LinkList({ heading, pages }: { heading: string; pages: readonly PageLink[] }) {
  return (
    <span>
      {heading}{" "}
      {pages.map((p, i) => (
        <span key={p.href}>
          {i > 0 ? " · " : ""}
          <a className={link} href={p.href}>
            {p.label}
          </a>
        </span>
      ))}
    </span>
  );
}

export function HomeLinks() {
  return (
    <>
      <LinkList heading="Compare providers:" pages={comparePageLinks} />
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <LinkList heading="Results by provider:" pages={providerPageLinks} />
    </>
  );
}
