import type { ReactNode } from "react";

import { ProviderName } from "@/components/provider-name";
import { hardware } from "@/lib/hardware";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** Table parts shared by the By location views, server and client alike. */

/** A location's name as a small outlined chip. */
export const Place = ({ children }: { children: ReactNode }) => (
  <span className="inline-block rounded px-1 text-[10.5px] leading-[1.45] whitespace-nowrap text-[var(--muted)] shadow-[inset_0_0_0_1px_var(--line)]">{children}</span>
);

/** Where a provider's sandboxes run, from the hardware probe; the full text on hover. */
export function RunsIn({ id }: { id: ProviderId }) {
  const h = hardware[id];
  return (
    <span className="mt-1 block text-[11px] leading-tight font-normal text-[var(--muted)] sm:whitespace-nowrap" title={`Where its sandboxes run: ${h.region}`}>
      {h.regionShort === null ? "Location not shown" : `Runs in ${h.regionShort}`}
    </span>
  );
}

/** A provider's name in its colour, with where it runs underneath. */
export const ProviderLabel = ({ id }: { id: ProviderId }) => (
  <span className="block text-[13px] font-medium" style={{ color: providerColor(id) }}>
    <ProviderName id={id} />
    <RunsIn id={id} />
  </span>
);

const sticky = "sticky left-0 z-10 bg-[var(--surface)]";

/** A row's heading cell, pinned so it stays put while a wide table scrolls. */
export const RowHead = ({ children }: { children: ReactNode }) => (
  <th scope="row" className={`${sticky} py-2.5 pr-4 text-left align-top text-[12.5px] leading-snug font-normal`}>
    {children}
  </th>
);

export const ProviderCell = ({ id }: { id: ProviderId }) => (
  <RowHead>
    <ProviderLabel id={id} />
  </RowHead>
);

/**
 * A table with fixed column widths, so stacked tables line up and two
 * columns do not stretch across the card. Scrolls sideways when it is wider
 * than the card, with the first column pinned. Phones get narrower columns,
 * so the next one peeks in at the edge as a sign there is more.
 */
export function Grid({ label, corner, head, children, first = 13, col = 8.5 }: { label: string; corner: string; head: readonly { key: string; cell: ReactNode }[]; children: ReactNode; /** rem */ first?: number; /** rem */ col?: number }) {
  return (
    <div
      className="-mx-5 overflow-x-auto px-5 [--col:var(--col-phone)] [--first:8.25rem] sm:-mx-7 sm:px-7 sm:[--col:var(--col-wide)] sm:[--first:var(--first-wide)]"
      style={{ "--first-wide": `${first}rem`, "--col-wide": `${col}rem`, "--col-phone": `${Math.min(col, 8.5)}rem` }}
    >
      <table aria-label={label} className="table-fixed border-collapse text-left text-[12.5px]" style={{ width: `calc(var(--first) + ${head.length} * var(--col))` }}>
        <colgroup>
          <col style={{ width: "var(--first)" }} />
          {head.map((h) => (
            <col key={h.key} style={{ width: "var(--col)" }} />
          ))}
        </colgroup>
        <thead>
          <tr className="text-[11.5px] text-[var(--muted)]">
            <th scope="col" className={`${sticky} pr-4 pb-2.5 align-top font-normal`}>
              {corner}
            </th>
            {head.map((h) => (
              <th key={h.key} scope="col" className="px-3 pb-2.5 align-top leading-snug font-normal">
                {h.cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-[var(--line)]">{children}</tbody>
      </table>
    </div>
  );
}

export const Empty = () => <span className="text-[11.5px] text-[var(--muted)]">Not measured</span>;
