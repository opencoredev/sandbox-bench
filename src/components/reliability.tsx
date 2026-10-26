import { Disclosure } from "@/components/disclosure";
import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead } from "@/components/metric-chart";
import { ProviderName } from "@/components/provider-name";
import type { Provider, Track } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { providerColor, providerName } from "@/lib/providers";
import { successRate } from "@/lib/status";

/** Shorter wording for the raw failure messages that need it. */
const plain = (reason: string) =>
  reason
    .replace(/^getaddrinfo ETIMEOUT \S+$/, "DNS lookup for the preview URL timed out")
    .replace(/^Scenario timed out after 600000ms$/, "Hung for 10 minutes")
    .replace(/\.$/, "");

type Failure = Provider["failureReasons"][number];

/** The structured cause, where the export records one: "HTTP 503 · sandbox_unavailable · during create". */
export function causeText(f: Failure) {
  const parts = [
    typeof f.status === "number" ? `HTTP ${f.status}` : null,
    f.code ?? null,
    f.stage ? `during ${f.stage}` : null,
  ].filter((x) => x !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const Cause = ({ f }: { f: Failure }) => {
  const cause = causeText(f);
  return (
    <>
      {plain(f.reason)}
      {cause ? <span className="mt-0.5 block font-mono text-xxs text-neutral-7">{cause}</span> : null}
    </>
  );
};

/**
 * Failed attempts per 1,000, fewest first, with every cause behind one
 * disclosure so the section stays a single chart until someone asks. Only
 * failures the provider caused are here; Method lists the ones set aside.
 */
export function Reliability({ track }: { track: Track }) {
  const ranked = track.providers
    .map((p) => {
      const s = successRate(track, p);
      return { p, s, perThousand: s.attempts ? ((s.attempts - s.succeeded) / s.attempts) * 1000 : 0 };
    })
    .sort((a, b) => a.perThousand - b.perThousand);
  const columns: Column[] = ranked.map(({ p, s, perThousand }) => ({
    provider: p.id,
    label: perThousand.toFixed(1),
    segments: [{ value: perThousand, color: "var(--error)", fill: "solid" }],
    detail: [`${formatCount(s.attempts - s.succeeded)} of ${formatCount(s.attempts)} attempts failed`],
  }));
  const rows = ranked.flatMap(({ p }) => p.failureReasons.map((f, i) => ({ p, f, first: i === 0 })));
  const runs = rows.reduce((sum, { f }) => sum + f.runs, 0);

  return (
    <>
      <ChartHead title="Failed attempts" sub="Per 1,000 attempts across the tests on this page · Lower is better" />
      <Columns columns={columns} label="Failed attempts per 1,000" />

      <Disclosure
        className="mt-l"
        triggerClassName="text-start"
        summary={
          <span>
            Every failure and its cause{" "}
            <span className="font-normal text-neutral-7">
              · {runs} {runs === 1 ? "run" : "runs"} across {new Set(rows.map((r) => r.p.id)).size} providers
            </span>
          </span>
        }
      >
        {/* Phones: one block per provider, every cause on its own lines, nothing cut off. */}
        <ul className="flex flex-col gap-s sm:hidden">
          {ranked.flatMap(({ p }) =>
            p.failureReasons.length === 0
              ? []
              : [
                  <li key={p.id}>
                    <p className="text-s font-medium" style={{ color: providerColor(p.id) }}>
                      <ProviderName id={p.id} />
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-xs">
                      {p.failureReasons.map((f) => (
                        <li key={f.reason} className="text-s">
                          <span className="font-mono tabular-nums">{f.runs}×</span> <Cause f={f} />
                          <span className="block text-xs text-neutral-7">
                            {f.tests.length > 3 ? `${f.tests.length} tests` : f.tests.join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>,
                ],
          )}
        </ul>
        <div className="relative hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="text-xs text-neutral-7">
                {["Provider", "Runs", "Cause", "Tests"].map((h) => (
                  <th key={h} scope="col" className="px-m py-xs font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, f, first }) => (
                <tr key={`${p.id}${f.reason}`} className={first ? "[&>*]:pt-s" : ""}>
                  <th scope="row" className="px-m py-1.5 align-top font-medium whitespace-nowrap" style={{ color: providerColor(p.id) }}>
                    {first ? <ProviderName id={p.id} /> : <span className="sr-only">{providerName(p.id)}</span>}
                  </th>
                  <td className="px-m py-1.5 align-top font-mono tabular-nums">{f.runs}</td>
                  <td className="px-m py-1.5 align-top">
                    <Cause f={f} />
                  </td>
                  <td className="px-m py-1.5 align-top text-neutral-7">
                    {f.tests.length > 3 ? `${f.tests.length} tests` : f.tests.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </>
  );
}
