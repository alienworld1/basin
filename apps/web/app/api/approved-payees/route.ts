import { approvedPayeeHandler } from "@/src/server/approved-payees/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return approvedPayeeHandler(request, "list");
}
