import "server-only";

import { DomainError } from "@basin/domain";
import { ZodError } from "zod";

import {
  mapAuthenticatedUser,
  requireVerifiedPrincipal,
  requireWorkspaceAccess,
} from "../auth/authorization";
import { AuthError } from "../auth/errors";
import { errorResponse, noStoreJson, requireSameOrigin } from "../auth/http";
import { createAuthenticatedPersistence } from "../auth/persistence";
import {
  acceptPrepareInput,
  authorizeInput,
  detailInput,
  listInput,
  prepareInput,
  reconcileInput,
  resolveInput,
  setupInput,
  strictQuery,
} from "./input";
import { createApprovedPayeeService } from "./service";

export type ApprovedPayeeHandlerKind =
  | "list"
  | "detail"
  | "resolve"
  | "setup"
  | "prepare"
  | "accept"
  | "authorize"
  | "reconcile";

export async function approvedPayeeHandler(
  request: Request,
  kind: ApprovedPayeeHandlerKind,
  relationshipId?: string,
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    const raw =
      kind === "list"
        ? strictQuery(new URL(request.url), ["workspaceId", "cursor", "limit"])
        : kind === "detail"
          ? {
              ...strictQuery(new URL(request.url), ["workspaceId"]),
              relationshipId,
            }
          : {
              ...(await request.json()),
              ...(kind === "accept" ? { relationshipId } : {}),
            };
    if (!["list", "detail"].includes(kind)) requireSameOrigin(request);
    const workspaceInput = detailInput.shape.workspaceId.parse(
      (raw as Record<string, unknown>).workspaceId,
    );
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireWorkspaceAccess(
      persistence,
      user,
      workspaceInput,
    );
    if (
      ["resolve", "setup", "prepare"].includes(kind) &&
      (access.workspace.type !== "ORGANIZATION" ||
        access.memberRole !== "ADMIN")
    ) {
      throw new AuthError(
        "FORBIDDEN",
        "Only an organization administrator can change payee approvals.",
      );
    }
    const service = createApprovedPayeeService(persistence, access, user.id);
    if (kind === "list") {
      const input = listInput.parse(raw);
      return noStoreJson(
        await service.list(
          input.cursor ? BigInt(input.cursor) : undefined,
          input.limit,
        ),
      );
    }
    if (kind === "detail") {
      const input = detailInput.parse(raw);
      return noStoreJson(await service.detail(BigInt(input.relationshipId)));
    }
    if (kind === "resolve") {
      const input = resolveInput.parse(raw);
      return noStoreJson(await service.resolve(input.identity));
    }
    if (kind === "setup") {
      const input = setupInput.parse(raw);
      return noStoreJson(
        await service.setup(input.organizationLabel, input.idempotencyKey),
        202,
      );
    }
    if (kind === "prepare") {
      const input = prepareInput.parse(raw);
      const result =
        input.action === "PROPOSE"
          ? await service.prepareProposal(
              BigInt(input.identityId),
              new Date(input.expiresAt),
              input.idempotencyKey,
            )
          : await service.prepareRevoke(
              BigInt(input.relationshipId),
              input.reason,
              input.idempotencyKey,
            );
      return noStoreJson(result, 202);
    }
    if (kind === "accept") {
      const input = acceptPrepareInput
        .extend({ relationshipId: detailInput.shape.relationshipId })
        .parse(raw);
      return noStoreJson(
        await service.prepareAccept(
          BigInt(input.relationshipId),
          input.idempotencyKey,
        ),
        202,
      );
    }
    if (kind === "authorize") {
      const input = authorizeInput.parse(raw);
      const result = await service.authorize(
        BigInt(input.operationId),
        input.signature as `0x${string}` | undefined,
        input.walletAuthorizationSignature,
        input.walletAuthorizationExpiry,
      );
      return noStoreJson(
        result,
        result.operation.status === "CONFIRMED" ? 200 : 202,
      );
    }
    const input = reconcileInput.parse(raw);
    const result = await service.reconcile(
      BigInt(input.operationId),
      input.transactionHash as `0x${string}` | undefined,
    );
    return noStoreJson(result, result.status === "CONFIRMED" ? 200 : 202);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError)
      return errorResponse(error);
    if (error instanceof DomainError || error instanceof AuthError)
      return errorResponse(error);
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
