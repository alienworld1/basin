import { expectedPaymentHandler } from "@/src/server/expected-payments/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return expectedPaymentHandler(request, "list");
}

export function POST(request: Request) {
  return expectedPaymentHandler(request, "create");
}
