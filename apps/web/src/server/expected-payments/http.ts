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
  cancelExpectedPaymentInput,
  authorizeExpectedPaymentInput,
  reconcileExpectedPaymentAuthorizationInput,
  createExpectedPaymentInput,
  decimalId,
  expectedPaymentDetailInput,
  expectedPaymentListInput,
  strictExpectedPaymentQuery,
  paymentPrepareInput,
  paymentSubmitInput,
  reconcilePaymentExecutionInput,
  refreshExpectedPaymentRelationshipInput,
} from "./input";
import { createExpectedPaymentService } from "./service";
import { createExpectedPaymentAuthorizationService } from "./authorization";
import { createPaymentService } from "../payments/service";

export type ExpectedPaymentHandlerKind =
  "list" | "detail" | "create" | "cancel" | "refreshRelationship" | "authorizePrepare" | "authorize" | "authorizeReconcile" | "paymentPrepare" | "paymentSubmit" | "paymentReconcile";

export async function expectedPaymentHandler(
  request: Request,
  kind: ExpectedPaymentHandlerKind,
  expectedPaymentId?: string,
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    const raw =
      kind === "list"
        ? strictExpectedPaymentQuery(new URL(request.url), [
            "workspaceId",
            "cursor",
            "limit",
          ])
        : kind === "detail"
          ? {
              ...strictExpectedPaymentQuery(new URL(request.url), [
                "workspaceId",
              ]),
              expectedPaymentId,
            }
          : {
              ...(await request.json()),
              ...(["cancel", "refreshRelationship", "authorizePrepare", "authorize", "authorizeReconcile", "paymentPrepare", "paymentSubmit", "paymentReconcile"].includes(kind) ? { expectedPaymentId } : {}),
            };
    if (!["list", "detail"].includes(kind)) requireSameOrigin(request);
    const workspaceId = decimalId.parse(
      (raw as Record<string, unknown>).workspaceId,
    );
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireWorkspaceAccess(persistence, user, workspaceId);
    if (
      !["list", "detail"].includes(kind) &&
      (access.workspace.type !== "ORGANIZATION" ||
        access.memberRole !== "ADMIN" && !["paymentPrepare", "paymentSubmit", "paymentReconcile"].includes(kind))
    ) {
      throw new AuthError("FORBIDDEN", "You don't have permission to do that.");
    }
    const service = createExpectedPaymentService(persistence, access, user.id);
    if (["paymentPrepare", "paymentSubmit", "paymentReconcile"].includes(kind)) {
      const payments = createPaymentService(persistence, access);
      if (kind === "paymentReconcile") {
        const input = reconcilePaymentExecutionInput.extend({ expectedPaymentId: decimalId }).parse(raw);
        return noStoreJson(await payments.reconcile(BigInt(input.expectedPaymentId)), 202);
      }
      if (kind === "paymentPrepare") {
        const input = paymentPrepareInput.extend({ expectedPaymentId: decimalId }).parse(raw);
        return noStoreJson(await payments.prepare(BigInt(input.expectedPaymentId), input.idempotencyKey), 202);
      }
      const input = paymentSubmitInput.extend({ expectedPaymentId: decimalId }).parse(raw);
      return noStoreJson(await payments.submit(BigInt(input.expectedPaymentId), BigInt(input.operationId)), 202);
    }
    if (kind === "list") {
      const input = expectedPaymentListInput.parse(raw);
      return noStoreJson(
        await service.list(
          input.cursor ? BigInt(input.cursor) : undefined,
          input.limit,
        ),
      );
    }
    if (kind === "detail") {
      const input = expectedPaymentDetailInput.parse(raw);
      return noStoreJson(await service.detail(BigInt(input.expectedPaymentId)));
    }
    if (kind === "create") {
      const input = createExpectedPaymentInput.parse(raw);
      const result = await service.create({
        approvedPayeeId: BigInt(input.approvedPayeeId),
        amount: input.amount,
        purpose: input.purpose,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
      });
      return noStoreJson(result, result.created ? 201 : 200);
    }
    if (kind === "refreshRelationship") {
      const input = refreshExpectedPaymentRelationshipInput
        .extend({ expectedPaymentId: decimalId })
        .parse(raw);
      return noStoreJson(
        await service.refreshRelationship(
          BigInt(input.expectedPaymentId),
          input.idempotencyKey,
        ),
      );
    }
    if (kind === "authorizePrepare" || kind === "authorize") {
      const input = authorizeExpectedPaymentInput.extend({ expectedPaymentId: decimalId }).parse(raw);
      const authorizations = createExpectedPaymentAuthorizationService(persistence, access);
      return noStoreJson(kind === "authorizePrepare"
        ? await authorizations.prepare(BigInt(input.expectedPaymentId), input.idempotencyKey)
        : await authorizations.submit(BigInt(input.expectedPaymentId), input.idempotencyKey, input.walletAuthorizationSignature, input.walletAuthorizationExpiry), 202);
    }
    if (kind === "authorizeReconcile") {
      const input = reconcileExpectedPaymentAuthorizationInput.extend({ expectedPaymentId: decimalId }).parse(raw);
      return noStoreJson(await createExpectedPaymentAuthorizationService(persistence, access).reconcile(BigInt(input.expectedPaymentId)), 202);
    }
    const input = cancelExpectedPaymentInput
      .extend({ expectedPaymentId: decimalId })
      .parse(raw);
    return noStoreJson(
      await service.cancel(
        BigInt(input.expectedPaymentId),
        input.idempotencyKey,
      ),
    );
  } catch (error) {
    if (
      kind === "create" &&
      error instanceof ZodError &&
      error.issues.some((issue) => issue.code === "unrecognized_keys")
    ) {
      return noStoreJson(
        { error: "This expected payment includes unsupported information." },
        400,
      );
    }
    if (
      error instanceof SyntaxError ||
      error instanceof ZodError ||
      error instanceof DomainError ||
      error instanceof AuthError
    ) {
      return errorResponse(error);
    }
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
