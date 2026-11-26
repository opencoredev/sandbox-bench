import { ArrowUpRight } from "lucide-react";

import { JumpLink } from "@/components/jump";
import { ProviderLogo } from "@/components/provider-logo";
import { ProviderName } from "@/components/provider-name";
import type { TrackId } from "@/lib/data";
import { trackInfo } from "@/lib/data";
import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { chartHref, leadText, useCasesFor, weakestText } from "@/lib/use-cases";
import type { UseCaseResult } from "@/lib/use-cases";

/** The section id, for the page and links. */
export const useCasesSection = "best-for";

const Name = ({ id }: { id: ProviderId }) => (
  <span className="font-medium" style={{ color: providerColor(id) }}>
    <ProviderName id={id} />
  </span>
);

const titleLink = "group focus-ring flex items-start justify-between gap-xs rounded-xs";
const titleText = "font-brand text-m font-medium";

/**
 * The card title opens the chart behind the pick. A pick from the other
 * track (sustained CPU ran on Same machine only) loads that track instead of
 * jumping within this one, where the section only says to switch. A card
 * with no result has no chart to open, so its title is plain.
 */
function ChartTitle({ r, track }: { r: UseCaseResult; track: TrackId }) {
  if (!r.pick) return <span className={titleText}>{r.useCase.title}</span>;
  const text = (
    <>
      <span className={`${titleText} group-hover:underline group-hover:decoration-neutral-6 group-hover:underline-offset-4`}>{r.useCase.title}</span>
      <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-neutral-7 group-hover:text-neutral-10" />
    </>
  );
  return r.from === track ? (
    <JumpLink section={r.useCase.chart.section} tab={r.useCase.chart.tab} className={titleLink}>
      {text}
    </JumpLink>
  ) : (
    <a href={chartHref(r)} className={titleLink}>
      {text}
    </a>
  );
}

function UseCaseCard({ r, track }: { r: UseCaseResult; track: TrackId }) {
  const { useCase, pick, tiedWith, next, weakest, caveats, machine, skipped } = r;
  const lead = pick && next ? leadText(pick, next, useCase.unit) : null;
  const ahead = skipped.filter((s) => s.ahead);
  return (
    <li className="surface flex min-w-0 flex-col p-m">
      <h3>
        <ChartTitle r={r} track={track} />
      </h3>
      <p className="mt-xxs text-xs text-pretty text-neutral-7">{useCase.forWhat}</p>
      {pick ? (
        <>
          <p className="mt-s flex min-w-0 items-center gap-xs text-m font-medium" style={{ color: providerColor(pick.provider) }}>
            <span className="hidden shrink-0 min-[360px]:flex">
              <ProviderLogo id={pick.provider} size={18} />
            </span>
            <span className="min-w-0 truncate">
              <ProviderName id={pick.provider} />
            </span>
            <span className="ml-auto shrink-0 font-mono text-m text-neutral-10 tabular-nums">{pick.display}</span>
          </p>
          {tiedWith.length > 0 ? (
            <p className="mt-xxs text-xs text-pretty text-neutral-8">
              Tied with{" "}
              {tiedWith.map((e, i) => (
                <span key={e.provider}>
                  {i === 0 ? "" : i === tiedWith.length - 1 ? " and " : ", "}
                  <Name id={e.provider} /> ({e.display})
                </span>
              ))}
            </p>
          ) : null}
          {caveats.map(({ provider, caveat }) => (
            <p key={provider} className="mt-xxs text-xxs text-pretty text-neutral-8">
              {tiedWith.length > 0 ? (
                <>
                  <Name id={provider} />:{" "}
                </>
              ) : null}
              {caveat.detail}.
            </p>
          ))}
          <p className="mt-s text-xs text-pretty text-neutral-8">
            {useCase.measure}
            {pick.note ? `; ${pick.note}` : ""}.
          </p>
          <dl className="mt-s grid grid-cols-[auto_minmax(0,1fr)] gap-x-s gap-y-xxs text-xs text-neutral-7">
            {next ? (
              <>
                <dt>Next</dt>
                <dd className="min-w-0 text-pretty">
                  <Name id={next.provider} /> {next.display}
                  {lead ? ` · ${lead}` : ""}
                </dd>
              </>
            ) : null}
            {ahead.length > 0 ? (
              <>
                <dt>Not counted</dt>
                <dd className="min-w-0 text-pretty">
                  {ahead.map((s, i) => (
                    <span key={s.provider}>
                      {i > 0 ? "; " : ""}
                      <Name id={s.provider} /> {s.why}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {weakest ? (
              <>
                <dt>Weakest</dt>
                <dd className="min-w-0 text-pretty">{weakestText(weakest, track)}</dd>
              </>
            ) : null}
          </dl>
          {machine.map(({ provider, note }) => (
            <p key={provider} className="mt-xs text-xxs text-pretty text-neutral-7">
              <Name id={provider} /> {note}
            </p>
          ))}
        </>
      ) : (
        <p className="mt-s text-s text-pretty text-neutral-7">
          {skipped.length > 0 ? (
            <>
              No eligible result. Not counted:{" "}
              {skipped.map((s, i) => (
                <span key={s.provider}>
                  {i > 0 ? "; " : ""}
                  <Name id={s.provider} /> {s.why}
                </span>
              ))}
              .
            </>
          ) : (
            "No provider has a result yet."
          )}
        </p>
      )}
      {useCase.onlyOn && useCase.onlyOn !== track ? <p className="mt-auto pt-s text-xxs text-pretty text-neutral-7">From {trackInfo[useCase.onlyOn].label}, the only track it ran on.</p> : null}
      {useCase.gap ? <p className="mt-auto pt-s text-xxs text-pretty text-neutral-7">{useCase.gap}</p> : null}
    </li>
  );
}

/**
 * One card per kind of job: the pick, what it measured, the next provider and
 * where the pick ranks worst among the other cards, so a reader sees the
 * trade-off with the pick. Every card is computed (lib/use-cases.ts).
 */
export function UseCases({ track }: { track: TrackId }) {
  const results = useCasesFor(track);
  return (
    <>
      <ul className="grid gap-s sm:grid-cols-2 lg:grid-cols-4">
        {results.map((r) => (
          <UseCaseCard key={r.useCase.id} r={r} track={track} />
        ))}
      </ul>
      <p className="mt-m max-w-[80ch] text-s text-pretty text-neutral-8">
        Each pick is the best median on its card&apos;s measure, among providers on the CPU tier a new account gets. Medians inside each other&apos;s 95% intervals tie; real tasks, resume and cost have no interval, so only equal printed values tie. A real task pick allows at most one incomplete run, and Cheapest needs the provider&apos;s own bill or usage meter. Weakest is where the pick ranks lowest on the other cards. No provider paid for or chose a pick. As data:{" "}
        <a className="focus-ring rounded-xs underline decoration-dotted underline-offset-4 hover:text-neutral-10" href="use-cases.json">
          use-cases.json
        </a>
        .
      </p>
    </>
  );
}
