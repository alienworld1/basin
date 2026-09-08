import { privyWebhookHandler } from "@/src/server/treasury/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return privyWebhookHandler(request); }
