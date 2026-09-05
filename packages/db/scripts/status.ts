import { inspectMigrations, migrationConnection } from "./migration-context";
async function main() {
  const connection = migrationConnection();
  try {
    const pending = await inspectMigrations(connection);
    process.stdout.write(
      pending
        ? `${pending} migration(s) pending.\n`
        : "Database is current. No pending migrations.\n",
    );
    if (pending) process.exitCode = 1;
  } finally {
    await connection.close();
  }
}
main().catch(() => {
  process.stderr.write(
    "Migration status could not be verified. Check the connection and reviewed migration history.\n",
  );
  process.exitCode = 1;
});
