import "server-only";

import { createPersistence } from "@basin/db";

import { getServerEnvironment } from "../config/environment";
import { AuthError } from "./errors";

export function createAuthenticatedPersistence() {
  try {
    return createPersistence(getServerEnvironment().DATABASE_URL);
  } catch {
    throw new AuthError(
      "UNAVAILABLE",
      "We couldn't reach the database. Try again shortly.",
    );
  }
}
