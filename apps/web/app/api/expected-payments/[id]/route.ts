import { expectedPaymentHandler } from "@/src/server/expected-payments/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return expectedPaymentHandler(request, "detail", (await params).id);
}
