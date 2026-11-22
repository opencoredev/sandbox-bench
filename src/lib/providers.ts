/**
 * Display names and chart colours of the providers on the page. Each hue is
 * the provider's own brand colour (Daytona blue, Luxor's gold, muted to stay clear of Modal's lime, Upstash emerald,
 * Upstash Ephemeral Box a deeper teal of the same emerald, Superserve mint, boxd rose, Freestyle periwinkle, E2B orange, Boat's
 * near-white mark, Vercel's white, Modal's lime, Baseten's pink, warmed toward rose because its brand green sits
 * between Upstash, Superserve and Modal, and Instabox's pale lemon: its mark is black and white and its site's
 * green sits in the same crowded range, so it takes the one gap left, ΔE ≥ 7.9 from every other), and Beam's coral (Beam's own palette is neutral with a blue accent, every blue sits too
 * close to Daytona and Freestyle under colour-blind simulation, and the pale yellows are taken, so it takes the best
 * gap left, between E2B's orange and boxd's rose), with lightness spread so every pair stays apart under
 * protanopia and deuteranopia (OKLab ΔE ≥ 6.7; names and logos sit beside
 * every colour) and as 12px text on the card surface (≥ 6:1). E2B stays on
 * the orange side of its red-orange accent, away from the red of failures.
 */
export const providerInfo = {
  e2b: { name: "E2B", color: "oklch(0.75 0.17 58)" },
  daytona: { name: "Daytona", color: "oklch(0.8 0.08 225)" },
  upstash: { name: "Upstash Box", color: "oklch(0.82 0.15 163)" },
  "upstash-ephemeral": { name: "Upstash Ephemeral Box", color: "oklch(0.66 0.11 192)", short: "Upstash", tag: "Ephemeral", brand: "upstash" },
  boat: { name: "Boat", color: "oklch(0.9 0.02 270)" },
  boxd: { name: "boxd", color: "oklch(0.68 0.15 12)" },
  freestyle: { name: "Freestyle", color: "oklch(0.72 0.1 298)" },
  tenki: { name: "Luxor", color: "oklch(0.8 0.1 78)", formerly: "Tenki" },
  superserve: { name: "Superserve", color: "oklch(0.92 0.1 148)" },
  vercel: { name: "Vercel Sandbox", color: "oklch(0.985 0 0)" },
  modal: { name: "Modal", color: "oklch(0.86 0.19 128)" },
  baseten: { name: "Baseten", color: "oklch(0.72 0.18 351)" },
  instabox: { name: "Instabox", color: "oklch(0.97 0.14 110)" },
  beam: { name: "Beam", color: "oklch(0.73 0.12 42)" },
  // Beam's opt-in CPU tiers on the same Sandboxes product. The palette has no gap left that keeps
  // two more shades apart from every other provider under colour-blind simulation, so a tier keeps
  // its provider's colour and reads apart by its fill (rowFill in lib/marks.ts) and the tag beside its name.
  "beam-shared": { name: "Beam Shared", color: "oklch(0.73 0.12 42)", short: "Beam", tag: "Shared", brand: "beam" },
  "beam-spot": { name: "Beam Spot", color: "oklch(0.73 0.12 42)", short: "Beam", tag: "Spot", brand: "beam" },
} as const satisfies Record<string, { name: string; color: string; short?: string; tag?: string; brand?: string; formerly?: string }>;

export type ProviderId = keyof typeof providerInfo;

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(providerInfo, id);

export const providerName = (id: ProviderId) => providerInfo[id].name;
export const providerColor = (id: ProviderId) => providerInfo[id].color;

/** A provider's name before a rebrand, kept so its page still says who it was (Luxor was Tenki). The id and URL keep the old name. */
export function providerFormerName(id: ProviderId): string | undefined {
  const info = providerInfo[id];
  return "formerly" in info ? info.formerly : undefined;
}

/** The company behind a row: a second product shows its provider's own logo, in that provider's colour. */
export function providerBrand(id: ProviderId): ProviderId {
  const info = providerInfo[id];
  return "brand" in info ? info.brand : id;
}

/**
 * How a provider's name is drawn on the page. A second product of the same
 * provider shows the provider's short name plus a small tag, so it reads as
 * a sibling row instead of a long name. Agent files keep providerName.
 */
export type ProviderLabel = { kind: "plain"; name: string } | { kind: "tagged"; short: string; tag: string; rest: string };

