import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import { ChartHead, Footnotes, Who, sentence, trackFootnotes } from "@/components/metric-chart";
import type { Track } from "@/lib/data";
import { fillStyle } from "@/lib/dither";
import { formatShort, formatValue } from "@/lib/format";
import { allocationNotes } from "@/lib/notes";
import { providerColor } from "@/lib/providers";

/** Whether the track recorded SDK readiness for anyone, so the tab has something to show. */
export const hasSdkReady = (track: Track) => Object.keys(track.sdkReady).length > 0;

/**
 * Cold start with our SDK's setup stacked on top: the provider's part in its
 * usual fill, ours hatched, so nobody reads our overhead as theirs.
 */
export function SdkReadyChart({ track }: { track: Track }) {
  const cold = track.metric("cold");
  const machine = allocationNotes(track);
  const rows = track.providers
    .flatMap((p) => {
      const ready = track.sdkReady[p.id];
      const own = cold.values.find((v) => v.provider === p.id)?.p50 ?? null;
      return ready && own !== null ? [{ id: p.id, own, setup: Math.max(ready.setupP50, 0), ready }] : [];
    })
    .sort((a, b) => a.own + a.setup - (b.own + b.setup));
  let next = 0;
  const marks = new Map(rows.flatMap(({ id }) => (machine[id] ? [[id, ++next] as const] : [])));
  const columns: Column[] = rows.map(({ id, own, setup, ready }) => ({
    provider: id,
    label: formatShort(own + setup, "s"),
    mark: marks.get(id),
    segments: [
      { value: own, color: providerColor(id), variant: "gradient" },
      { value: setup, color: providerColor(id), variant: "hatched" },
    ],
    detail: [
      `provider cold start ${formatValue(own, "s")}`,
      `our SDK setup +${formatValue(setup, "s")}`,
      `ready through the SDK, median ${formatValue(ready.p50, "s")}`,
      `${ready.n} cold starts`,
    ],
  }));
  const missing = track.providers.filter((p) => !rows.some((r) => r.id === p.id));
  return (
    <>
      <ChartHead title="Ready through Sandbox SDK" sub="create() until our SDK's handle is ready · Median seconds of each part · Lower is better" />
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--muted)]">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3" style={fillStyle("solid", { color: "var(--muted)" })} />
          Provider cold start, the number on the Cold start tab
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3" style={fillStyle("hatched", { color: "var(--muted)" })} />
          Our SDK&apos;s extra setup, not the provider&apos;s
        </span>
      </div>
      <Columns columns={columns} label="Cold start plus our SDK setup by provider" />
      <Footnotes
        items={[
          ...[...marks].map(([id, mark]) => ({ mark, text: <><Who id={id} />: {sentence(machine[id] ?? "")}</> })),
          {
            text: "The hatched part is work Sandbox SDK does after the sandbox can run commands, such as preparing the workspace. It is ours, so it is kept out of cold start. Each part is its own median, so the stack can differ a little from the median total shown on hover.",
          },
          ...(missing.length > 0 ? [{ text: <>No result for {missing.map((p, i) => <span key={p.id}>{i > 0 ? ", " : ""}<Who id={p.id} /></span>)} (SDK readiness not recorded).</> }] : []),
          ...trackFootnotes(track),
        ]}
      />
    </>
  );
}
