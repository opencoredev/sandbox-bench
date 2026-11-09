import { ArrowRight } from "lucide-react";

import { JumpLink } from "@/components/jump";
import { ProviderName } from "@/components/provider-name";
import type { Track } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { perThousand, pickFor, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

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

/**
 * The cost tile: fix and test, the realistic workload closest to everyday
 * agent work, rather than the quick synthetic task. It shows the lowest
 * verified cost among eligible providers (saying so when it is the only
 * one), or the lowest reported cost marked unverified when none is eligible.
 */
function costTile(track: Track): Omit<Stat, "section" | "tab"> | null {
  const p = pickFor(realistic, runTrackOf[track.id], "fix-and-test");
  switch (p.kind) {
    case "verified":
      return {
        label: "Fix and test, per 1,000",
        provider: p.pick.provider,
        value: perThousand(p.pick.cost.usdPerCompleted),
        note: `${p.eligible.length === 1 ? "only verified cost" : "lowest verified cost"} · pilot`,
      };
    case "none": {
      const [lowest] = p.lower;
      return lowest ? { label: "Fix and test: none verified", provider: lowest.provider, value: perThousand(lowest.cost.usdPerCompleted), note: "lowest reported, unverified · pilot" } : null;
    }
    case "empty":
      return null;
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

function stats(track: Track): Stat[] {
  const cold = fastest(track, "cold");
  const replay = fastest(track, "tool-replay");
  const restore = fastest(track, "create-from-snapshot");
  const cost = costTile(track);
  const resume = track.providers
    .flatMap((p) => (p.pauseSplit ? [{ provider: p.id, resume: p.pauseSplit.resume }] : []))
    .sort((a, b) => a.resume - b.resume)[0];
  return [
    ...(cold ? [{ label: "Fastest cold start", ...cold, section: "startup", tab: "cold" }] : []),
    ...(replay ? [{ label: "Fastest agent work", ...replay, section: "agent", tab: "tool-replay" }] : []),
    ...(cost ? [{ ...cost, section: "task-cost", tab: "fix-and-test" }] : []),
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
    <ul className="grid grid-cols-2 gap-s lg:grid-cols-5">
      {cells.map((s) => (
        <li key={s.label} className="last:odd:col-span-2 lg:last:odd:col-span-1">
          <JumpLink
            section={s.section}
            tab={s.tab}
            className="surface group focus-ring flex h-full flex-col gap-xs px-m py-s transition-colors duration-[var(--motion-duration)] ease-[var(--motion-easing)] hover:bg-neutral-3 motion-reduce:transition-none"
          >
            <span className="text-s text-neutral-7">{s.label}</span>
            <span className="font-mono text-l tabular-nums sm:text-xl">{s.value}</span>
            <span className="flex items-center justify-between gap-xs text-s">
              <span className="min-w-0 line-clamp-2">
                <span className="font-medium" style={{ color: providerColor(s.provider) }}>
                  <ProviderName id={s.provider} />
                </span>
                {s.note ? <span className="text-neutral-7"> · {s.note}</span> : null}
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-neutral-7 transition-[color,transform] duration-[var(--motion-duration)] ease-[var(--motion-easing)] group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none"
              />
            </span>
          </JumpLink>
        </li>
      ))}
    </ul>
  );
}
