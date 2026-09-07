import "server-only";

import { EnsProtocolError } from "@basin/ens";

import { errorResponse, noStoreJson } from "../auth/http";

export function identityErrorResponse(error: unknown) {
  if (error instanceof EnsProtocolError) {
    const status =
      error.code === "INVALID_LABEL" || error.code === "RESERVED_LABEL"
        ? 400
        : error.code === "COLLISION"
          ? 409
          : error.code === "NEEDS_REVIEW" ||
              error.code === "TRANSACTION_REVERTED"
            ? 422
            : 503;
    const message =
      error.code === "CONFIGURATION" || error.code === "RPC_UNAVAILABLE"
        ? "Basin identity setup is unavailable right now."
        : error.code === "NEEDS_REVIEW"
          ? "This identity needs review before Basin can use it."
          : error.message;
    return noStoreJson({ error: message, code: error.code }, status);
  }
  return errorResponse(error);
}
