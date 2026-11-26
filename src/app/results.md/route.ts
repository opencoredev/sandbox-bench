import { agentMarkdown } from "@/lib/agent-data";
import { useCasesMarkdown } from "@/lib/use-cases";

export const dynamic = "force-static";

export function GET() {
  return new Response(`${agentMarkdown()}\n${useCasesMarkdown("#").join("\n")}`, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
