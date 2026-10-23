import { providerColor } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

/** Providers with a single-colour mark in public/logos/<id>.svg. */
const withLogo = new Set<ProviderId>(["e2b", "daytona", "upstash", "upstash-ephemeral", "tenki", "boat", "boxd", "freestyle", "superserve"]);

/**
 * A provider's mark, painted in its chart colour through a CSS mask so one
 * monochrome SVG serves every surface. Falls back to the colour dot.
 */
export function ProviderLogo({ id, size = 14 }: { id: ProviderId; size?: number }) {
  const color = providerColor(id);
  if (!withLogo.has(id)) return <span aria-hidden className="shrink-0 rounded-full" style={{ width: size * 0.6, height: size * 0.6, background: color }} />;
  const mask = `url(/logos/${id}.svg) center / contain no-repeat`;
  return <span aria-hidden className="shrink-0" style={{ width: size, height: size, background: color, mask, WebkitMask: mask }} />;
}
