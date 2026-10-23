import { JumpLink } from "@/components/jump";
import { ProviderName } from "@/components/provider-name";
import { formatPerThousand, pricedTasks } from "@/lib/cost";
import type { Track } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

interface Stat {
  label: string;
  value: string;
  provider: ProviderId;
  /** A qualifier under the provider, such as how a cost was priced. */
  note?: string;
  section: string;
  tab: string;
}

/** The provider with the lowest median for a metric, or null when nobody has one. */
function fastest(track: Track, id: string) {
  const best = track
    .metric(id)
    .values.flatMap((v) => (v.p50 === null ? [] : [{ provider: v.provider, p50: v.p50 }]))
    .sort((a, b) => a.p50 - b.p50)[0];
  return best ? { provider: best.provider, value: `${formatShort(best.p50, "s")}s` } : null;
}

function stats(track: Track): Stat[] {
  const cold = fastest(track, "cold");
  const replay = fastest(track, "tool-replay");
  const restore = fastest(track, "create-from-snapshot");
  const cheapest = pricedTasks(track)[0];
  const resume = track.providers
    .flatMap((p) => (p.pauseSplit ? [{ provider: p.id, resume: p.pauseSplit.resume }] : []))
    .sort((a, b) => a.resume - b.resume)[0];
  return [
    ...(cold ? [{ label: "Fastest cold start", ...cold, section: "startup", tab: "cold" }] : []),
    ...(replay ? [{ label: "Fastest agent work", ...replay, section: "agent", tab: "tool-replay" }] : []),
    ...(cheapest
      ? [{ label: "Cheapest per 1,000 tasks", provider: cheapest.id, value: formatPerThousand(cheapest.cost.usd), note: cheapest.cost.kind === "billed" ? undefined : "not from a bill yet", section: "cost", tab: "task" }]
      : []),
    ...(restore ? [{ label: "Fastest snapshot start", ...restore, section: "state", tab: "create-from-snapshot" }] : []),
    ...(resume ? [{ label: "Fastest resume", provider: resume.provider, value: `${formatShort(resume.resume, "s")}s`, section: "state", tab: "resume" }] : []),
  ];
}

/**
 * The winners row under the title, one cell per headline result. Each cell
 * opens the chart it comes from; medians only, so a close second may be tied.
 */
export function StatStrip({ track }: { track: Track }) {
  const cells = stats(track);
  if (cells.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] lg:grid-cols-5">
      {cells.map((s) => (
        <li key={s.label} className="-mt-px -ml-px border-t border-l border-[var(--line)] last:odd:col-span-2 lg:last:odd:col-span-1">
          <JumpLink
            section={s.section}
            tab={s.tab}
            className="group flex h-full flex-col gap-1.5 px-4 py-3.5 transition-colors duration-150 outline-none hover:bg-[var(--band)] focus-visible:bg-[var(--band)] focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-inset motion-reduce:transition-none sm:px-5"
          >
            <span className="text-[11px] font-medium tracking-[0.06em] text-[var(--muted)] uppercase">{s.label}</span>
            <span className="font-mono text-[26px] leading-none tracking-tight tabular-nums sm:text-[30px]">{s.value}</span>
            <span className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="min-w-0 line-clamp-2">
                <span className="font-medium" style={{ color: providerColor(s.provider) }}>
                  <ProviderName id={s.provider} />
                </span>
                {s.note ? <span className="text-[var(--muted)]"> · {s.note}</span> : null}
              </span>
              <span aria-hidden className="text-[var(--muted)] transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-[var(--brand)] motion-reduce:transition-none">
                →
              </span>
            </span>
          </JumpLink>
        </li>
      ))}
    </ul>
  );
}
