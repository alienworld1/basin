import { activityHandler } from "@/src/server/activity/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return activityHandler(request);
}
