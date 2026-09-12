import { reconcileActivityHandler } from "@/src/server/activity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return reconcileActivityHandler(request);
}
