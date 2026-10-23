import { providerBrand, providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** Providers with a single-colour mark in public/logos/<id>.svg. */
const withLogo = new Set<ProviderId>(["e2b", "daytona", "upstash", "tenki", "boat", "boxd", "freestyle", "superserve", "sandboxer"]);

/**
 * A provider's mark, painted in its chart colour through a CSS mask so one
 * monochrome SVG serves every surface. A second product of a provider shows
 * that provider's mark and colour. Falls back to the colour dot.
 */
export function ProviderLogo({ id: row, size = 14 }: { id: ProviderId; size?: number }) {
  const id = providerBrand(row);
  const color = providerColor(id);
  if (!withLogo.has(id)) return <span aria-hidden className="shrink-0 rounded-full" style={{ width: size * 0.6, height: size * 0.6, background: color }} />;
  const mask = `url(/logos/${id}.svg) center / contain no-repeat`;
  return <span aria-hidden className="shrink-0" style={{ width: size, height: size, background: color, mask, WebkitMask: mask }} />;
}
