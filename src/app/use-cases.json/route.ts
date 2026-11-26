import { useCasesData } from "@/lib/use-cases";

export const dynamic = "force-static";

export function GET() {
  return Response.json(useCasesData());
}
