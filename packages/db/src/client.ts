import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { databaseUrl, DomainError } from "@basin/domain";

const runtimePoolKey = "__basinRuntimePools";

type Connection = ReturnType<typeof createConnection>;

function createConnection(
  connectionString: string,
  max: number,
  connectionTimeoutMillis: number,
) {
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis,
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

function runtimePools(): Map<string, Connection> {
  const scope = globalThis as typeof globalThis & {
    [runtimePoolKey]?: Map<string, Connection>;
  };
  return (scope[runtimePoolKey] ??= new Map());
}

/**
 * Creates a disposable connection for commands and isolated tests. Runtime
 * request handlers should use connectRuntimeDatabase instead.
 */
export function connectDatabase(
  connectionString: string,
  max = 5,
  connectionTimeoutMillis = 10000,
) {
  const parsed = databaseUrl.safeParse(connectionString);
  if (!parsed.success)
    throw new DomainError("UNAVAILABLE", "The database is unavailable.");
  return createConnection(parsed.data, max, connectionTimeoutMillis);
}

/**
 * Reuses one small pool per process and URL. A serverless process must not
 * disconnect this pool after every request; Supavisor transaction pooling
 * handles sharing connections across processes.
 */
export function connectRuntimeDatabase(connectionString: string) {
  const parsed = databaseUrl.safeParse(connectionString);
  if (!parsed.success)
    throw new DomainError("UNAVAILABLE", "The database is unavailable.");
  const pools = runtimePools();
  let connection = pools.get(parsed.data);
  if (!connection) {
    // The organization workspace loads several independent, read-only panels
    // after bootstrap. One connection serializes those requests and can make
    // callers exceed pg's connection-acquisition timeout. Keep this bounded
    // for serverless processes while allowing the transaction pooler to serve
    // the initial screen in parallel.
    connection = createConnection(parsed.data, 5, 10000);
    pools.set(parsed.data, connection);
  }
  return {
    db: connection.db,
    pool: connection.pool,
    // Persistence instances are request-scoped views over a process-scoped pool.
    close: async () => {},
  };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
