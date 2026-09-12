import { z } from "zod";

export const decimalId = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);

const idempotencyKey = z.string().uuid();

export const expectedPaymentListInput = z.strictObject({
  workspaceId: decimalId,
  cursor: decimalId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const expectedPaymentDetailInput = z.strictObject({
  workspaceId: decimalId,
  expectedPaymentId: decimalId,
});

export const createExpectedPaymentInput = z.strictObject({
  workspaceId: decimalId,
  approvedPayeeId: decimalId,
  amount: z.string(),
  purpose: z.string(),
  reference: z.string().optional(),
  idempotencyKey,
});

export const cancelExpectedPaymentInput = z.strictObject({
  workspaceId: decimalId,
  idempotencyKey,
});

export const refreshExpectedPaymentRelationshipInput = z.strictObject({
  workspaceId: decimalId,
  idempotencyKey,
});

export const authorizeExpectedPaymentInput = z.strictObject({
  workspaceId: decimalId,
  idempotencyKey,
  walletAuthorizationSignature: z.string().min(1).max(20_000).optional(),
  walletAuthorizationExpiry: z.number().int().positive().optional(),
});

export const reconcileExpectedPaymentAuthorizationInput = z.strictObject({
  workspaceId: decimalId,
});
export const paymentPrepareInput = z.strictObject({ workspaceId: decimalId, idempotencyKey });
export const paymentSubmitInput = z.strictObject({ workspaceId: decimalId, operationId: decimalId });
export const reconcilePaymentExecutionInput = z.strictObject({ workspaceId: decimalId });

export function strictExpectedPaymentQuery(
  url: URL,
  allowed: readonly string[],
) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new z.ZodError([
        { code: "custom", path: [key], message: "Invalid query." },
      ]);
    }
  }
  return Object.fromEntries(url.searchParams.entries());
}
