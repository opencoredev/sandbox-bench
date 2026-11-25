import { Columns } from "@/components/columns";
import type { Column } from "@/components/columns";
import type { Provider } from "@/lib/data";
import { formatGiB } from "@/lib/format";
import { providerColor } from "@/lib/providers";
import { providerName } from "@/lib/providers";
import { advertised, measuredMemoryText, sharedDisk } from "@/lib/sizes";

type Part = "vcpu" | "memoryGiB" | "diskGiB";

const parts = [
  { key: "vcpu", title: "vCPU", format: (v: number) => String(v) },
  { key: "memoryGiB", title: "RAM", format: formatGiB },
  { key: "diskGiB", title: "Disk", format: formatGiB },
] as const satisfies readonly { key: Part; title: string; format: (v: number) => string }[];

const measured = (p: Provider, key: Part) =>
  key === "vcpu" ? p.hardware?.vcpu : key === "memoryGiB" ? p.hardware?.memoryGiB : p.hardware?.diskGiB;

/**
 * Who gives you the biggest machine by default: advertised vCPU, RAM and
 * disk side by side, biggest first. Hover shows what we measured inside.
 */
export function MachineSizes({ providers }: { providers: readonly Provider[] }) {
  return (
    <div className="grid gap-x-l gap-y-xl md:grid-cols-3">
      {parts.map((part) => {
        // A shared file system's size is the host's, not the sandbox's, so it isn't ranked.
        const shared = part.key === "diskGiB" ? providers.filter((p) => sharedDisk[p.id]) : [];
        const columns: Column[] = providers
          .filter((p) => !shared.includes(p))
          .flatMap((p) => {
            const inside = measured(p, part.key);
            // Disk is the one size a provider may not advertise; fall back to what we measured.
            const value = advertised[p.id][part.key] ?? inside;
            return value == null ? [] : [{ p, value, inside }];
          })
          .sort((a, b) => b.value - a.value)
          .map(({ p, value, inside }) => ({ p, value, inside, format: part.key === "memoryGiB" ? (v: number) => measuredMemoryText(p.id, v) : part.format }))
          .map(({ p, value, inside, format }) => ({
            provider: p.id,
            label: format(value),
            segments: [{ value, color: providerColor(p.id), fill: "solid" }],
            detail: [
              advertised[p.id][part.key] == null ? "Not advertised; measured" : (["Advertised", format(value)] as const),
              ...(inside == null ? [] : [["Measured inside", format(inside)] as const]),
            ],
          }));
        return (
          <div key={part.key}>
            <h4 className="text-s font-medium">{part.title}</h4>
            <p className="mt-0.5 mb-xs text-xs text-neutral-7">Default sandbox · Higher is better</p>
            <Columns columns={columns} label={`${part.title} by provider`} compact />
            {shared.length > 0 && (
              <p className="mt-xs text-xs text-neutral-7">
                Not in the chart: {shared.map((p) => `${providerName(p.id)} (${sharedDisk[p.id]})`).join("; ")}.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
