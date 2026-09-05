import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inspectMigrations, migrationConnection } from "./migration-context";

async function main() {
  const connection = migrationConnection();
  try {
    await inspectMigrations(connection);
    await migrate(connection.db, { migrationsFolder: "./migrations" });
    await inspectMigrations(connection);
    process.stdout.write("Migrations applied. Database is current.\n");
  } finally {
    await connection.close();
  }
}
main().catch(() => {
  process.stderr.write(
    "Migration failed. Check the connection and reviewed migration history before deploying.\n",
  );
  process.exitCode = 1;
});
