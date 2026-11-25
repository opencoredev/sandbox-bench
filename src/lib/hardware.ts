import type { ProviderId } from "@/lib/providers";

/**
 * What each provider's sandboxes run on, from a hardware probe run inside
 * one default and one 4 vCPU sandbox per provider on Oct 22, 2026, checked
 * against the benchmark's own fingerprints. Only what the evidence supports:
 * a chip the CPU names itself is "named", one worked out from its model
 * number, cache and clock is "inferred", and Luxor's, which reports two
 * different chips, is "conflicting".
 */
export type ChipBasis = "named" | "inferred" | "conflicting";

export type MemoryType =
  | { kind: "known"; type: "DDR4" | "DDR5"; basis: "measured" | "inferred"; detail: string }
  | { kind: "unknown"; why: string };

export interface HardwareDetail {
  chip: string;
  /** Microarchitecture and clock. */
  family: string;
  chipBasis: ChipBasis;
  memory: MemoryType;
  cloud: string;
  region: string;
  /** The region in a word or two, for a badge: "Virginia". Null where the sandbox does not show it. */
  regionShort: string | null;
  /** Where the provider's API is, for a badge when the sandbox's own location isn't shown: "Oregon". */
  apiRegionShort?: string;
  /** Where outbound traffic leaves, for a badge when the sandbox's own hosting region isn't proven: "Germany". */
  egressRegionShort?: string;
  runsAs: string;
  runsAsDetail: string;
  storage: string;
  kernel: string;
  /** What the sandbox hides or reports differently from the real machine, in plain words. */
  hidden: readonly string[];
  /** How the 4 vCPU, 8 GB sandbox differed, when it did. */
  sameSpec: string | null;
}

/** "Sandbox in Virginia"; "API in Oregon" or "Outbound IP in Germany" when hosting isn't proven; else "Location not shown". */
export const locationLabel = (
  h: Pick<HardwareDetail, "regionShort" | "apiRegionShort" | "egressRegionShort">,
  lead: "Sandbox in" | "Runs in",
) =>
  h.regionShort
    ? `${lead} ${h.regionShort}`
    : h.apiRegionShort
      ? `API in ${h.apiRegionShort}`
      : h.egressRegionShort
        ? `Outbound IP in ${h.egressRegionShort}`
        : "Location not shown";

export const probeDate = "Oct 22, 2026";

/** Providers whose entry comes from the benchmark's fingerprints of their runs, and when, one group per run date. */
export const fromFingerprints = [
  { providers: ["vercel", "modal"], date: "Nov 9, 2026" },
  { providers: ["baseten"], date: "Nov 12 and 13, 2026" },
  { providers: ["instabox", "beam"], date: "Nov 18, 2026" },
  { providers: ["maritime"], date: "Nov 23 and 24, 2026" },
  { providers: ["styne"], date: "Nov 23, 2026" },
  { providers: ["buddy"], date: "Nov 25, 2026" },
  { providers: ["microsandbox"], date: "Nov 25, 2026" },
] as const satisfies readonly { providers: readonly ProviderId[]; date: string }[];

/** When a provider's hardware entry was read from its runs' fingerprints, or null when it comes from the probe. */
export function fingerprintDate(id: ProviderId): string | null {
  return fromFingerprints.find((g) => (g.providers as readonly ProviderId[]).includes(id))?.date ?? null;
}

export const chipBasisLabel = {
  named: "named by the CPU",
  inferred: "inferred",
  conflicting: "conflicting",
} as const satisfies Record<ChipBasis, string>;

/**
 * Only providers with hardware evidence. Vercel Sandbox, Modal, Baseten, Instabox, Beam, Maritime, Styne and Buddy
 * come from the benchmark's own fingerprints (every sample of their runs: CPU
 * model and features, cgroup limits, disks, kernel, outbound IP), not the
 * Oct 22 probe; `fromFingerprints` lists them with their run dates. A provider without an entry
 * shows as not probed, never with guessed hardware.
 */
