import type { Provider } from "@/lib/data";
import type { ProviderId } from "@/lib/providers";

/**
 * The size each provider advertises for the sandbox we got, from its own docs
 * (checked 2026-10-21), or null where the docs don't say. Measured values sit
 * a little lower because the kernel keeps some memory and the filesystem
 * keeps some disk. `note` explains any gap between advertised and tested.
 */
export const advertised = {
  e2b: {
    vcpu: 2,
    memoryGiB: 0.5,
    diskGiB: null,
    source: "https://e2b.dev/pricing",
    note: "E2B's default base template is 2 vCPU and 512 MB. E2B's pricing page says its default sandbox has 4 GB, so E2B ran smaller here than that.",
  },
  daytona: { vcpu: 1, memoryGiB: 1, diskGiB: 3, source: "https://www.daytona.io/docs/en/sandboxes/", note: null },
  upstash: { vcpu: 2, memoryGiB: 4, diskGiB: 5, source: "https://upstash.com/pricing/box", note: null },
  "upstash-ephemeral": { vcpu: 2, memoryGiB: 4, diskGiB: 5, source: "https://upstash.com/pricing/box", note: null },
  boat: { vcpu: 4, memoryGiB: 8, diskGiB: 50, source: "https://docs.boat.dev/machines", note: null },
  boxd: { vcpu: 2, memoryGiB: 8, diskGiB: 100, source: "https://boxd.sh/", note: null },
  freestyle: { vcpu: 4, memoryGiB: 8, diskGiB: 32, source: "https://www.freestyle.sh/docs/guides/run-hexclave-in-a-sandbox", note: null },
  tenki: {
    vcpu: null,
    memoryGiB: null,
    diskGiB: 5,
    source: "https://tenki.cloud/docs/sandbox/cli.md",
    note: "Tenki documents a 5 GiB default disk but not a default vCPU or RAM, so those are what we measured.",
  },
  superserve: {
    vcpu: 1,
    memoryGiB: 1,
    diskGiB: 4,
    source: "https://docs.superserve.ai",
    note: "Superserve ran a template we built with Node 22 and Python 3.11 preinstalled, at its default 1 vCPU, 1 GB RAM and 4 GB disk. Superserve's own templates have Node (node-22) or Python (python-3.11), not both, and our tests need both.",
  },
} as const satisfies Record<
  ProviderId,
  { vcpu: number | null; memoryGiB: number | null; diskGiB: number | null; source: string; note: string | null }
>;

/** The size to show: advertised where the provider states it, otherwise what we measured inside. */
export function sizeOf(p: Provider) {
  const a = advertised[p.id];
  const m = p.measuredAllocations[0];
  return {
    vcpu: a.vcpu ?? m?.cpu ?? p.hardware?.vcpu ?? null,
    memoryGiB: a.memoryGiB ?? m?.memoryGiB ?? p.hardware?.memoryGiB ?? null,
    diskGiB: a.diskGiB ?? m?.diskGiB ?? p.hardware?.diskGiB ?? null,
  };
}
