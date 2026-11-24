"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { NumberField, Toggle, ToggleGroup } from "@graphical";

import { ProviderLogo } from "@/components/provider-logo";
import { defaultInputs, estimateAll, formatUsd, sizeText, workloadOf } from "@/lib/pricing/calc";
import type { Estimate } from "@/lib/pricing/calc";
import type { RateCard } from "@/lib/pricing/rates";
import { providerPageOf } from "@/lib/provider-pages";
import { isExtraTier, providerBrand, providerName } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

const link = "focus-ring rounded-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10";

/** One labelled number on the theme's number field, with steppers. */
/**
 * `wide` for a count that runs to millions; small numbers get a narrower box so two fields share a phone row.
 * `count` rounds to whole numbers: there is no half a sandbox. Sizes and minutes keep their decimals.
 */
function Num({ label, value, onChange, min, max, step, hint, wide = false, count = false }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; hint?: string; wide?: boolean; count?: boolean }) {
  const accept = (v: number | null) => {
    const n = v ?? min;
    onChange(Math.min(max, Math.max(min, count ? Math.round(n) : n)));
  };
  return (
    <NumberField.Root value={value} min={min} max={max} step={step} onValueChange={accept} format={count ? { maximumFractionDigits: 0 } : undefined} className="w-min">
      <NumberField.Label className="text-s text-neutral-8">{label}</NumberField.Label>
      <NumberField.Group>
        <NumberField.Decrement aria-label={`Less: ${label}`}>
          <Minus aria-hidden className="size-4" />
        </NumberField.Decrement>
        <NumberField.Input className={wide ? "w-[6.5rem]" : "w-[3.5rem]"} />
        <NumberField.Increment aria-label={`More: ${label}`}>
          <Plus aria-hidden className="size-4" />
        </NumberField.Increment>
      </NumberField.Group>
      {hint ? <span className="text-xs text-pretty text-neutral-7">{hint}</span> : null}
    </NumberField.Root>
  );
}

