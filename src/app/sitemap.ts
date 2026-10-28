import type { MetadataRoute } from "next";

import { lastModified, site, sitePaths } from "@/lib/seo/pages";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitePaths.map((path) => ({ url: `${site}${path}`, lastModified: lastModified(path), changeFrequency: "weekly" as const }));
}
