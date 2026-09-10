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
  createExpectedPaymentInput,
  decimalId,
  expectedPaymentDetailInput,
  expectedPaymentListInput,
  strictExpectedPaymentQuery,
} from "./input";
import { createExpectedPaymentService } from "./service";

export type ExpectedPaymentHandlerKind =
  "list" | "detail" | "create" | "cancel";

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
              ...(kind === "cancel" ? { expectedPaymentId } : {}),
            };
    if (kind === "create" || kind === "cancel") requireSameOrigin(request);
    const workspaceId = decimalId.parse(
      (raw as Record<string, unknown>).workspaceId,
    );
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireWorkspaceAccess(persistence, user, workspaceId);
    if (
      (kind === "create" || kind === "cancel") &&
      (access.workspace.type !== "ORGANIZATION" ||
        access.memberRole !== "ADMIN")
    ) {
      throw new AuthError("FORBIDDEN", "You don't have permission to do that.");
    }
    const service = createExpectedPaymentService(persistence, access, user.id);
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
