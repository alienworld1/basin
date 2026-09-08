import { loadDatabaseEnvironment } from "./environment";
import { databaseUrl } from "@basin/domain";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { connectDatabase } from "../src/client";
import manifest from "../src/migration-manifest.json";

export function migrationConnection() {
  loadDatabaseEnvironment();
  const local = ["development", "test"].includes(
    process.env.APP_ENV ?? "development",
  );
  const parsed = databaseUrl.safeParse(
    process.env.DATABASE_MIGRATION_URL ||
      (local ? process.env.DATABASE_URL : undefined),
  );
  if (!parsed.success)
    throw new Error("Set the migration database connection before continuing.");
  return connectDatabase(parsed.data, 1, 10000);
}
export async function inspectMigrations(
  connection: ReturnType<typeof connectDatabase>,
) {
  const files = readMigrationFiles({ migrationsFolder: "./migrations" });
  if (
    files.length !== manifest.length ||
    files.some(
      (file, index) =>
        file.hash !== manifest[index].hash ||
        file.folderMillis !== manifest[index].when,
    )
  ) {
    throw new Error(
      "Migration files differ from the application manifest. Regenerate and review the migration manifest.",
    );
  }
  let applied: { hash: string; created_at: string }[] = [];
  try {
    applied = (
      await connection.pool.query(
        "select hash, created_at from drizzle.__drizzle_migrations order by created_at",
      )
    ).rows;
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      !["42P01", "3F000"].includes(String(error.code))
    )
      throw new Error("The migration database is unavailable.");
  }
  if (
    applied.length > files.length ||
    applied.some(
      (row, index) =>
        row.hash !== files[index].hash ||
        Number(row.created_at) !== files[index].folderMillis,
    )
  ) {
    throw new Error(
      "Applied migration history differs from the application. Deployment must stop.",
    );
  }
  return files.length - applied.length;
}
