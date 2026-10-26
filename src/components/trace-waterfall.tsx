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
    <section id="trace" aria-labelledby="trace-title" className="scroll-mt-24 pt-xxl sm:pt-[calc(var(--space-xxl)*1.5)]">
      <h2 id="trace-title" className="flex items-center gap-s font-brand text-l font-medium">
        <span aria-hidden className="size-s shrink-0 bg-neutral-10" />
        Where the time goes
      </h2>
      <p className="mt-xs mb-l max-w-[72ch] text-m text-neutral-8">
        Step by step, from median timings, in each provider&apos;s own time.
      </p>
      <Tracked>{(track) => (hasResults(track) ? <TraceWaterfallView track={track.id} providers={providersOf(track)} /> : null)}</Tracked>
    </section>
  );
}
