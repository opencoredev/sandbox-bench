import { providerColor, providerLabel } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * A provider's name as shown on the page. A tagged product renders its short
 * name and a small pill ("Upstash" + "Ephemeral"); screen readers hear the
 * full name. The tag drops under the short name only where a column is too
 * narrow for both. Both are inline, not flex, so a wrapped tag follows the
 * parent's text-align: centred under a chart column, left in a table. The
 * space between them collapses at the wrap. The pill has no vertical margin,
 * so a one-line name is no taller than plain text. Colour comes from the
 * surrounding text.
 */
export function ProviderName({ id }: { id: ProviderId }) {
  const label = providerLabel(id);
  switch (label.kind) {
    case "plain":
      return <>{label.name}</>;
    case "tagged":
      return (
        <span className="relative">
          {label.short}{" "}
          <span
            className="inline-block rounded-full px-1.5 py-px align-middle text-[11px] leading-[1.35] font-medium whitespace-nowrap"
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
