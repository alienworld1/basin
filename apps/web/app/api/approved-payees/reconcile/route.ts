import { approvedPayeeHandler } from "@/src/server/approved-payees/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return approvedPayeeHandler(request, "reconcile");
}
