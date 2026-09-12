import { receiptHandler } from "@/src/server/receipts/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return receiptHandler(request, (await params).id, "verification");
}
