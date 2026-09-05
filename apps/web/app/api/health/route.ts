import { databaseHealth } from "@basin/db";
import { getEnvironmentHealth } from "@/src/server/config/environment";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = getEnvironmentHealth();
  health.checks.database = await databaseHealth(process.env.DATABASE_URL);
  if (health.checks.database !== "ok") health.status = "degraded";

  return Response.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
