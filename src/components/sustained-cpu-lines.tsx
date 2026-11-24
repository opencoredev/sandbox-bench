"use client";

import { useState } from "react";

import { Who } from "@/components/metric-chart";
import { ProviderName } from "@/components/provider-name";
import { linearTicks } from "@/components/scatter";
import { isExtraTier, providerColor, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { TARGET_DURATION_S, WINDOW_S, minutesText, opsText, retentionText } from "@/lib/sustained-cpu";
import type { SustainedProvider } from "@/lib/sustained-cpu";

// Plot insets in px: room for the y tick labels on the left and the x ticks below.
const INSET = { left: 40, right: 10, top: 18, bottom: 26 };
/** Where Styne's burst credit, the longest the bench knows of, runs out. */
const MARKER_S = 600;
const X_TICKS_MIN = [0, 3, 6, 9, 12, 15] as const;

/** CSS position of a 0 to 1 fraction along the plot area. */
const along = (f: number, axis: "x" | "y") =>
  axis === "x" ? `calc(${INSET.left}px + (100% - ${INSET.left + INSET.right}px) * ${f})` : `calc(${INSET.top}px + (100% - ${INSET.top + INSET.bottom}px) * ${1 - f})`;

const tierAttrs = (id: ProviderId) => (isExtraTier(id) ? { "data-tier-extra": "" } : {});

/** "0–3 min 45.2M → 12–15 min 7.2M ops/s · 16% retained", or how far a run got and why it stopped. */
function summary(p: SustainedProvider) {
  const windows =
    p.first3MinOps !== null && p.last3MinOps !== null && p.retention !== null
      ? `0–3 min ${opsText(p.first3MinOps)} → 12–15 min ${opsText(p.last3MinOps)} · ${retentionText(p.retention)} retained`
      : p.first3MinOps !== null
        ? `0–3 min ${opsText(p.first3MinOps)}`
        : "no segment finished";
  return p.status === "completed" ? windows : `${windows} · stopped at ${minutesText(p.durationS)}: ${p.stopReason}`;
}

/** The legend's tag: retention, or a word for a run with none. */
const legendTag = (p: SustainedProvider) => (p.retention !== null ? retentionText(p.retention) : p.status === "failed" ? "failed" : "stopped");

/**
 * All-core operations per second across the 15-minute run, one line per
 * provider. Hovering or focusing a provider in the legend highlights its line
 * and shows its first and last 3 minutes; a click keeps it highlighted.
 */
export function SustainedCpuLines({ providers }: { providers: readonly SustainedProvider[] }) {
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [hovered, setHovered] = useState<ProviderId | null>(null);
  const active = hovered ?? selected;
  const activeRun = providers.find((p) => p.provider === active);
  const peak = Math.max(...providers.flatMap((p) => p.segments.map((s) => s.opsPerS / 1e6)), Number.EPSILON);
  const yTicks = linearTicks(peak);
  const yMax = yTicks.at(-1) ?? peak;
  // The highlighted line draws last, on top of the rest.
  const drawn = [...providers.filter((p) => p.provider !== active), ...(activeRun ? [activeRun] : [])];
  const label = providers.map((p) => `${providerName(p.provider)}: ${summary(p)}`).join("; ");

  return (
    <figure aria-label={`All-core operations per second over 15 minutes. ${label}.`}>
      <div className="relative h-[260px] min-w-0 sm:h-[340px]" aria-hidden>
        {/* The two windows retention compares. */}
        {[0, TARGET_DURATION_S - WINDOW_S].map((start) => (
          <div
            key={start}
            className="absolute bg-neutral-3 opacity-40"
            style={{ left: along(start / TARGET_DURATION_S, "x"), width: `calc((100% - ${INSET.left + INSET.right}px) * ${WINDOW_S / TARGET_DURATION_S})`, top: INSET.top, bottom: INSET.bottom }}
          />
        ))}
        {yTicks.map((t) => (
          <div key={`y${t}`} className="absolute border-t border-neutral-3" style={{ left: INSET.left, right: INSET.right, top: along(t / yMax, "y") }}>
            <span className="absolute -left-2 -translate-x-full -translate-y-1/2 font-mono text-xxs text-neutral-7 tabular-nums">{t === 0 ? "0" : `${t}M`}</span>
          </div>
        ))}
        {X_TICKS_MIN.map((m) => (
          <span key={`x${m}`} className="absolute -translate-x-1/2 font-mono text-xxs whitespace-nowrap text-neutral-7 tabular-nums" style={{ left: along((m * 60) / TARGET_DURATION_S, "x"), bottom: 4 }}>
            {m === 15 ? "15 min" : m}
          </span>
        ))}
        <div className="absolute border-l border-dashed border-neutral-6" style={{ left: along(MARKER_S / TARGET_DURATION_S, "x"), top: INSET.top - 4, bottom: INSET.bottom }}>
          <span className="absolute -top-3.5 -translate-x-1/2 font-mono text-xxs whitespace-nowrap text-neutral-7">10 min</span>
        </div>
        <div className="absolute border-t border-neutral-5" style={{ left: INSET.left, right: INSET.right, bottom: INSET.bottom }} />
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{ left: INSET.left, top: INSET.top, width: `calc(100% - ${INSET.left + INSET.right}px)`, height: `calc(100% - ${INSET.top + INSET.bottom}px)` }}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {drawn.map((p) => (
            <polyline
              key={p.provider}
              {...tierAttrs(p.provider)}
              points={p.segments.map((s) => `${(s.startS + s.durationS / 2) / TARGET_DURATION_S},${1 - s.opsPerS / 1e6 / yMax}`).join(" ")}
              fill="none"
              stroke={providerColor(p.provider)}
              strokeOpacity={active === null || active === p.provider ? 1 : 0.18}
              strokeWidth={active === p.provider ? 2.5 : 1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="transition-[stroke-opacity] duration-[var(--motion-duration)] motion-reduce:transition-none"
            />
          ))}
        </svg>
      </div>
      <p className="mt-xs min-h-8 text-xs text-pretty text-neutral-7 sm:min-h-4" aria-live="polite">
        {activeRun ? (
          <>
            <Who id={activeRun.provider} /> <span className="font-mono tabular-nums text-neutral-9">{summary(activeRun)}</span>
          </>
        ) : null}
      </p>
      <ul className="mt-xs flex flex-wrap gap-x-xs gap-y-xxs" aria-label="Highlight a provider">
        {providers.map((p) => (
          <li key={p.provider} {...tierAttrs(p.provider)}>
            <button
              type="button"
              aria-pressed={selected === p.provider}
              onClick={() => setSelected((s) => (s === p.provider ? null : p.provider))}
              onPointerEnter={() => setHovered(p.provider)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(p.provider)}
              onBlur={() => setHovered(null)}
              className={`focus-ring flex items-center gap-1.5 rounded-s px-1.5 py-0.5 text-xs transition-[background-color,opacity] duration-[var(--motion-duration)] motion-reduce:transition-none hover:bg-neutral-3 aria-pressed:bg-neutral-3 ${active !== null && active !== p.provider ? "opacity-50" : ""}`}
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: providerColor(p.provider) }} />
              <span className="text-neutral-9">
                <ProviderName id={p.provider} />
              </span>
              <span className="font-mono text-neutral-7 tabular-nums">{legendTag(p)}</span>
            </button>
          </li>
        ))}
      </ul>
    </figure>
  );
}
