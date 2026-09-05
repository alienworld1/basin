import { readMigrationFiles } from "drizzle-orm/migrator";
import { writeFileSync } from "node:fs";
const migrations = readMigrationFiles({ migrationsFolder: "./migrations" });
writeFileSync(
  "./src/migration-manifest.json",
  JSON.stringify(
    migrations.map((migration) => ({
      hash: migration.hash,
      when: migration.folderMillis,
    })),
    null,
    2,
  ) + "\n",
);
