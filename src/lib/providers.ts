/**
 * Display names and chart colours of the providers on the page. Each hue is
 * the provider's own brand colour (Tenki and Daytona blues, Upstash emerald,
 * Superserve mint, boxd rose, Freestyle periwinkle, E2B orange, Boat's
 * near-white mark), with lightness spread so every pair stays apart under
 * protanopia and deuteranopia (OKLab ΔE ≥ 6.8; names and logos sit beside
 * every colour) and as 12px text on the card surface (≥ 6:1). E2B stays on
 * the orange side of its red-orange accent, away from the red of failures.
 */
export const providerInfo = {
  e2b: { name: "E2B", color: "oklch(0.75 0.17 58)" },
  daytona: { name: "Daytona", color: "oklch(0.8 0.08 225)" },
  upstash: { name: "Upstash Box", color: "oklch(0.82 0.15 163)" },
  boat: { name: "Boat", color: "oklch(0.9 0.02 270)" },
  boxd: { name: "boxd", color: "oklch(0.68 0.15 12)" },
  freestyle: { name: "Freestyle", color: "oklch(0.72 0.1 298)" },
  tenki: { name: "Tenki", color: "oklch(0.66 0.17 257)" },
  superserve: { name: "Superserve", color: "oklch(0.92 0.1 148)" },
} as const satisfies Record<string, { name: string; color: string }>;

export type ProviderId = keyof typeof providerInfo;

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(providerInfo, id);

export const providerName = (id: ProviderId) => providerInfo[id].name;
export const providerColor = (id: ProviderId) => providerInfo[id].color;
