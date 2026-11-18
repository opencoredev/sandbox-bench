import { ArrowRight } from "lucide-react";

import { JumpLink } from "@/components/jump";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import type { Track } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { pauses, resumeOf } from "@/lib/pause";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { perThousand, pickFor, pilotShort, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

interface Stat {
  label: string;
  value: string;
  provider: ProviderId;
  /** A qualifier under the provider, such as how a cost was priced. */
  note?: string;
  /** A line that must always show in full, under the clamped provider line, such as the pilot label. */
  badge?: string;
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
      return { label: "Cheapest fix and test, per 1,000", provider: p.pick.provider, value: perThousand(p.pick.cost.usdPerCompleted), badge: pilotShort(realistic) };
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
    ...(resume ? [{ label: "Fastest resume", provider: resume.provider, value: `${formatShort(resume.resume, "s")}s`, ...(resume.standby ? { note: "from standby, no pause call" } : {}), section: "state", tab: "resume" }] : []),
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
            className="surface surface-link group focus-ring flex h-full flex-col gap-xs px-m py-s"
          >
            <span className="text-s text-neutral-7">{s.label}</span>
            <span className="font-mono text-l tabular-nums sm:text-xl">{s.value}</span>
            <span className="flex items-center justify-between gap-xs text-s">
              <span className="flex min-w-0 items-start gap-xs">
                {/* Below 360 px a tile is too narrow for the logo and a long name such as Superserve. */}
                <span className="hidden h-[1.4em] shrink-0 items-center min-[360px]:flex">
                  <ProviderLogo id={s.provider} size={16} />
                </span>
                <span className="min-w-0 line-clamp-2">
                <span className="font-medium" style={{ color: providerColor(s.provider) }}>
                  <ProviderName id={s.provider} />
                </span>
                {s.note && !s.badge ? <span className="text-neutral-7"> · {s.note}</span> : null}
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-neutral-7 group-hover:text-neutral-10"
              />
            </span>
            {/* A tile with a badge carries a status that must never be cut, so both sit outside the clamped line. */}
            {s.badge && s.note ? <span className="text-xs text-pretty text-neutral-8">{s.note}</span> : null}
            {s.badge ? <span className="text-xs text-pretty text-neutral-7">{s.badge}</span> : null}
          </JumpLink>
        </li>
      ))}
    </ul>
  );
}
