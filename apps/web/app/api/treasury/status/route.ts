import { treasuryHandler } from "@/src/server/treasury/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return treasuryHandler(request, "status"); }
