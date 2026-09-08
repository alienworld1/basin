import { z } from "zod";
import { receivingAddress } from "@basin/ens";
const id = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const revision = z.string().regex(/^(0|[1-9]\d{0,77})$/);
export const destinationInput = z
  .string()
  .max(100)
  .transform((value, ctx) => {
    try {
      return receivingAddress(value);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });
export const statusInput = z.strictObject({
  workspaceId: id,
  relationshipId: id.optional(),
});
export const preferenceInput = z.strictObject({
  workspaceId: id,
  destination: destinationInput,
  expectedRevision: revision.nullable(),
});
export const prepareInput = z.strictObject({
  workspaceId: id,
  relationshipId: id,
  destination: destinationInput,
  idempotencyKey: z.string().uuid(),
});
export const reconcileInput = z.strictObject({
  workspaceId: id,
  operationId: id,
});
export const recoveryInput = reconcileInput.extend({
  walletOutcome: z.literal("REJECTED").optional(),
});
export const confirmInput = reconcileInput.extend({
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value.toLowerCase()),
});
