import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://aisandboxbench.com";
  return ["/", "/results.md", "/results.json", "/llms.txt"].map((path) => ({ url: `${base}${path}`, changeFrequency: "weekly" as const }));
}
