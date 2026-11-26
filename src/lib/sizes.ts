import type { Provider } from "@/lib/data";
import { formatGiB } from "@/lib/format";
import type { ProviderId } from "@/lib/providers";

/**
 * Providers whose sizes are sold in decimal GB (10^9 bytes), not GiB. Their
 * priced tiers carry the tier's GB number in the harness's `memoryGiB` field
 * (Buddy's 4x8 is 8 GB, 7.45 GiB), and the gap to the GiB the size name
 * suggests is what marks Buddy's 4x8 as a different machine, so their memory
 * is always written with its unit: GB for the tier, GiB to two decimals for
 * what was measured. Every other provider keeps the site's rounded "8 GB".
 */
const decimalMemory = ["buddy"] as const satisfies readonly ProviderId[];
export const soldInDecimalGB = (id: ProviderId) => decimalMemory.some((x) => x === id);

const GIB_PER_GB = 1e9 / 2 ** 30;
/** A tier's decimal GB in GiB: 8 GB is 7.45 GiB. */
export const gbToGiB = (gb: number) => gb * GIB_PER_GB;

/** Measured memory in GiB as a provider's labels need it: "7.45 GiB" for a decimal-GB seller, the site's rounded "7.8 GB" otherwise. */
export const measuredMemoryText = (id: ProviderId, gib: number) => (soldInDecimalGB(id) ? `${gib.toFixed(2)} GiB` : formatGiB(gib));

/** Measured disk in GiB as a provider's labels need it: "45.5 GiB" for a decimal-GB seller, the site's rounded "46 GB" otherwise. */
export const measuredDiskText = (id: ProviderId, gib: number) => (soldInDecimalGB(id) ? `${gib.toFixed(1)} GiB` : formatGiB(gib));

