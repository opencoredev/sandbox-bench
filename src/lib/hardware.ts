import type { ProviderId } from "@/lib/providers";

/**
 * What each provider's sandboxes run on, from a hardware probe run inside
 * one default and one 4 vCPU sandbox per provider on Oct 22, 2026, checked
 * against the benchmark's own fingerprints. Only what the evidence supports:
 * a chip the CPU names itself is "named", one worked out from its model
 * number, cache and clock is "inferred", and Tenki's, which reports two
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
  runsAs: string;
  runsAsDetail: string;
  storage: string;
  kernel: string;
  /** What the sandbox hides or reports differently from the real machine, in plain words. */
  hidden: readonly string[];
  /** How the 4 vCPU, 8 GB sandbox differed, when it did. */
  sameSpec: string | null;
}

export const probeDate = "Oct 22, 2026";

export const chipBasisLabel = {
  named: "named by the CPU",
  inferred: "inferred",
  conflicting: "conflicting",
} as const satisfies Record<ChipBasis, string>;

export const hardware = {
  e2b: {
    chip: "Intel Xeon Platinum 8373C",
    family: "Ice Lake, 2.6 GHz, 54 MB L3",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR4", basis: "inferred", detail: "DDR4-3200, the chip's memory type" },
    cloud: "Google Cloud",
    region: "us-west1, The Dalles, Oregon",
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
    family: "Arm Neoverse V2; Graviton4 from the m8gd instance type",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5-5600, from AWS's Graviton4 spec" },
    cloud: "AWS EC2",
    region: "us-east-1, Ashburn, Virginia",
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
    chip: "AMD EPYC 9554P, likely",
    family: "Zen 4 (Genoa), 3.1 GHz",
    chipBasis: "inferred",
    memory: { kind: "known", type: "DDR5", basis: "inferred", detail: "DDR5-4800, the Genoa platform's memory" },
    cloud: "Latitude.sh bare metal",
    region: "Frankfurt, Germany",
    runsAs: "Firecracker microVM",
    runsAsDetail: "with Docker installed inside the VM",
    storage: "100 GB virtio disk, ext4",
    kernel: "Linux 6.18 (custom build), Ubuntu 24.04",
    hidden: [
      "The CPU name is trimmed to \"AMD EPYC\" and the microcode and topology are hidden. The chip is inferred from its 3.1 GHz clock and the Genoa servers Latitude.sh sells; a dual-socket 9554 can't be ruled out.",
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
    cloud: "Luxor (AS19538)",
    region: "Seattle",
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
} as const satisfies Record<ProviderId, HardwareDetail>;
