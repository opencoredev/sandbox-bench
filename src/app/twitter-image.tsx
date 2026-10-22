// The art lives in src/assets/og-art.png (amber dither, Oct 2026); editing this file changes the cache-busting query on the card URL.
import { ogAlt, ogSize, renderOgImage } from "@/lib/og-image";

export const dynamic = "force-static";
export const alt = ogAlt;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
