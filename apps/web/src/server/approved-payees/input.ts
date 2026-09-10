import { z } from "zod";

const id = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const idempotencyKey = z.string().uuid();

export const listInput = z.strictObject({
  workspaceId: id,
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export const detailInput = z.strictObject({
  workspaceId: id,
  relationshipId: id,
});
export const resolveInput = z.strictObject({
  workspaceId: id,
  identity: z.string().trim().min(1).max(255),
});
export const setupInput = z.strictObject({
  workspaceId: id,
  organizationLabel: z.string().trim().min(1).max(255),
  idempotencyKey,
});
export const prepareInput = z.discriminatedUnion("action", [
  z.strictObject({
    workspaceId: id,
    action: z.literal("PROPOSE"),
    identityId: id,
    expiresAt: z.iso.datetime({ offset: true }),
    idempotencyKey,
  }),
  z.strictObject({
    workspaceId: id,
    action: z.literal("REVOKE"),
    relationshipId: id,
    reason: z.string().trim().min(1).max(240).optional(),
    idempotencyKey,
  }),
]);
export const acceptPrepareInput = z.strictObject({
  workspaceId: id,
  idempotencyKey,
});
export const authorizeInput = z.strictObject({
  workspaceId: id,
  operationId: id,
  signature: z
    .string()
    .regex(/^0x([0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/)
    .transform((value) => value.toLowerCase())
    .optional(),
  walletAuthorizationSignature: z
    .string()
    .min(80)
    .max(512)
    .regex(/^[A-Za-z0-9+/_=-]+$/)
    .optional(),
  walletAuthorizationExpiry: z.number().int().positive().optional(),
});
export const reconcileInput = z.strictObject({
  workspaceId: id,
  operationId: id,
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value.toLowerCase())
    .optional(),
});

export function strictQuery(url: URL, allowed: readonly string[]) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new z.ZodError([
        { code: "custom", path: [key], message: "Invalid query." },
      ]);
    }
  }
  return Object.fromEntries(url.searchParams.entries());
}
