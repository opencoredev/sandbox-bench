"use client";

import type { ReactNode } from "react";

import { Accordion, ThemedIcon } from "@graphical";

export interface MethodRow {
  term: string;
  line: ReactNode;
  more: ReactNode;
}

/** The Method section's rows: a term and its one-line answer, opening to the detail. Closed rows stay findable with find in page. */
export function MethodList({ rows }: { rows: readonly MethodRow[] }) {
  return (
    <Accordion.Root multiple>
      {rows.map(({ term, line, more }) => (
        <Accordion.Item key={term} value={term}>
          <Accordion.Header>
            <Accordion.Trigger className="group/row grid w-full grid-cols-[1fr_auto] items-start gap-x-m gap-y-xxs text-start sm:grid-cols-[9rem_1fr_auto]">
              <span className="whitespace-normal">{term}</span>
              <Accordion.Indicator className="col-start-2 row-start-1 self-start pt-xxs sm:col-start-3">
                <ThemedIcon name="chevronRight" semantic />
              </Accordion.Indicator>
              <span className="col-span-2 font-regular whitespace-normal text-neutral-7 transition-colors duration-[var(--motion-duration)] group-hover/row:text-neutral-10 motion-reduce:transition-none sm:col-span-1 sm:col-start-2 sm:row-start-1">
                {line}
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel hiddenUntilFound>
            <Accordion.Content className="max-w-[72ch] pb-m sm:pl-[calc(9rem+var(--space-m))]">{more}</Accordion.Content>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
