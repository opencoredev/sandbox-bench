import { ArrowUpRight } from "lucide-react";

import { JumpLink } from "@/components/jump";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import { realTasksSection, taskTimes } from "@/components/real-tasks";
import { taskCostSection } from "@/components/realistic";
import type { Track } from "@/lib/data";
import { formatShort } from "@/lib/format";
import { isExtraTier, providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { perThousand, pickFor, profileInfo, runTrackOf } from "@/lib/realistic";
import type { ProfileId } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";

interface Stat {
  label: string;
  value: string;
  provider: ProviderId;
  /** Providers whose result prints the same as the leader's, so the tile names them too instead of crowning one. */
  tied: readonly ProviderId[];
  /** One quiet line at the foot of the tile, such as how the result was measured. */
  caption?: string;
  section: string;
  tab: string;
}

/** Seconds as a tile prints them: "82s". */
const tileSeconds = (s: number) => `${formatShort(s, "s")}s`;

/**
 * The fastest of some times and every provider that prints the same, fastest
 * first: a tie at the shown value is a tie to the reader, so the tile names
 * them all. Providers are ranked on the tier a new account gets. Null when
 * nobody has a time.
 */
export function leaders(times: readonly { provider: ProviderId; seconds: number }[]): { provider: ProviderId; tied: ProviderId[]; value: string } | null {
  const [best, ...rest] = times.filter((t) => !isExtraTier(t.provider)).sort((a, b) => a.seconds - b.seconds);
  if (!best) return null;
  const value = tileSeconds(best.seconds);
  return { provider: best.provider, tied: rest.flatMap((t) => (tileSeconds(t.seconds) === value ? [t.provider] : [])), value };
}

/** The provider with the lowest median for a metric, with any that print the same, or null when nobody has one. */
const fastest = (track: Track, id: string) => leaders(track.metric(id).values.flatMap((v) => (v.p50 === null ? [] : [{ provider: v.provider, seconds: v.p50 }])));

const runs = `${realistic.coverage.headline.attempts} runs`;

/** The provider that finished a real task fastest, by median time from create to confirmed delete, with any that print the same. */
function fastestTask(track: Track, profile: ProfileId): Omit<Stat, "section" | "tab"> | null {
  const lead = leaders(taskTimes(track, profile).timed.map((t) => ({ provider: t.provider, seconds: t.medianWallS })));
  return lead ? { label: `Fastest ${profileInfo[profile].label.toLowerCase()}`, ...lead, caption: runs } : null;
}

/**
 * A real task's cheapest provider per 1,000, by the cost chart's own pick: on
 * Same machine only a provider that measured 4 vCPU and 8 GB counts. Nothing
 * when none finished enough runs.
 */
function costTile(track: Track, profile: ProfileId): Omit<Stat, "section" | "tab"> | null {
  const p = pickFor(realistic, runTrackOf[track.id], profile);
  switch (p.kind) {
    case "picked":
      return { label: `Cheapest ${profileInfo[profile].label.toLowerCase()}, per 1,000`, provider: p.pick.provider, tied: [], value: perThousand(p.pick.cost.usdPerCompleted), caption: runs };
    case "none":
    case "empty":
      return null;
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

/** The real tasks lead, time then cost, then the wait before an agent can do anything. */
function stats(track: Track): Stat[] {
  const tile = (stat: Omit<Stat, "section" | "tab"> | null, section: string, tab: string): Stat[] => (stat ? [{ ...stat, section, tab }] : []);
  const cold = fastest(track, "cold");
  return [
    ...tile(fastestTask(track, "fix-and-test"), realTasksSection, "fix-and-test"),
    ...tile(fastestTask(track, "build"), realTasksSection, "build"),
    ...tile(costTile(track, "fix-and-test"), taskCostSection, "fix-and-test"),
    ...tile(costTile(track, "build"), taskCostSection, "build"),
    ...tile(cold ? { label: "Fastest cold start", ...cold } : null, "startup", "cold"),
  ];
}

/**
 * The winners row under the title, one cell per headline result. Each cell
 * opens the chart it comes from; a provider that prints the same median is
 * named as tied, and a close second may still be tied within its interval.
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
            {s.tied.length > 0 ? (
              <span className="mt-xxs text-xs text-pretty text-neutral-8">
                Tied with{" "}
                {s.tied.map((id, i) => (
                  <span key={id}>
                    {i === 0 ? "" : i === s.tied.length - 1 ? " and " : ", "}
                    <span className="font-medium" style={{ color: providerColor(id) }}>
                      <ProviderName id={id} />
                    </span>
                  </span>
                ))}
              </span>
            ) : null}
            {/* The qualifier sits on the tile's last line, so captions line up across the row. */}
            {s.caption ? <span className="mt-auto pt-xs text-xs text-pretty text-neutral-7">{s.caption}</span> : null}
          </JumpLink>
        </li>
      ))}
    </ul>
  );
}
