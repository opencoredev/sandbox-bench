import { llmsTxt } from "@/lib/agent-data";
import { providerName } from "@/lib/providers";
import { providerPages, providerPath } from "@/lib/seo/pages";

export const dynamic = "force-static";

// Provider pages are appended here rather than in agent-data.ts, which the benchmark data owns.
const pages = `
## Provider pages

${providerPages.map((id) => `- [${providerName(id)} sandbox benchmark](${providerPath(id)}): ${providerName(id)}'s results on both tracks, its ranks, cost per task and caveats.`).join("\n")}
`;

export function GET() {
  return new Response(`${llmsTxt()}${pages}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
