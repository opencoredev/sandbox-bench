import { llmsTxt } from "@/lib/agent-data";
import { providerName } from "@/lib/providers";
import { comparePages, comparePath, providerPages, providerPath } from "@/lib/seo/pages";

export const dynamic = "force-static";

// Provider and comparison pages are appended here rather than in agent-data.ts, which the benchmark data owns.
const pages = `
## Provider pages

${providerPages.map((id) => `- [${providerName(id)} sandbox benchmark](${providerPath(id)}): ${providerName(id)}'s results on both tracks, its ranks, cost per task and caveats.`).join("\n")}

## Comparison pages

${comparePages.map((p) => `- [${providerName(p.a)} vs ${providerName(p.b)}](${comparePath(p.slug)}): both on both tracks, test by test, with which one is ahead and where the gap is a tie inside the 95% intervals.`).join("\n")}
`;

export function GET() {
  return new Response(`${llmsTxt()}${pages}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
