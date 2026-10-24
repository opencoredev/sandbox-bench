import { providerColor, providerLabel } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * How a tagged name lays out. `flow` keeps the tag beside the short name and
 * drops it under only where there is no room for both. `centered` does the
 * same under a chart column, and keeps each line centred even when the tag is
 * wider than the column: flex centring spills the overflow evenly on both
 * sides, where centred inline text would spill it all to the right. `stacked`
 * always puts the tag underneath, for labels with no width of their own, like
 * a scatter point's.
 */
type Layout = "flow" | "centered" | "stacked";

const wrapper: Record<Layout, string> = {
  flow: "relative",
  centered: "relative inline-flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0.5 align-middle",
  stacked: "relative inline-flex flex-col items-start gap-y-0.5 align-middle",
};

/**
 * A provider's name as shown on the page. A tagged product renders its short
 * name and a small pill ("Upstash" + "Ephemeral"); screen readers hear the
 * full name. In `flow`, both are inline, not flex, so a wrapped tag follows
 * the parent's text-align: centred under a chart column, left in a table. The
 * space between them collapses at the wrap. The pill has no vertical margin,
 * so a one-line name is no taller than plain text, and sits on text-bottom,
 * which centres it on the name better than middle. Colour comes from the
 * surrounding text.
 */
export function ProviderName({ id, layout = "flow" }: { id: ProviderId; layout?: Layout }) {
  const label = providerLabel(id);
  switch (label.kind) {
    case "plain":
      return <>{label.name}</>;
    case "tagged":
      return (
        <span className={wrapper[layout]}>
          {label.short}{" "}
          <span
            className="inline-block rounded-full px-1.5 py-px align-text-bottom text-[11px] leading-[1.35] font-medium whitespace-nowrap"
            style={{ color: providerColor(id), background: `color-mix(in oklch, ${providerColor(id)} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${providerColor(id)} 45%, transparent)` }}
          >
            {label.tag}
          </span>
          {label.rest ? <span className="sr-only"> {label.rest}</span> : null}
        </span>
      );
    default: {
      const _exhaustive: never = label;
      return _exhaustive;
    }
  }
}
