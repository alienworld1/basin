import { expectedPaymentHandler } from "@/src/server/expected-payments/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return expectedPaymentHandler(request, "cancel", (await params).id);
}
