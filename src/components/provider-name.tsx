import { providerLabel } from "@/lib/providers";
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
  centered: "relative inline-flex max-w-full flex-wrap items-center justify-center gap-x-xxs gap-y-0.5 align-middle",
  stacked: "relative inline-flex flex-col items-start gap-y-0.5 align-middle",
};

/**
 * A provider's name as shown on the page. A tagged product renders its short
 * name and its tag ("Upstash" + "Ephemeral") in the surrounding weight and
 * colour, no pill, so it reads as one name in a chart label, bold and bright
 * together when highlighted; screen readers hear the full name. In `flow`, both are inline, not flex, so a wrapped tag follows
 * the parent's text-align: centred under a chart column, left in a table. The
 * space between them collapses at the wrap. The name's colour comes from the
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
          {label.short} <span className="whitespace-nowrap">{label.tag}</span>
          {label.rest ? <span className="sr-only"> {label.rest}</span> : null}
        </span>
      );
    default: {
      const _exhaustive: never = label;
      return _exhaustive;
    }
  }
}
