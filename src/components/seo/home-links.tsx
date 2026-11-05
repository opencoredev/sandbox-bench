import { providerName } from "@/lib/providers";
import { alternativesPages, alternativesPath, comparePages, comparePath, providersPath } from "@/lib/seo/pages";

const link = "focus-ring -my-xs inline-block rounded-xs py-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10";

/** The homepage footer's links into the provider, comparison and alternatives pages, from the page registry. */
const pages = [
  { href: providersPath, label: "Provider pages" },
  ...comparePages.map((p) => ({ href: comparePath(p.slug), label: `${providerName(p.a)} vs ${providerName(p.b)}` })),
  ...alternativesPages.map((id) => ({ href: alternativesPath(id), label: `${providerName(id)} alternatives` })),
];

export function HomeLinks() {
  return (
    <span>
      Compare providers:{" "}
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