/** A few options on the theme's toggle group, as the trace panel's switches are. */
function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const id = items.find((it) => next.includes(it.id))?.id;
        if (id !== undefined) onChange(id);
      }}
      className="surface w-fit max-w-full overflow-x-auto p-xxs [scrollbar-width:none]"
    >
      {items.map((it) => (
        <Toggle key={it.id} value={it.id} className={`shrink-0 whitespace-nowrap text-s ${it.id === value ? "" : "text-neutral-7"}`}>
          {it.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/** A provider's logo and name, linking to its results page where it has one; a CPU tier links to its provider's page. */
export function ProviderCell({ id }: { id: ProviderId }) {
  const page = providerPageOf(isExtraTier(id) ? providerBrand(id) : id);
  const name = (
    <span className="flex min-w-0 items-center gap-xs">
      <ProviderLogo id={id} size={16} />
      <span className="min-w-0 truncate">{providerName(id)}</span>
    </span>
  );
  return page ? (
    <a href={page} className={`${link} block min-w-0 text-neutral-10`}>
      {name}
    </a>
  ) : (
    name
  );
}

const ResultRow = ({ e, children }: { e: Estimate; children: ReactNode }) => (
  <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-m gap-y-xxs border-t border-neutral-3 py-s first:border-t-0 sm:grid-cols-[minmax(0,14rem)_8rem_minmax(0,1fr)]">
    <ProviderCell id={e.id} />
    {children}
  </li>
);

function Row({ e, card }: { e: Estimate; card: RateCard }) {
  switch (e.kind) {
    case "priced":
      return (
        <ResultRow e={e}>
          <span className="text-right text-m text-neutral-10 sm:text-left">
            {e.atMost ? <span className="text-s text-neutral-7">up to </span> : null}
            <span className="font-mono tabular-nums">{formatUsd(e.monthlyUsd)}</span>
          </span>
          <span className="col-span-2 text-s text-pretty text-neutral-7 sm:col-span-1">
            {sizeText(e.size)}
            {e.roundedUp ? " (smallest listed size that fits)" : ""} at {formatUsd(e.hourlyUsd)} an hour, billed {card.billed}
            {card.currency === "EUR" ? ", converted from euros" : ""}
            {e.atMost ? `. Bills ${card.idle === "none" ? "active CPU only" : "active CPU and memory"}, so this is the most its CPU and memory would charge${card.perSandbox > 0 ? ", plus its fee per sandbox created" : ""}` : ""}
            {card.assumed.length > 0 ? <span className="mt-xxs block text-xs text-neutral-7">Assumes {card.assumed.join("; ")}.</span> : null}
          </span>
        </ResultRow>
      );
    case "no-size":
      return (
        <ResultRow e={e}>
          <span className="text-right text-s text-neutral-7 sm:text-left">No size this big</span>
          <span className="col-span-2 text-s text-neutral-7 sm:col-span-1">Largest listed: {sizeText(e.largest)}</span>
        </ResultRow>
      );
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}

/**
 * Monthly bill on every provider for a workload, at published list prices.
 * The server renders it with the default inputs, so the page's HTML carries
 * real numbers; every change after is worked out in the browser.
 */
export function PriceCalculator({ cards, eurUsd }: { cards: readonly RateCard[]; eurUsd: number }) {
  const [inputs, setInputs] = useState(defaultInputs);
  const set = <K extends keyof typeof defaultInputs>(key: K) => (v: (typeof defaultInputs)[K]) => setInputs((i) => ({ ...i, [key]: v }));
  const w = workloadOf(inputs);
  const results = estimateAll(cards, w, eurUsd);
  const cardOf = (id: ProviderId) => cards.find((c) => c.id === id);
  const hours = (w.sandboxes * (w.activeMinutes + w.idleMinutes)) / 60;
  return (
    <div className="surface p-m sm:p-l">
      <div className="flex flex-col gap-m">
        <Segmented
          label="How your sandboxes run"
          items={[
            { id: "tasks", label: "One sandbox per task" },
            { id: "always", label: "Always on" },
          ]}
          value={inputs.mode}
          onChange={set("mode")}
        />
        <div className="flex flex-wrap gap-x-m gap-y-m sm:gap-x-l">
          {inputs.mode === "tasks" ? (
            <>
              <Num wide count label="Sandboxes a month" value={inputs.sandboxes} onChange={set("sandboxes")} min={1} max={10_000_000} step={1000} />
              <Num label="Busy minutes each" value={inputs.activeMinutes} onChange={set("activeMinutes")} min={0} max={1440} step={1} />
              <Num label="Idle minutes each" value={inputs.idleMinutes} onChange={set("idleMinutes")} min={0} max={1440} step={1} hint="Left open after the work, CPU idle" />
            </>
          ) : (
            <>
              <Num wide count label="Running at once" value={inputs.running} onChange={set("running")} min={1} max={10_000} step={1} />
              <Num label="Hours a day" value={inputs.hoursPerDay} onChange={set("hoursPerDay")} min={1} max={24} step={1} hint="Every day for 30 days" />
            </>
          )}
          <Num label="vCPU" value={inputs.cpu} onChange={set("cpu")} min={0.125} max={64} step={1} />
          <Num label="Memory, GB" value={inputs.memoryGiB} onChange={set("memoryGiB")} min={0.125} max={256} step={1} />
        </div>
      </div>
      <p className="mt-l text-s text-pretty text-neutral-7" aria-live="polite">
        {inputs.mode === "tasks"
          ? `${w.sandboxes.toLocaleString("en-US")} sandboxes`
          : `${inputs.running.toLocaleString("en-US")} ${inputs.running === 1 ? "sandbox" : "sandboxes"} running ${inputs.hoursPerDay} ${inputs.hoursPerDay === 1 ? "hour" : "hours"} a day`}
        , {hours < 10 ? Number(hours.toFixed(1)) : Math.round(hours).toLocaleString("en-US")} sandbox-hours a month on {sizeText({ cpu: w.cpu, memoryGiB: w.memoryGiB })}, at list price. Cheapest first.
      </p>
      <ol className="mt-xs">
        {results.map((e) => {
          const card = cardOf(e.id);
          return card ? <Row key={e.id} e={e} card={card} /> : null;
        })}
      </ol>
    </div>
  );
}

/** A provider's measured cost per completed real task, from the site's real-task runs. */
export interface TaskCostRow {
  id: ProviderId;
  usdPerTask: number;
  /** Billed, Metered or Estimate. */
  how: string;
  completed: number;
  attempts: number;
  /** What a reader must know to compare this row: a machine other than the one asked for, a part priced at list price, capacity that can be taken back. */
  notes: readonly string[];
}

export type RunTrackId = "same-machine" | "default";
export type TaskProfile = "fix-and-test" | "build";

/**
 * What a month of real coding tasks costs on each provider: tasks times the
 * measured cost per completed task, which counts setup and failed attempts.
 */
export function RealTaskCost({ rows, missing }: { rows: Record<RunTrackId, Record<TaskProfile, readonly TaskCostRow[]>>; missing: Record<RunTrackId, Record<TaskProfile, readonly ProviderId[]>> }) {
  const [tasks, setTasks] = useState(1000);
  const [profile, setProfile] = useState<TaskProfile>("fix-and-test");
  const [track, setTrack] = useState<RunTrackId>("same-machine");
  const list = rows[track][profile];
  const none = missing[track][profile];
  return (
    <div className="surface p-m sm:p-l">
      <div className="flex flex-wrap items-end gap-m">
        <Segmented
          label="Task"
          items={[
            { id: "fix-and-test", label: "Fix and test" },
            { id: "build", label: "Build" },
          ]}
          value={profile}
          onChange={setProfile}
        />
        <Segmented
          label="Machines"
          items={[
            { id: "same-machine", label: "Same machine" },
            { id: "default", label: "Default machines" },
          ]}
          value={track}
          onChange={setTrack}
        />
        <Num wide count label="Tasks a month" value={tasks} onChange={setTasks} min={1} max={10_000_000} step={100} />
      </div>
      <p className="mt-l text-s text-pretty text-neutral-7" aria-live="polite">
        {tasks.toLocaleString("en-US")} {profile === "build" ? "builds" : "fix-and-test runs"} a month, each in a fresh sandbox from create to confirmed delete, {track === "same-machine" ? "each provider asked for 4 vCPU and 8 GB" : "each provider on its default machine"}. Cheapest first.
      </p>
      <ol className="mt-xs">
        {list.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-m gap-y-xxs border-t border-neutral-3 py-s first:border-t-0 sm:grid-cols-[minmax(0,14rem)_8rem_minmax(0,1fr)]">
            <ProviderCell id={r.id} />
            <span className="text-right font-mono text-m text-neutral-10 tabular-nums sm:text-left">{formatUsd(r.usdPerTask * tasks)}</span>
            <span className="col-span-2 text-s text-pretty text-neutral-7 sm:col-span-1">
              {formatUsd(r.usdPerTask)} per completed task, {r.how.toLowerCase()}; {r.completed} of {r.attempts} runs completed
              {r.notes.length > 0 ? <span className="mt-xxs block text-xs text-neutral-7">{r.notes.join("; ")}.</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {none.length > 0 ? (
        <p className="mt-s text-s text-pretty text-neutral-7">
          No measured cost: {none.map((id) => providerName(id)).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
