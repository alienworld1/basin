import { approvedPayeeHandler } from "@/src/server/approved-payees/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) =>
    approvedPayeeHandler(request, "accept", id),
  );
}
