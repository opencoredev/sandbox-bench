import { Fragment } from "react";
import type { ReactNode } from "react";
import { failureNote } from "@/lib/failure-notes";
import type { ProviderId } from "@/lib/providers";

/**
 * A provider's counted failures in one line, "reason (1 failure); reason (2
 * failures)", or `none` without any. A failure with a note (Archil's
 * unconfirmed one) carries it inside its parentheses, in a quieter colour.
 * Without any note the line is the same single string as before, so other
 * providers' markup doesn't change.
 */
export function failureLine({
  provider,
  failures,
  unit,
  none,
}: {
  provider: ProviderId;
  failures: readonly { reason: string; count: number }[];
  unit: { one: string; many: string };
  none: string;
}): ReactNode {
  if (failures.length === 0) return none;
  const counted = (f: { count: number }) => `${f.count} ${f.count === 1 ? unit.one : unit.many}`;
  const notes = failures.map((f) => failureNote({ provider, reason: f.reason }));
  if (notes.every((n) => n === null)) return failures.map((f) => `${f.reason} (${counted(f)})`).join("; ");
  return failures.map((f, i) => {
    const note = notes[i] ?? null;
    return (
      <Fragment key={f.reason}>
        {`${i > 0 ? "; " : ""}${f.reason} (${counted(f)}`}
        {note ? (
          <>
            {"; "}
            <span className="text-neutral-7">{note}</span>
          </>
        ) : null}
        {")"}
      </Fragment>
    );
  });
}
