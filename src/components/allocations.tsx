import { Who, sentence } from "@/components/metric-chart";
import type { Provider, Track } from "@/lib/data";
import { absentNote, allocationNotes, measuredText, requestedText } from "@/lib/notes";
import { advertised } from "@/lib/sizes";

/** The verdict for one provider: does what it ran match what the track compares? */
function verdict(track: Track, p: Provider) {
  if (p.measuredAllocations.length === 0) return { ok: false, text: "Not measured" };
  if (track.id === "default") return { ok: true, text: "Its default" };
  return p.equalSpec ? { ok: true, text: "Matches" } : { ok: false, text: "Differs" };
}

/** Why the row needs a note, if it does: a size mismatch or the provider's own size note. */
const rowNote = (track: Track, p: Provider) =>
  track.id === "same-spec" ? (allocationNotes(track)[p.id] ?? null) : advertised[p.id].note;

const Verdict = ({ ok, text }: { ok: boolean; text: string }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${ok ? "" : "text-[var(--warn)]"}`}>
    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${ok ? "bg-[var(--ok)]" : "bg-[var(--warn)]"}`} />
    {text}
  </span>
);

/**
 * What each provider was asked for beside what we measured inside it, so no
 * chart can pass off a different machine as the same one. A table on wide
 * screens, one block per provider on phones.
 */
export function Allocations({ track }: { track: Track }) {
  const rows = track.providers.map((p) => ({
    p,
    requested: requestedText(p),
    measured: measuredText(p) ?? "not measured",
    v: verdict(track, p),
    note: rowNote(track, p),
  }));
  // In the default track every machine is its default by definition, so the verdict column would only repeat that.
  const verdicts = track.id === "same-spec";
  return (
    <>
      <ul className="flex flex-col divide-y divide-[var(--line)] border-y border-[var(--line)] sm:hidden">
        {rows.map(({ p, requested, measured, v, note }) => (
          <li key={p.id} className="py-3 text-[13.5px] leading-snug">
            <p className="flex items-baseline justify-between gap-3">
              <Who id={p.id} />
              {verdicts ? (
                <span className="text-[12.5px]">
                  <Verdict {...v} />
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[var(--muted)]">
              Asked for <span className="text-[var(--foreground)]">{requested}</span>
            </p>
            <p className="text-[var(--muted)]">
              Measured <span className="font-mono text-[12.5px] text-[var(--foreground)]">{measured}</span>
            </p>
            {note ? <p className="mt-1.5 text-[12.5px] text-[var(--muted)]">{sentence(note.replace(/^ran /, "Ran "))}</p> : null}
          </li>
        ))}
      </ul>
      <table className="hidden w-full border-collapse text-left text-[13px] sm:table">
        <thead>
          <tr className="border-b border-[var(--line)] text-[12px] text-[var(--muted)]">
            {["Provider", "Asked for", "Measured inside", ...(verdicts ? ["4 vCPU, 8 GB?"] : [])].map((h) => (
              <th key={h} scope="col" className="py-2.5 pr-5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, requested, measured, v, note }) => (
            <tr key={p.id} className="border-b border-[var(--line)] align-top">
              <th scope="row" className="py-3 pr-5 font-medium">
                <Who id={p.id} />
              </th>
              <td className="py-3 pr-5">
                {requested}
                {note ? <span className="mt-1 block max-w-[56ch] text-[11.5px] text-[var(--muted)]">{sentence(note.replace(/^ran /, "Ran "))}</span> : null}
              </td>
              <td className="py-3 pr-5 font-mono text-[12.5px] whitespace-nowrap tabular-nums">{measured}</td>
              {verdicts ? (
                <td className="py-3 pr-5">
                  <Verdict {...v} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {track.absent.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1 text-[12px] text-[var(--muted)]">
          {track.absent.map((id) => (
            <li key={id}>
              <Who id={id} />: {absentNote(track, id)}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
