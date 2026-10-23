import { providerColor, providerLabel } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/**
 * A provider's name as shown on the page. A tagged product renders its short
 * name and a small pill ("Upstash" + "Ephemeral"); screen readers hear the
 * full name. The tag drops under the short name only where a column is too
 * narrow for both. Colour comes from the surrounding text.
 */
export function ProviderName({ id }: { id: ProviderId }) {
  const label = providerLabel(id);
  switch (label.kind) {
    case "plain":
      return <>{label.name}</>;
    case "tagged":
      return (
        <span className="relative inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 align-middle">
          {label.short}
          <span
            className="rounded-full px-1.5 py-px text-[11px] leading-[1.35] font-medium whitespace-nowrap"
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
