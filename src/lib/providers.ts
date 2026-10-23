/**
 * Display names and chart colours of the providers on the page. Each hue is
 * the provider's own brand colour (Tenki and Daytona blues, Upstash emerald,
 * Upstash Ephemeral Box a deeper teal of the same emerald, Superserve mint, boxd rose, Freestyle periwinkle, E2B orange, Boat's
 * near-white mark), with lightness spread so every pair stays apart under
 * protanopia and deuteranopia (OKLab ΔE ≥ 6.8; names and logos sit beside
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
  tenki: { name: "Tenki", color: "oklch(0.66 0.17 257)" },
  superserve: { name: "Superserve", color: "oklch(0.92 0.1 148)" },
} as const satisfies Record<string, { name: string; color: string; short?: string; tag?: string; brand?: string }>;

export type ProviderId = keyof typeof providerInfo;

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(providerInfo, id);

export const providerName = (id: ProviderId) => providerInfo[id].name;
export const providerColor = (id: ProviderId) => providerInfo[id].color;

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
