import { TraceWaterfallView } from "@/components/trace-waterfall-view";
import type { WaterfallProvider } from "@/components/trace-waterfall-view";
import { Tracked } from "@/components/track";
import { isPriced } from "@/lib/cost";
import { hasResults } from "@/lib/data";
import type { Track } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";
import type { TraceKind } from "@/lib/traces";

/** The metric behind each trace, for its failure count. */
const traceMetric = { cold: "cold", pause: "pause-resume", replay: "tool-replay" } as const satisfies Record<TraceKind, string>;

/** Failed and total attempts behind each trace's test, provider-caused failures only. */
function failures(track: Track, id: ProviderId): WaterfallProvider["failures"] {
  const of = (k: TraceKind) => {
    const v = track.metric(traceMetric[k]).values.find((x) => x.provider === id);
    return { failed: v?.failures ?? 0, attempts: v ? v.n + v.failures : 0 };
  };
  return { cold: of("cold"), pause: of("pause"), replay: of("replay") };
}

const providersOf = (track: Track): WaterfallProvider[] =>
  track.providers.map((p) => {
    const c = track.costs[p.id];
    return { id: p.id, costUsd: c && isPriced(c) ? c.usd : null, failures: failures(track, p.id) };
  });

/** The trace waterfall section: median timings per provider, step by step. Follows the track switch. */
export function TraceWaterfall() {
  return (
    <section id="trace" aria-labelledby="trace-title" className="scroll-mt-20 pt-16 sm:pt-24 lg:scroll-mt-28">
      <h2 id="trace-title" className="flex items-center gap-3 font-pixel text-[28px] leading-none tracking-tight sm:text-[34px]">
        <span aria-hidden className="size-3.5 shrink-0 bg-[var(--foreground)]" />
        Where the time goes
      </h2>
      <p className="mt-3 mb-6 max-w-[72ch] text-[14px] leading-relaxed text-[var(--muted)]">
        Step by step, from median timings. Colour is the provider&apos;s time; grey is ours.
      </p>
      <Tracked>{(track) => (hasResults(track) ? <TraceWaterfallView track={track.id} providers={providersOf(track)} /> : null)}</Tracked>
    </section>
  );
}
