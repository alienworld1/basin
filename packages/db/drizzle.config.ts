import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/tables.ts",
  out: "./migrations",
  schemaFilter: ["basin"],
  strict: true,
  verbose: true,
});
