import { ArrowUpRight } from "lucide-react";

import { JumpLink } from "@/components/jump";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import type { Track } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { pauses, resumeOf } from "@/lib/pause";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { perThousand, pickFor, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

interface Stat {
  label: string;
  value: string;
  provider: ProviderId;
  /** One quiet line at the foot of the tile, such as how the result was measured. */
  caption?: string;
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
 * agent work, rather than the quick synthetic task. It shows the cheapest
 * provider, or nothing when none finished enough runs.
 */
function costTile(track: Track): Omit<Stat, "section" | "tab"> | null {
  const p = pickFor(realistic, runTrackOf[track.id], "fix-and-test");
  switch (p.kind) {
    case "picked":
      return { label: "Cheapest fix and test, per 1,000", provider: p.pick.provider, value: perThousand(p.pick.cost.usdPerCompleted), caption: `Pilot, ${realistic.coverage.headline.attempts} runs per provider` };
    case "none":
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
  // The Resume tab's ranking: a resume call's, or the first command after a sandbox went on standby by itself.
  const resume = pauses(track)
    .flatMap(({ p, r }) => {
      const v = resumeOf(r);
      return v === null ? [] : [{ provider: p.id, resume: v, standby: r.kind === "standby" }];
    })
    .sort((a, b) => a.resume - b.resume)[0];
  return [
    ...(cold ? [{ label: "Fastest cold start", ...cold, section: "startup", tab: "cold" }] : []),
    ...(replay ? [{ label: "Fastest 100 tool calls", ...replay, section: "agent", tab: "tool-replay" }] : []),
    ...(cost ? [{ ...cost, section: "task-cost", tab: "fix-and-test" }] : []),
    ...(restore ? [{ label: "Fastest snapshot start", ...restore, section: "state", tab: "create-from-snapshot" }] : []),
    ...(resume ? [{ label: "Fastest resume", provider: resume.provider, value: `${formatShort(resume.resume, "s")}s`, ...(resume.standby ? { caption: "No pause button: it sleeps when idle, and this is the time to wake it" } : {}), section: "state", tab: "resume" }] : []),
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
          <JumpLink section={s.section} tab={s.tab} className="surface surface-link group focus-ring flex h-full flex-col px-m py-s">
            <span className="flex items-start justify-between gap-xs text-s text-neutral-7">
              {s.label}
              <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 group-hover:text-neutral-10" />
            </span>
            <span className="mt-xs font-mono text-l tabular-nums sm:text-xl">{s.value}</span>
            <span className="mt-xs flex min-w-0 items-center gap-xs text-s font-medium" style={{ color: providerColor(s.provider) }}>
              {/* Below 360 px a tile is too narrow for the logo and a long name such as Superserve. */}
              <span className="hidden shrink-0 min-[360px]:flex">
                <ProviderLogo id={s.provider} size={16} />
              </span>
              <span className="min-w-0 truncate">
                <ProviderName id={s.provider} />
              </span>
            </span>
            {/* The qualifier sits on the tile's last line, so captions line up across the row. */}
            {s.caption ? <span className="mt-auto pt-xs text-xs text-pretty text-neutral-7">{s.caption}</span> : null}
          </JumpLink>
        </li>
      ))}
    </ul>
  );
}
