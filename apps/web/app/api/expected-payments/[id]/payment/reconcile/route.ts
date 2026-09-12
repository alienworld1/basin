import { expectedPaymentHandler } from "@/src/server/expected-payments/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return expectedPaymentHandler(request, "paymentReconcile", (await params).id); }
