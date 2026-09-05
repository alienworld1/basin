import { loadDatabaseEnvironment } from "./environment";
import { databaseHealth } from "../src/health";
loadDatabaseEnvironment();
const status = await databaseHealth(process.env.DATABASE_URL);
process.stdout.write(`Database: ${status}.\n`);
if (status !== "ok") process.exitCode = 1;
