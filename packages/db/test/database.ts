import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { databaseUrl } from "@basin/domain";
import { connectDatabase } from "../src/client";

export async function isolatedDatabase() {
  const parsed = databaseUrl.safeParse(process.env.TEST_DATABASE_ADMIN_URL);
  if (!parsed.success)
    throw new Error(
      "Set TEST_DATABASE_ADMIN_URL to a local disposable Postgres admin connection.",
    );
  const url = new URL(parsed.data);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Integration tests require a local Postgres instance.");
  const name = `basin_test_${randomBytes(12).toString("hex")}`;
  const admin = new Pool({ connectionString: parsed.data });
  await admin.query(`create database "${name}"`);
  url.pathname = `/${name}`;
  const connection = connectDatabase(url.toString());
  return {
    ...connection,
    url: url.toString(),
    migrate: () => migrate(connection.db, { migrationsFolder: "./migrations" }),
    async dispose() {
      await connection.close();
      // The generated name is never caller input. Only this invocation's database is removed.
      await admin.query(`drop database "${name}" with (force)`);
      await admin.end();
    },
  };
}
