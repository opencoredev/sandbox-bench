import type { ReactNode } from "react";

import type { Provider, TrackId } from "@/lib/data";
import { chipBasisLabel, hardware, probeDate } from "@/lib/hardware";
import type { HardwareDetail } from "@/lib/hardware";
import { providerColor, providerName } from "@/lib/providers";
import { advertised } from "@/lib/sizes";

/** Shared by the header and every row, so the columns line up. */
const grid = "sm:grid-cols-[7.5rem_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_1rem] sm:gap-x-5";

const Cell = ({ label, main, sub }: { label: string; main: ReactNode; sub: ReactNode }) => (
  <span className="mt-2 block min-w-0 sm:mt-0">
    <span className="block text-[11px] text-[var(--muted)] sm:hidden">{label}</span>
    <span className="block text-[13.5px] leading-snug sm:text-[13px]">{main}</span>
    <span className="mt-0.5 block text-[12px] leading-snug text-[var(--muted)] sm:text-[11.5px]">{sub}</span>
  </span>
);

function memoryCell(m: HardwareDetail["memory"]) {
  switch (m.kind) {
    case "known":
      return { main: m.type, sub: m.basis };
    case "unknown":
      return { main: "Not known", sub: m.why };
    default: {
      const _exhaustive: never = m;
      return _exhaustive;
    }
  }
}

/** The chips this track's own fingerprints saw, when more than one: "9354P ×59, 9254 ×43". */
function seenChips(p: Provider) {
  const models = p.hardware?.cpuModels ?? [];
  if (models.length < 2) return null;
  return models.map((m) => `${m.value.replace(/^AMD EPYC /, "").replace(/ \d+-Core Processor$/, "")} ×${m.count}`).join(", ");
}

function Row({ p, h, track }: { p: Provider; h: HardwareDetail; track: TrackId }) {
  const memory = memoryCell(h.memory);
  const seen = seenChips(p);
  // The advertised-size note is about default sandboxes only.
  const size = track === "default" ? advertised[p.id].note : null;
  return (
    <li>
      <details className="group border-b border-[var(--line)]">
        <summary
          className={`${grid} relative grid cursor-pointer list-none grid-cols-2 gap-x-4 rounded-md py-3.5 pr-8 outline-none hover:bg-[var(--band)]/60 focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/60 sm:items-start sm:pr-0 [&::-webkit-details-marker]:hidden`}
        >
          <span className="col-span-2 block text-[14px] font-medium sm:col-span-1 sm:text-[13px]" style={{ color: providerColor(p.id) }}>
            {providerName(p.id)}
          </span>
          <Cell label="Chip" main={h.chip} sub={`${h.family} · ${chipBasisLabel[h.chipBasis]}`} />
          <Cell label="Memory" main={memory.main} sub={memory.sub} />
          <Cell label="Where" main={h.cloud} sub={h.region} />
          <Cell label="Runs as" main={h.runsAs} sub={h.runsAsDetail} />
          <span
            aria-hidden
            className="absolute top-4 right-1 text-[12px] text-[var(--muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none sm:static sm:pt-0.5"
          >
            ▾
          </span>
        </summary>
        <div className="grid gap-4 pt-1 pb-5 text-[12.5px] leading-relaxed sm:grid-cols-[7.5rem_1fr] sm:gap-x-5">
          <span className="hidden sm:block" />
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:gap-x-8">
            <div>
              <p className="text-[11.5px] text-[var(--muted)]">Hidden or different from the real machine</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1.5 pl-4 marker:text-[var(--muted)]">
                {h.hidden.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <dl className="flex flex-col gap-2">
              {[
                ["Memory", h.memory.kind === "known" ? `${h.memory.detail} (${h.memory.basis})` : h.memory.why],
                ["Disk", h.storage],
                ["Kernel", h.kernel],
                ...(seen ? [["Chips in this track", `${seen}, from the benchmark's fingerprints`]] : []),
                ...(track === "same-spec" && h.sameSpec ? [["At 4 vCPU", h.sameSpec]] : []),
                ...(size ? [["Size", size]] : []),
              ].map(([term, text]) => (
                <div key={term}>
                  <dt className="text-[11.5px] text-[var(--muted)]">{term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </details>
    </li>
  );
}

/**
 * What each provider's sandboxes run on: chip, memory, cloud and region, and
 * how they are isolated, from a hardware probe checked against the
 * benchmark's fingerprints. Each row opens to show what the sandbox hides.
 * A grid on wide screens; stacked labelled cells on phones.
 */
export function SpecSheet({ providers, track }: { providers: readonly Provider[]; track: TrackId }) {
  return (
    <>
      <p className="mb-4 max-w-[80ch] text-[12px] leading-snug text-[var(--muted)]">
        Named means the CPU reports its own model. Inferred means we worked it out from what the sandbox shows, such as model number, cache and clock, or from the chip&apos;s published spec.
        Measured memory was read inside the sandbox. From a hardware probe on {probeDate}, checked against the benchmark&apos;s fingerprints. Open a row for what each sandbox hides.
      </p>
      <div className={`${grid} hidden border-b border-[var(--line)] pb-2.5 text-[12px] text-[var(--muted)] sm:grid`} aria-hidden>
        <span>Provider</span>
        <span>Chip</span>
        <span>Memory</span>
        <span>Where</span>
        <span>Runs as</span>
        <span />
      </div>
      <ul className="border-t border-[var(--line)] sm:border-t-0">
        {providers.map((p) => (
          <Row key={p.id} p={p} h={hardware[p.id]} track={track} />
        ))}
      </ul>
    </>
  );
}