export function providerLabel(id: ProviderId): ProviderLabel {
  const info: { name: string; short?: string; tag?: string } = providerInfo[id];
  if (info.short === undefined || info.tag === undefined) return { kind: "plain", name: info.name };
  // What the visible short name and tag leave out of the full name, for screen readers: "Box".
  const rest = info.name.replace(info.short, "").replace(info.tag, "").trim();
  return { kind: "tagged", short: info.short, tag: info.tag, rest };
}

/**
 * How a CPU tier treats the processor it sells. `dedicated`: vCPUs no one
 * else runs on; `shared`: vCPUs shared with other customers' sandboxes;
 * `spot`: spare capacity the provider can take back mid-task.
 */
export type CpuClass = "dedicated" | "shared" | "spot";

export interface CpuTier {
  /** The row its results sit under. */
  id: ProviderId;
  /** The provider's own name for the tier. */
  name: string;
  cpu: CpuClass;
  /** The provider can stop it before the task ends, so it is never picked as cheapest. */
  preemptible: boolean;
  /** List rates in US dollars. */
  rates: { vcpuHour: number; memoryGiBHour: number };
  /** What the provider says about it, in a few words. */
  promise: string;
}

/**
 * Providers that sell one sandbox product on more than one CPU tier, each with
 * its own rate card, tiers in the provider's own order, the one a new account
 * gets first. The first is the provider's own row; every other tier is a
 * sibling row, shown only under "Every tier" (components/tier-switch.tsx).
 *
 * Who gets a row of their own, so the page stays readable as providers add
 * options: a separate product (Upstash Ephemeral Box) or a CPU tier sold at its
 * own rate gets one. Machine size, region and plain settings never do: the
 * tracks, By location and the notes cover those. At most four rows per provider.
 */
export const cpuTiers = {
  beam: [
    { id: "beam", name: "Performance", cpu: "dedicated", preemptible: false, rates: { vcpuHour: 0.05, memoryGiBHour: 0.01 }, promise: "No CPU sharing, not preemptible" },
    { id: "beam-shared", name: "Shared", cpu: "shared", preemptible: false, rates: { vcpuHour: 0.011, memoryGiBHour: 0.0055 }, promise: "Shared vCPUs, not preemptible, up to 8 vCPU and 16 GiB" },
    { id: "beam-spot", name: "Spot", cpu: "spot", preemptible: true, rates: { vcpuHour: 0.0063, memoryGiBHour: 0.00135 }, promise: "Spare capacity, can be stopped with 30 seconds' notice" },
  ],
} as const satisfies Partial<Record<ProviderId, readonly [CpuTier, ...CpuTier[]]>>;

export type TieredProvider = keyof typeof cpuTiers;

/** Where a provider's tiers and their rates are published. */
export const tierSources = {
  beam: {
    url: "https://www.beam.cloud/pricing",
    checked: "Nov 20, 2026",
    note: "Every tier's real tasks ran on Nov 20, one tier at a time, 5 runs each; Beam's own real-task results are that day's Performance run. Performance's quick tests are Beam's own row, from Nov 18: a same-day rerun on the same Intel hosts in Warrenton came within 7% on cold start, commands, 100 tool calls and every CPU, memory and disk test, and took 3.6 s for the 10 MB write and read against 2.9 s. Five Fix and test runs at once, against the same task alone that day, took 1.23 times as long on Performance, 1.40 on Shared and 1.48 on Spot. No Spot sandbox was taken back, but each lived at most 4 minutes, so this says little about long Spot work.",
  },
} as const satisfies Record<TieredProvider, { url: string; checked: string; note: string }>;

/** A tier's list price per hour for a machine. */
export const tierHourly = (t: Pick<CpuTier, "rates">, m: { cpu: number; memoryGiB: number }) => t.rates.vcpuHour * m.cpu + t.rates.memoryGiBHour * m.memoryGiB;

const tierList: readonly CpuTier[] = Object.values(cpuTiers).flat();

/** The CPU tier a row ran on, for a provider that sells more than one; undefined otherwise. */
export const tierOf = (id: ProviderId): CpuTier | undefined => tierList.find((t) => t.id === id);

/** A tier row past the provider's first, hidden under "One per provider". */
export const isExtraTier = (id: ProviderId) => {
  const tier = tierOf(id);
  return tier !== undefined && tier.id !== providerBrand(tier.id);
};

/** Every tier of a row's provider, the row's own included, or just the row when its provider has one tier. */
export function tiersOf(id: ProviderId): readonly CpuTier[] {
  const brand = providerBrand(id);
  return tierList.filter((t) => providerBrand(t.id) === brand);
}

/** Can the provider stop this row's sandboxes before the task ends? */
export const isPreemptible = (id: ProviderId) => tierOf(id)?.preemptible === true;
