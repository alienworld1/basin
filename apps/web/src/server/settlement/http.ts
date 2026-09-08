import "server-only";
import { DomainError } from "@basin/domain";
import { SettlementError } from "@basin/ens";
import { ZodError } from "zod";
import {
  requireVerifiedPrincipal,
  mapAuthenticatedUser,
  requirePersonalWorkspaceOwner,
} from "../auth/authorization";
import { createAuthenticatedPersistence } from "../auth/persistence";
import { errorResponse, noStoreJson, requireSameOrigin } from "../auth/http";
import { getPrivyEmbeddedController } from "../auth/privy";
import { readVerifiedIdentity } from "../identities/service";
import { readStrictIdentityQuery } from "../identities/input";
import {
  statusInput,
  preferenceInput,
  prepareInput,
  confirmInput,
  reconcileInput,
  recoveryInput,
} from "./input";
import { createReceivingService } from "./service";

export async function receivingHandler(
  request: Request,
  kind:
    | "status"
    | "preference"
    | "prepare"
    | "confirm"
    | "reconcile"
    | "authorize"
    | "cancel",
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    if (kind !== "status") requireSameOrigin(request);
    let raw: unknown;
    try {
      raw =
        kind === "status"
          ? readStrictIdentityQuery(new URL(request.url), [
              "workspaceId",
              "relationshipId",
            ])
          : await request.json();
    } catch {
      throw new DomainError(
        "INVALID_INPUT",
        "Check the receiving details and try again.",
      );
    }
    const schemas = {
      status: statusInput,
      preference: preferenceInput,
      prepare: prepareInput,
      confirm: confirmInput,
      reconcile: recoveryInput,
      authorize: reconcileInput,
      cancel: reconcileInput,
    };
    const input = schemas[kind].parse(raw);
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const workspace = await requirePersonalWorkspaceOwner(
      persistence,
      user,
      input.workspaceId,
    );
    const identity = await persistence.identities.findByWorkspace(workspace.id);
    if (!identity)
      throw new SettlementError(
        "REAPPROVAL_REQUIRED",
        "Set up your Basin identity before choosing a receiving account.",
      );
    // Status remains available when the browser controller is disconnected.
    if (kind !== "status") {
      const controller = await getPrivyEmbeddedController(
        principal.privyUserId,
      );
      if (controller.toLowerCase() !== identity.controller_address)
        throw new SettlementError(
          "REAPPROVAL_REQUIRED",
          "Reconnect the account that controls this identity.",
        );
    }
    await readVerifiedIdentity(
      persistence,
      workspace.id,
      identity.controller_address as `0x${string}`,
    );
    const service = createReceivingService(persistence, identity);
    if (kind === "status") {
      const query = statusInput.parse(input);
      return noStoreJson(
        await service.status(
          query.relationshipId ? BigInt(query.relationshipId) : undefined,
        ),
      );
    }
    if (kind === "preference") {
      const body = preferenceInput.parse(input);
      return noStoreJson(
        await service.savePreference(body.destination, body.expectedRevision),
      );
    }
    if (kind === "prepare") {
      const body = prepareInput.parse(input);
      return noStoreJson(
        await service.prepare(
          BigInt(body.relationshipId),
          body.destination,
          body.idempotencyKey,
        ),
      );
    }
    if (kind === "authorize" || kind === "cancel") {
      const body = reconcileInput.parse(input);
      return noStoreJson(await service[kind](BigInt(body.operationId)));
    }
    const body =
      kind === "confirm"
        ? confirmInput.parse(input)
        : recoveryInput.parse(input);
    if ("walletOutcome" in body && body.walletOutcome === "REJECTED")
      return noStoreJson(await service.rejectWallet(BigInt(body.operationId)));
    const result = await service.reconcile(
      BigInt(body.operationId),
      "transactionHash" in body ? String(body.transactionHash) : undefined,
    );
    return noStoreJson(
      result,
      result.status === "CONFIRMED" || result.status === "FAILED" ? 200 : 202,
    );
  } catch (error) {
    if (error instanceof SettlementError)
      return noStoreJson(
        { error: error.message, code: error.code },
        error.code === "INVALID_INPUT"
          ? 400
          : error.code === "STALE"
            ? 409
            : error.code === "UNVERIFIED"
              ? 503
              : 422,
      );
    if (error instanceof ZodError)
      return noStoreJson(
        {
          error: "Check the receiving details and try again.",
          fieldErrors: error.flatten().fieldErrors,
        },
        400,
      );
    if (error instanceof DomainError) return errorResponse(error);
    if (error instanceof Error && error.name === "EnsProtocolError")
      return noStoreJson(
        { error: "We couldn't verify your identity. Check again." },
        503,
      );
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