/** Advertised capacity in chart tooltips: shows both decimal GB and binary GiB for decimal-GB sellers. */
export function advertisedCapacityText(id: ProviderId, key: "memoryGiB" | "diskGiB", gib: number) {
  if (!soldInDecimalGB(id)) return formatGiB(gib);
  const gb = Math.round(gib / GIB_PER_GB);
  return `${gb} GB (${key === "memoryGiB" ? gib.toFixed(2) : gib.toFixed(1)} GiB)`;
}

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
    source: "https://luxor.ai/docs/sandbox/cli.md",
    note: "Luxor documents a 5 GiB default disk but not a default vCPU or RAM, so those are what we measured.",
  },
  superserve: {
    vcpu: 1,
    memoryGiB: 1,
    diskGiB: 4,
    source: "https://docs.superserve.ai",
    note: "Superserve ran a template we built with Node 22 and Python 3.11 preinstalled, at its default 1 vCPU, 1 GB RAM and 4 GB disk. Superserve's own templates have Node (node-22) or Python (python-3.11), not both, and our tests need both.",
  },
  vercel: {
    vcpu: null,
    memoryGiB: null,
    diskGiB: null,
    source: "https://vercel.com/docs/vercel-sandbox",
    note: "Vercel gives 2048 MiB per vCPU and has no disk setting. The sources we checked don't state its default vCPU count, so the size shown is what we measured.",
  },
  modal: {
    vcpu: 0.125,
    memoryGiB: 0.125,
    diskGiB: null,
    source: "https://modal.com/docs/guide/sandbox-resources",
    note: "Modal's default is a request of 0.125 CPU (Modal counts a CPU as a physical core) and 128 MiB, which bursts into spare host capacity, up to 16 CPUs above the request. Inside, the sandbox shows the host's whole memory. Modal bills the higher of the request and what the sandbox uses.",
  },
  baseten: {
    vcpu: 2,
    memoryGiB: 4,
    diskGiB: null,
    source: "https://docs.baseten.co/reference/management-api/sandboxes/create-a-sandbox",
    note: "Baseten's default is 4096 MB of memory, which sets 2 vCPU (2048 MB per vCPU). It has no disk: files live in the sandbox's memory and count against it.",
  },
  instabox: {
    vcpu: 4,
    memoryGiB: 8,
    diskGiB: 20,
    source: "https://instabox.sh/docs/account/limits.md",
    note: "Instabox's default agent-browser template: 4 vCPU, 8 GiB and a 20 GiB /data disk, where /workspace lives, plus a 16 GiB system disk. The same machine is its default and its 4 vCPU, 8 GB size.",
  },
  beam: {
    vcpu: 1,
    memoryGiB: 0.125,
    diskGiB: null,
    source: "https://docs.beam.cloud/v2/reference/ts-sdk.md",
    note: "Beam's default sandbox is 1 CPU and 128 MiB, enforced as the sandbox's memory limit. That is too little memory for our dev server and Python install, which were killed for running out of it, and for both realistic workloads. Beam has no disk setting and doesn't bill disk.",
  },
  maritime: {
    vcpu: 2,
    memoryGiB: 4,
    diskGiB: 12,
    source: "https://maritime.sh/docs/billing",
    note: "Maritime's default is its small preset: 2 vCPU, 4 GiB RAM and a 12 GiB disk. On the same-machine track it ran its medium preset, 4 vCPU, 8 GiB RAM and a 50 GiB disk.",
  },
  styne: {
    vcpu: 4,
    memoryGiB: 8,
    diskGiB: 51,
    source: "https://docs.styne.ai/guide-templates",
    note: "Styne's default base template is 4 vCPU, 8 GiB RAM and a 51 GiB root disk, so both tracks ran the same machine.",
  },
  microsandbox: {
    vcpu: 1,
    memoryGiB: 0.5,
    diskGiB: 4,
    source: "https://docs.microsandbox.dev",
    note: "Microsandbox Cloud's default sandbox, with no size asked for, is 1 vCPU, 512 MiB RAM and a 4 GiB root disk. That is too small for both realistic workloads. On the same-machine track it ran at 4 vCPU, 8 GiB RAM and a 64 GiB disk.",
  },
  // Microsandbox's Shared tier ran on Same machine only; the default size is Microsandbox's.
  "microsandbox-shared": {
    vcpu: 1,
    memoryGiB: 0.5,
    diskGiB: 4,
    source: "https://docs.microsandbox.dev",
    note: "Microsandbox's Shared tier is the same sandbox as Microsandbox, on shared vCPUs; it ran on Same machine only, at 4 vCPU, 8 GiB and a 64 GiB disk.",
  },
  buddy: {
    vcpu: 2,
    memoryGiB: 3.73,
    diskGiB: 46.6,
    source: "https://buddy.works/docs/sandboxes/configuration.md",
    note: "Buddy's default is its 2x4 size: 2 vCPU and 4 GB of RAM, in decimal GB, so 3.73 GiB inside, and a 50 GB disk, of which 45.5 GiB is usable. On the same-machine track it ran its 4x8 size: 4 vCPU and 8 GB, 7.45 GiB inside, which is why it shows as machine differs there; Buddy has no 8 GiB size.",
  },
  archil: {
    vcpu: 1,
    memoryGiB: 2,
    diskGiB: null,
    source: "https://docs.archil.com/api-reference/sandboxes/create-sandbox.md",
    note: "Archil's default sandbox is 1 vCPU and 2048 MiB on its node:24-bookworm image; the 4 vCPU, 8 GiB size is asked for as 4 vCPU and 8192 MiB. Archil has no disk setting: the root disk is about 1 TB and fixed.",
  },
  // Beam's CPU tiers ran on Same machine only, where every size is asked for; the default size is Beam's.
  "beam-shared": {
    vcpu: 1,
    memoryGiB: 0.125,
    diskGiB: null,
    source: "https://docs.beam.cloud/v2/sandbox/configuration.md",
    note: "Beam's Shared tier is the same sandbox as Beam, on shared vCPUs; it ran on Same machine only, at 4 vCPU and 8 GB.",
  },
  "beam-spot": {
    vcpu: 1,
    memoryGiB: 0.125,
    diskGiB: null,
    source: "https://docs.beam.cloud/v2/sandbox/configuration.md",
    note: "Beam's Spot tier is the same sandbox as Beam, on spare capacity; it ran on Same machine only, at 4 vCPU and 8 GB.",
  },
} as const satisfies Record<
  ProviderId,
  { vcpu: number | null; memoryGiB: number | null; diskGiB: number | null; source: string; note: string | null }
>;

/**
 * Providers whose sandbox sees a shared file system instead of a disk of its own, so what we
 * measure inside is the host's capacity, not an allocation. Their disk is left out of sizes and
 * the disk chart, with this reason beside it.
 */
export const sharedDisk: Partial<Record<ProviderId, string>> = {
  beam: "no disk of its own: the root file system is a shared mount reporting the host's whole disk, about 21 TB",
  "beam-shared": "no disk of its own: the root file system is a shared mount reporting the host's whole disk",
  "beam-spot": "no disk of its own: the root file system is a shared mount reporting the host's whole disk",
};

/** The size to show: advertised where the provider states it, otherwise what we measured inside. */
export function sizeOf(p: Provider) {
  const a = advertised[p.id];
  const m = p.measuredAllocations[0];
  return {
    vcpu: a.vcpu ?? m?.cpu ?? p.hardware?.vcpu ?? null,
    memoryGiB: a.memoryGiB ?? m?.memoryGiB ?? p.hardware?.memoryGiB ?? null,
    diskGiB: sharedDisk[p.id] ? null : (a.diskGiB ?? m?.diskGiB ?? p.hardware?.diskGiB ?? null),
  };
}
