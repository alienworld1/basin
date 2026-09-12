import "server-only";

import { ZodError } from "zod";

import { noStoreJson, errorResponse } from "../auth/http";
import { createAuthenticatedPersistence } from "../auth/persistence";
import {
  mapAuthenticatedUser,
  requireVerifiedPrincipal,
  requireWorkspaceAccess,
} from "../auth/authorization";
import { decimalId, strictQuery } from "../activity/input";
import { readReceipt, receiptDto, verifyReceipt } from "./service";

export async function receiptHandler(
  request: Request,
  id: string,
  mode: "detail" | "verification",
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    const query = strictQuery(new URL(request.url), ["workspaceId"]);
    const workspaceId = decimalId.parse(query.workspaceId);
    const receiptId = decimalId.parse(id);
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireWorkspaceAccess(persistence, user, workspaceId);
    const row = await readReceipt(persistence, access, BigInt(receiptId));
    return noStoreJson(
      mode === "detail" ? receiptDto(row) : await verifyReceipt(row),
    );
  } catch (error) {
    if (
      error instanceof ZodError ||
      (error instanceof Error && error.name === "ReceiptNotFound")
    )
      return noStoreJson({ error: "We couldn't find that receipt." }, 404);
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
