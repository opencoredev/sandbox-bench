import { agentData } from "@/lib/agent-data";
import { useCasesData } from "@/lib/use-cases";

export const dynamic = "force-static";

export function GET() {
  return Response.json({ ...agentData(), bestFor: useCasesData() });
}
