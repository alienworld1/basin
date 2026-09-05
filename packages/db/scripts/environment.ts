import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;

export function loadDatabaseEnvironment(
  directory = fileURLToPath(new URL("../../../", import.meta.url)),
) {
  loadEnvConfig(directory, process.env.NODE_ENV !== "production", {
    info() {},
    error() {
      throw new Error("The root environment files could not be loaded.");
    },
  });
}