export const hardware: Partial<Record<ProviderId, HardwareDetail>> = {
  e2b: {
    chip: "Intel Xeon Platinum 8373C",
    family: "Ice Lake, 2.6 GHz, 54 MB L3",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR4", basis: "inferred", detail: "DDR4-3200, the chip's memory type" },
    cloud: "Google Cloud",
    region: "us-west1, The Dalles, Oregon",
    regionShort: "Oregon",
    runsAs: "Firecracker microVM",
    runsAsDetail: "nested inside a Google Cloud VM",
    storage: "23 GB virtio disk, ext4",
    kernel: "Linux 6.1, Debian 12",
    hidden: [
      "The CPU name, microcode and clock leaves are hidden. The chip is identified from its model number, cache size and 2.6 GHz clock.",
      "The default 2 vCPUs are one physical core with two hyperthreads, so two-thread work scales well below twice one thread.",
      "No DMI or PCI devices, so the memory type can't be read inside; DDR4 follows from the chip.",
    ],
    sameSpec: "The 4 vCPU, 8 GB template ran on the same CPU in the same region: two cores with two threads each.",
  },
  daytona: {
    chip: "AMD EPYC 9354P, 9354, 9254 or 9275F",
    family: "Zen 4 (Genoa); the 9275F is Zen 5 (Turin). Hosts vary",
    chipBasis: "named",
    memory: { kind: "known", type: "DDR5", basis: "measured", detail: "Registered DDR5, read from the memory controller on a 9254 host" },
    cloud: "Bare-metal servers",
    region: "Location not visible; control plane on AWS us-east-1",
    regionShort: null,
    apiRegionShort: "Virginia",
    runsAs: "Docker container",
    runsAsDetail: "shares the host's kernel; cgroups set its CPU and RAM",
    storage: "3 GB container disk (10 GB at 4 vCPU) on the host's NVMe RAID",
    kernel: "Host kernel 6.17 (Ubuntu 24.04), Debian 13 userland",
    hidden: [
      "Nothing at the CPU level is hidden: the real CPU name, microcode, server model (Dell PowerEdge R6615 in the probe, a Supermicro AS-2115GT-HNTR in the benchmark) and disks are visible.",
      "nproc and lscpu show every host thread (48 or 64) and /proc/meminfo shows the host's RAM, while the default sandbox may use 1 CPU and 1 GB. Tools that size thread pools or caches from those numbers oversubscribe.",
      "Hosts differ in clock speed, so single-thread results vary from sandbox to sandbox. Neighbours share the host kernel.",
      "Outbound internet is blocked on our account tier, so the sandbox's own network location could not be read.",
    ],
    sameSpec: null,
  },
  upstash: {
    chip: "AWS Graviton4",
    family: "Arm Neoverse V2, 2.8 GHz; Graviton4 from the m8g instance type",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5-5600, from AWS's Graviton4 spec" },
    cloud: "AWS EC2",
    region: "us-east-1, Ashburn, Virginia",
    regionShort: "Virginia",
    runsAs: "Docker container",
    runsAsDetail: "on a shared m8g.16xlarge VM; cgroups set its CPU and RAM",
    storage: "5 GB overlay root and a 5 GB /workspace, on EBS",
    kernel: "Host kernel 7.0 (Ubuntu 24.04 for AWS), Debian 12 userland",
    hidden: [
      "The only Arm provider here: x86-only binaries don't run, and compile and run times differ for that reason alone.",
      "nproc and /proc/meminfo show the host's 64 CPUs and 256 GB, while a box may use 2 CPUs and 4 GB (4 and 8 at the medium size).",
      "No DMI tables or clock readings inside, so memory type and clock come from AWS's published spec.",
      "Neighbours share the host kernel and the chip's L3 cache.",
    ],
    sameSpec: "The medium size (4 vCPU, 8 GB) runs on the same m8g.16xlarge hosts.",
  },
  "upstash-ephemeral": {
    chip: "AWS Graviton4",
    family: "Arm Neoverse V2; Graviton4 from the m8gd instance type",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5-5600, from AWS's Graviton4 spec" },
    cloud: "AWS EC2",
    region: "us-east-1, Ashburn, Virginia",
    regionShort: "Virginia",
    runsAs: "Container",
    runsAsDetail: "Ephemeral Box, on a shared AWS m8gd.12xlarge host",
    storage: "5 GB at the small size, 20 GB at medium, as measured inside",
    kernel: "Host kernel 7.0 (Ubuntu 24.04 for AWS)",
    hidden: [
      "The only Arm provider here: x86-only binaries don't run, and compile and run times differ for that reason alone.",
      "Our deeper hardware probe ran on Upstash's regular Box. For Ephemeral Box we have the benchmark's own fingerprints: the AWS host type, the shared host kernel and the Arm architecture.",
      "Memory type and clock come from AWS's published Graviton4 spec, not from inside the box.",
    ],
    sameSpec: "The medium size (4 vCPU, 8 GB) runs on the same m8gd.12xlarge hosts.",
  },
  boxd: {
    chip: "AMD EPYC 9354P, likely",
    family: "Zen 4 (Genoa), 3.25 GHz",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5-4800, the Genoa platform's memory" },
    cloud: "Latitude.sh bare metal",
    region: "New York, US",
    regionShort: "New York",
    runsAs: "Firecracker microVM",
    runsAsDetail: "with Docker installed inside the VM",
    storage: "100 GB virtio disk, ext4",
    kernel: "Linux 6.18 (custom build), Ubuntu 24.04",
    hidden: [
      "The CPU name is trimmed to \"AMD EPYC\" and the microcode and topology are hidden. The chip is inferred from its 3.25 GHz clock (read in New York on Nov 4; the Frankfurt hosts probed on Oct 22 ran at 3.1 GHz) and the Genoa servers Latitude.sh sells; a dual-socket 9354 can't be ruled out.",
      "No DMI, so the memory type is inferred.",
      "AVX-512 is exposed, which can help vectorised work against hosts that hide it.",
      "The disk reports itself as rotational although it is virtual, so tools that tune for hard drives may behave differently.",
    ],
    sameSpec: "The 4 vCPU, 16 GB size ran on the same CPU type.",
  },
  freestyle: {
    chip: "AMD EPYC 7763, likely",
    family: "Zen 3 (Milan), 2.45 GHz",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR4", basis: "inferred", detail: "DDR4-3200, the Milan platform's memory" },
    cloud: "Freestyle's own network (AS36320)",
    region: "San Francisco Bay Area",
    regionShort: "SF Bay Area",
    runsAs: "Firecracker microVM",
    runsAsDetail: "4 vCPU, 8 GB, no hyperthreads exposed",
    storage: "32 GB virtio disk, ext4",
    kernel: "Linux 6.1",
    hidden: [
      "The CPU name, microcode and topology are hidden. The chip is inferred from its 2.45 GHz clock, cache and Zen 3 features.",
      "Memory is added after boot: about 3 GB is free at first, 7.9 GB later.",
      "No DMI, so the memory type is inferred.",
    ],
    sameSpec: null,
  },
  tenki: {
    chip: "AMD EPYC 7B13, as reported",
    family: "Zen 3 (Milan), 2.25 GHz. The 4 vCPU VM also showed EPYC 9575F (Zen 5, Turin) cores",
    chipBasis: "conflicting",
    memory: { kind: "unknown", why: "No memory data inside the VM" },
    cloud: "Luxor's own network (AS19538)",
    region: "Seattle",
    regionShort: "Seattle",
    runsAs: "Cloud Hypervisor microVM",
    runsAsDetail: "with a container inside",
    storage: "5 GB virtio disk, ext4",
    kernel: "Linux 6.18",
    hidden: [
      "On the 4 vCPU VM, two vCPUs report an EPYC 7B13 (Milan) and two an EPYC 9575F (Turin). That fits a snapshot taken on a Milan host and restored on a Turin one, so the real host may be newer than the name says.",
      "CPU features are capped at the Milan set on every vCPU, so no AVX-512 even on Turin.",
      "The clock reads 2.25 GHz, the 7B13's base, which may be carried over from the snapshot.",
    ],
    sameSpec: "The 4 vCPU, 8 GB VM is the one that showed both chips.",
  },
  superserve: {
    chip: "Intel Xeon, Sapphire Rapids",
    family: "Likely Xeon Platinum 8481C; 2.2 GHz, 105 MB L3",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5, the Sapphire Rapids platform's memory" },
    cloud: "Google Cloud",
    region: "us-east4, Northern Virginia, from its IP range",
    regionShort: "Virginia",
    runsAs: "Firecracker microVM",
    runsAsDetail: "likely inside a Google Cloud VM",
    storage: "4 GB virtio disk, ext4",
    kernel: "Linux 4.14, Debian 12",
    hidden: [
      "The CPU name and microcode are hidden. The chip family is clear from its model number; the exact SKU is not.",
      "The old 4.14 guest kernel can't turn on the chip's AMX units, so AMX workloads can't use them.",
      "No DMI, so the memory type is inferred.",
    ],
    sameSpec: null,
  },
  boat: {
    chip: "AMD Ryzen 9 9950X",
    family: "Zen 5 (Granite Ridge), 4.3 GHz base, up to 5.7 GHz",
    chipBasis: "named",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5, the only memory the chip takes" },
    cloud: "OVHcloud dedicated servers",
    region: "Northern France",
    regionShort: "Northern France",
    runsAs: "QEMU/KVM virtual machine",
    runsAsDetail: "on a desktop-class chip",
    storage: "70 GB virtio disk, ext4",
    kernel: "Linux 7.0, Ubuntu 24.04",
    hidden: [
      "A desktop chip with a high boost clock, so single-thread results depend on boost and neighbours.",
      "The cache sizes the guest sees are synthetic and differ from the real chip.",
    ],
    sameSpec: null,
  },
  vercel: {
    chip: "Intel Xeon, Ice Lake on most hosts, Cascade Lake on the rest",
    family: "Likely Xeon Platinum 8375C at 2.9 GHz; the rest a 2.5 GHz Cascade Lake part",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR4", basis: "inferred", detail: "DDR4, the memory both chip generations take" },
    cloud: "AWS, from its outbound IPs",
    region: "Outbound IPs are Amazon's in Ashburn, Virginia, consistent with us-east-1; that is where traffic leaves, not proof of where the sandbox runs",
    regionShort: "Virginia",
    runsAs: "microVM",
    runsAsDetail: "per Vercel's docs; inside, a hypervisor flag, virtual disks and Linux 6.18",
    storage: "64 GiB virtual disk, XFS, plus a second disk reported as 33 GiB",
    kernel: "Linux 6.18, Ubuntu 26.04",
    hidden: [
      "The CPU names itself only as a generic Intel Xeon at 2.90 or 2.50 GHz. The 2.9 GHz parts have Ice Lake's instructions (VAES, GFNI); the 2.5 GHz ones don't, which fits Cascade Lake. About 4 in 5 sandboxes landed on the 2.9 GHz parts.",
      "No DMI, so the memory type is inferred from the chips.",
      "It runs as a regular user, ubuntu, with sudo.",
    ],
    sameSpec: "The 4 vCPU, 8 GB size ran on the same CPUs in the same region, with an 8 GiB memory limit and no CPU quota.",
  },
  beam: {
    chip: "Intel Xeon, Sapphire Rapids or later",
    family: "From CPU features: AMX and AVX-512 FP16, first in Sapphire Rapids; gVisor hides the model and clock",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5, the only memory those chips take" },
    cloud: "OVHcloud, from its outbound IPs",
    region: "Outbound IPs are OVH's in Warrenton, Virginia; that is where traffic leaves, not proof of where the sandbox runs",
    regionShort: "Virginia",
    runsAs: "gVisor sandbox",
    runsAsDetail: "a user-space kernel between the workload and the host, in a container",
    storage: "A shared 9p root file system that reports the host's whole disk (about 21 TB); Beam has no disk setting and doesn't bill disk",
    kernel: "gVisor, reporting Linux 4.19; Debian 12 (node:22-bookworm, our image; Beam's own is Ubuntu 22.04 without Node)",
    hidden: [
      "gVisor hides the CPU name and block devices. The chip comes from CPU features: AMX and AVX-512 FP16, first shipped in Sapphire Rapids, on every sandbox.",
      "The root file system is a 9p mount that reports the host's whole disk, not a per-sandbox size.",
      "It runs as root, with no sudo.",
    ],
    sameSpec: "The 4 vCPU, 8 GB size ran with a 4-CPU quota and an 8 GiB memory limit on the same CPU type and network.",
  },
  modal: {
    chip: "Not named; AMD and Intel feature sets",
    family: "From CPU features: AMD Zen 4 or later on most sandboxes, some Zen 5-class; Intel mostly Ice Lake-like, one Cascade Lake-like",
    chipBasis: "inferred",
    memory: { kind: "unknown", why: "gVisor hides the hardware, and the hosts vary" },
    cloud: "Outbound networks: Rackdog, Amazon, Microsoft and Google",
    region: "Configured for us-east; outbound IPs geolocate to Ashburn, Boydton and Dulles Town Center, Virginia, New York City and Washington, DC. These are where traffic leaves, not proof of where the sandbox runs",
    regionShort: "US East",
    runsAs: "gVisor sandbox",
    runsAsDetail: "a user-space kernel between the workload and the host",
    storage: "512 GiB overlay root as reported; no block devices visible",
    kernel: "gVisor, reporting Linux 4.19; Debian 12",
    hidden: [
      "gVisor hides the CPU name, DMI and block devices, so the chip and memory can't be read inside. The families come from CPU features: AMD flags (SSE4a, SVM) on about 65% of sandboxes on the default size and 70% on 4 vCPU, 8 GB, with AVX-512 BF16 (Zen 4 or later) and on some VP2INTERSECT (Zen 5-class). The rest show Intel sets, mostly fitting Ice Lake; one sandbox's set fits Cascade Lake.",
      "On its default size the sandbox reports 1 CPU, a CPU quota of 16.125 and about 203 to 1,024 GiB of memory. Those readings don't establish the host's RAM or how much is usable: the sandbox requests 0.125 CPU and 128 MiB, and Modal bills use above that.",
      "It runs as root.",
    ],
    sameSpec: "The 4 vCPU, 8 GB size ran with a 4-CPU quota and an 8 GiB limit on the same mix of hosts.",
  },
  baseten: {
    chip: "Intel Xeon, Sapphire Rapids or later",
    family: "From CPU features: AMX and AVX-512 FP16, first in Sapphire Rapids; the model and clock are hidden",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5, the only memory those chips take" },
    cloud: "AWS, from its outbound IPs",
    region: "Outbound IPs are Amazon's in Boardman, Oregon, consistent with us-west-2; that is where traffic leaves, not proof of where the sandbox runs",
    regionShort: "Oregon",
    runsAs: "virtual machine",
    runsAsDetail: "a hypervisor flag and Linux 6.12 inside; Baseten's docs don't name the isolation",
    storage: "No disk: files live in the sandbox's memory, on an overlay of about 3 GiB on the default size",
    kernel: "Linux 6.12, Alpine Linux 3.21",
    hidden: [
      "The CPU names itself only as a generic Intel Xeon Processor, with no model number or clock. Its AMX and AVX-512 FP16 instructions first shipped in Sapphire Rapids, so it is that generation or later. Every sandbox showed the same feature set.",
      "Files count against memory: Baseten keeps the file system in RAM, so a large workspace leaves less memory to run in. Our build workload needed an 8 GiB volume for its files.",
      "Outbound traffic is IPv6-only for now, so a raw IPv4 address can't be reached; hostnames work.",
      "No DMI, so the memory type is inferred from the chips. It runs as root.",
    ],
    sameSpec: "The 4 vCPU, 8 GB size ran on the same CPU type in the same region, with about 6 GiB of in-memory file space.",
  },
  instabox: {
    chip: "AMD EPYC, 5th Gen (Turin)",
    family: "Zen 5 (CPU family 26, model 2), 2.6 GHz, 1 MB L2 per core, 32 MB L3 shown",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5, the only memory 5th Gen EPYC takes" },
    cloud: "Not disclosed; outbound IPs are Amazon's and velia.net's",
    region: "Outbound IPs are Amazon's in Boardman, Oregon (us-west-2) for 423 of 550 sandboxes and velia.net's in St. Louis, Missouri for 112; that is where traffic leaves, not proof of where the sandbox runs. The API is in Oregon",
    regionShort: null,
    apiRegionShort: "Oregon",
    runsAs: "Firecracker microVM",
    runsAsDetail: "KVM under Firecracker, with Linux 6.18 inside",
    storage: "20 GB /data disk (ext4), where /workspace lives, plus a 16 GB system disk",
    kernel: "Linux 6.18, Debian 13",
    hidden: [
      "The CPU names itself only as \"AMD EPYC\", with no model number. Its family and model IDs (26, model 2), 1 MB of L2 per core and Zen 5-only instructions such as AVX-512 VP2INTERSECT place it in 5th Gen EPYC. Every sandbox showed the same feature set.",
      "Outbound HTTPS to public DNS resolvers is blocked: 1.1.1.1, 1.0.0.1, 8.8.8.8 and 9.9.9.9 on port 443 time out, so the TCP connect probe, which dials 1.1.1.1:443, can't run. Other port 443 traffic, such as GitHub and npm, works.",
      "No DMI, so the memory type is inferred from the chip. It runs as an ordinary user with passwordless sudo.",
    ],
    sameSpec: "The default machine is already 4 vCPU and 8 GB, so both tracks ran the same machine.",
  },
  maritime: {
    chip: "Intel Xeon, model not named",
    family: "From CPU features: AVX2, FMA and AES, no AVX-512; the hypervisor reports a generic name at 3.20 GHz",
    chipBasis: "inferred",
    memory: { kind: "unknown", why: "DMI is empty inside the microVM, with no memory details" },
    cloud: "Not disclosed; outbound IPs are Hetzner's (AS24940)",
    region: "Outbound IPs are Hetzner's (AS24940) in Falkenstein, Germany for 495 of 522 sandboxes and Helsinki, Finland for 27; that is where traffic leaves, not proof of where the sandbox runs",
    regionShort: null,
    egressRegionShort: "Germany",
    runsAs: "KVM microVM",
    runsAsDetail: "KVM with Linux 6.1.141 inside",
    storage: "12 GB virtio disk (vda), ext4 on the default size; 50 GB on 4 vCPU, 8 GB",
    kernel: "Linux 6.1.141, Ubuntu 24.04.5 LTS",
    hidden: [
      "The CPU names itself only as \"Intel(R) Xeon(R) Processor @ 3.20GHz\", a generic name set by the hypervisor, with no model number. It has AVX2, FMA and AES and no AVX-512, and every one of the 522 sandboxes showed the same feature set.",
      "DMI is empty, so the memory type isn't shown. It runs as an ordinary user, user (uid 1000), with passwordless sudo.",
      "Outbound traffic left from Hetzner in Falkenstein, Germany (495 of 522 sandboxes) and Helsinki, Finland (27); outbound IP geolocation shows where sandbox egress exits, not proof of where the sandbox host or control plane sits.",
    ],
    sameSpec: "The 4 vCPU, 8 GB machine (Maritime's medium preset) also has a 50 GB disk instead of 12 GB, on the same Intel Xeon and KVM setup, with Hetzner outbound IPs.",
  },
  styne: {
    chip: "AMD Ryzen 5000 (Vermeer), Zen 3",
    family: "Zen 3 (CPU family 25, model 33, stepping 0), 4.29 GHz, 512 KB L2 per core, 32 MB L3 shown",
    chipBasis: "inferred",
    memory: { kind: "unknown", why: "Cloud Hypervisor's DMI names only the hypervisor, with no memory details" },
    cloud: "G-Core Labs, from its outbound IPs",
    region: "Outbound IPs are G-Core Labs' (AS199524) in Manassas, Virginia for 259 of 260 sandboxes and Chicago for one; that is where traffic leaves, not proof of where the sandbox runs. Styne's region is ash (Ashburn, Virginia)",
    regionShort: "Virginia",
    runsAs: "Cloud Hypervisor microVM",
    runsAsDetail: "KVM under Cloud Hypervisor, with Linux 6.16.9+ inside",
    storage: "51 GB virtio disk (vda), ext4",
    kernel: "Linux 6.16.9+, Debian 12",
    hidden: [
      "The CPU names itself only as \"AMD EPYC Processor\", a generic name set by Cloud Hypervisor. Its family, model and stepping (25, 33, 0) at 4.29 GHz match desktop AMD Ryzen 5000 (Vermeer) silicon, not an EPYC server part; its 512 KB of L2 per core and its instructions (VAES, no AVX-512) are Zen 3's. 259 of 260 sandboxes shared the same feature set; one also reported rdseed.",
      "In a live probe of a Styne sandbox on Nov 23, the guest kernel command line set spec_rstack_overflow=off and cpuidle_haltpoll.force=1, and lscpu reported \"Spec rstack overflow: Vulnerable\" and \"Tsa: Vulnerable: No microcode\".",
      "In the same probe, /proc/uptime on a sandbox created moments before read about 21 hours, so its guest kernel was up long before that create; that suggests it came from a pool or snapshot, though the probe doesn't show which.",
      "Styne runs a burstable shared-CPU class: a new sandbox starts with up to 10 minutes of full-speed burst credit (less if the account kept more than 16% of its vCPUs busy over the last hour), drops to a 16% baseline per vCPU when credit runs out, and regains full speed once credit replenishes while staying under baseline.",
      "DMI names only Cloud Hypervisor, so the memory type isn't shown. It runs as root, with sudo.",
    ],
    sameSpec: "The default machine is already 4 vCPU and 8 GB, so both tracks ran the same machine.",
  },
  buddy: {
    chip: "AMD EPYC 9645",
    family: "Zen 5c (Turin Dense), 96 cores; the CPU names itself, with AVX-512 including VP2INTERSECT",
    chipBasis: "named",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5, the only memory 5th Gen EPYC takes" },
    cloud: "Not disclosed; outbound IPs are Hivelocity's (AS29802)",
    region: "Outbound IPs are Hivelocity's (AS29802) in New York City, US for all 260 sandboxes fingerprinted; that is where traffic leaves, not proof of where the sandbox runs",
    regionShort: null,
    egressRegionShort: "New York",
    runsAs: "Linux container (LXC) in a KVM virtual machine",
    runsAsDetail: "QEMU's generic i440FX machine (Standard PC (i440FX + PIIX, 1996)) under KVM, with Linux 6.8.0-147-generic inside",
    storage: "50 GB disk, 45.5 GiB usable, ext4 on a device-mapper volume",
    kernel: "Linux 6.8.0-147-generic, Ubuntu 24.04.5 LTS",
    hidden: [
      "The CPU names itself as an AMD EPYC 9645 96-Core Processor in every one of the 260 sandboxes fingerprinted, with AVX-512 and AVX-512 VP2INTERSECT exposed.",
      "Memory is set in decimal GB: the 2x4 size shows 4,000,000,000 bytes (3.73 GiB) and the 4x8 size 8,000,000,000 bytes (7.45 GiB), about 6.9% under the GiB its name suggests.",
      "DMI shows only QEMU's generic i440FX machine, so the memory type is inferred from the chip. It runs as an ordinary user, buddy (uid 1001), with passwordless sudo.",
      "Outbound traffic left from Hivelocity in New York City for every sandbox; outbound IP geolocation shows where sandbox egress exits, not proof of where the sandbox host or control plane sits.",
    ],
    sameSpec: "The 4 vCPU, 8 GB machine (Buddy's 4x8 size) has the same 50 GB disk, on the same AMD EPYC 9645 and LXC in KVM setup, with Hivelocity outbound IPs in New York City. Its 8 decimal GB show as 7.45 GiB, so it is marked as a different machine.",
  },
  microsandbox: {
    chip: "AMD EPYC, model not named",
    family: "The CPU names itself only as AMD EPYC, with no model number",
    chipBasis: "inferred",
    memory: { kind: "unknown", why: "our fingerprints of its sandboxes don't report the memory type" },
    cloud: "Not disclosed; outbound IPs are Hetzner's (AS24940)",
    region: "Outbound IPs are Hetzner's (AS24940) in Falkenstein, Germany for all 260 sandboxes fingerprinted in the main runs; that is where traffic leaves, not proof of where the sandbox runs",
    regionShort: null,
    egressRegionShort: "Germany",
    runsAs: "Virtual machine",
    runsAsDetail: "A hypervisor is present, with Linux 6.12.118 inside",
    storage: "4 GiB root disk (3.87 GiB usable) on the default size; 64 GiB on 4 vCPU, 8 GiB",
    kernel: "Linux 6.12.118",
    hidden: [
      "The CPU names itself only as AMD EPYC, with no model number, in every one of the 260 sandboxes fingerprinted in the main runs.",
      "Outbound traffic left from Hetzner in Falkenstein, Germany for every sandbox fingerprinted in the main runs; outbound IP geolocation shows where sandbox egress exits, not proof of where the sandbox host or control plane sits.",
    ],
    sameSpec: "The 4 vCPU, 8 GiB machine has a 64 GiB disk instead of 4 GiB and shows 7.76 GiB of memory inside, on the same AMD EPYC virtual machine with Hetzner outbound IPs. Its Shared CPU tier showed the same.",
  },
};

/** Said where a provider has no hardware probe yet. */
export const notProbed = "Not probed yet";
