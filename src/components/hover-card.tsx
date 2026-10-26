import { ArrowRight } from "lucide-react";
import { Fragment } from "react";
import type { CSSProperties } from "react";

import { ChartPopup, ChartPopupDescription, ChartPopupTitle } from "@/components/chart-popup";
import { ProviderName } from "@/components/provider-name";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** One line of a chart's hover card: a `[label, value]` row, or a plain note. */
export type DetailLine = string | readonly [label: string, value: string];

/** The line as one phrase, for accessible names. */
export const detailText = (line: DetailLine) => (typeof line === "string" ? line : `${line[0]} ${line[1]}`);

/**
 * A chart's hover card on the theme's preview card: its edge, corners,
 * padding and type. The theme's popover is Neutral 2, which floats on the
 * black page but vanishes on a Neutral 2 chart card, so on a card it takes
 * the next step up, Neutral 3. The chart owns where it sits and when it shows.
 */
export function HoverCard({
  provider,
  detail,
  hint,
  className = "",
  style,
}: {
  provider: ProviderId;
  detail: readonly DetailLine[];
  hint?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const rows = detail.filter((line) => typeof line !== "string");
  const notes = detail.filter((line) => typeof line === "string");
  return (
    <ChartPopup role="presentation" style={style} className={`pointer-events-none absolute z-10 w-max max-w-[300px] min-w-[220px] bg-neutral-3 text-left ${className}`}>
      <ChartPopupTitle className="flex items-center gap-xs">
        <span aria-hidden className="size-s shrink-0 rounded-xs" style={{ backgroundColor: providerColor(provider) }} />
        <ProviderName id={provider} />
      </ChartPopupTitle>
      {rows.length > 0 ? (
        <div className="grid grid-cols-[1fr_auto] gap-x-m">
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <ChartPopupDescription>{label}</ChartPopupDescription>
              <span className="text-right font-mono tabular-nums">{value}</span>
            </Fragment>
          ))}
        </div>
      ) : null}
      {notes.map((note) => (
        <ChartPopupDescription key={note} className="max-w-none">
          {note}
        </ChartPopupDescription>
      ))}
      {hint ? (
        <ChartPopupDescription className="flex max-w-none items-center gap-xxs">
          {hint}
          <ArrowRight aria-hidden className="size-4 shrink-0" />
        </ChartPopupDescription>
      ) : null}
    </ChartPopup>
  );
}
