import { receivingHandler } from "@/src/server/settlement/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return receivingHandler(request, "prepare");
}

export function DELETE(request: Request) {
  return receivingHandler(request, "cancel");
}
