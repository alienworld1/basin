import { receivingHandler } from "@/src/server/settlement/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function PUT(request: Request) {
  return receivingHandler(request, "preference");
}
