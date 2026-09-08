import { treasuryHandler } from "@/src/server/treasury/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return treasuryHandler(request, "reconcile"); }
