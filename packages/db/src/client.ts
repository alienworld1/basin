import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { databaseUrl, DomainError } from "@basin/domain";

export function connectDatabase(connectionString: string, max = 5) {
  const parsed = databaseUrl.safeParse(connectionString);
  if (!parsed.success)
    throw new DomainError("UNAVAILABLE", "The database is unavailable.");
  const pool = new Pool({
    connectionString: parsed.data,
    max,
    connectionTimeoutMillis: 1500,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
    query_timeout: 3500,
    options: "-c timezone=UTC",
    allowExitOnIdle: true,
  });
  // Idle connection failures are surfaced by the next operation without logging connection details.
  pool.on("error", () => {});
  return { db: drizzle(pool), pool, close: () => pool.end() };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
