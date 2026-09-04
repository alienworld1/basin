import { getEnvironmentHealth } from "@/src/server/config/environment";

export const dynamic = "force-dynamic";

export function GET() {
  const health = getEnvironmentHealth();

  return Response.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
