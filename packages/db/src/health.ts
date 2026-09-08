import { bigint, integer, pgSchema, text } from "drizzle-orm/pg-core";
import { connectRuntimeDatabase } from "./client";
import expected from "./migration-manifest.json";

const migrationRecords = pgSchema("drizzle").table("__drizzle_migrations", {
  id: integer(),
  hash: text().notNull(),
  created_at: bigint({ mode: "number" }).notNull(),
});
export type DatabaseHealth = "ok" | "unavailable" | "migration_required";
export async function databaseHealth(
  connectionString: string | undefined,
): Promise<DatabaseHealth> {
  if (!connectionString) return "unavailable";
  let connection: ReturnType<typeof connectRuntimeDatabase> | undefined;
  try {
    connection = connectRuntimeDatabase(connectionString);
    const applied = await connection.db
      .select()
      .from(migrationRecords)
      .orderBy(migrationRecords.created_at);
    return applied.length === expected.length &&
      applied.every(
        (row, index) =>
          row.hash === expected[index].hash &&
          row.created_at === expected[index].when,
      )
      ? "ok"
      : "migration_required";
  } catch (error) {
    const source = error instanceof Error && error.cause ? error.cause : error;
    const code =
      source && typeof source === "object" && "code" in source
        ? source.code
        : undefined;
    return code === "42P01" || code === "3F000"
      ? "migration_required"
      : "unavailable";
  } finally {
    await connection?.close();
  }
}
