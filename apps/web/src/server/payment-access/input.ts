import { displayName } from "@basin/domain";
import { z } from "zod";

const workspaceId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19);
const idempotencyKey = z.string().trim().min(16).max(160);

export const createInvitationRequest = z
  .object({
    workspaceId,
    inviteeLabel: displayName,
    idempotencyKey,
  })
  .strict();

export const replaceInvitationRequest = z.object({ idempotencyKey }).strict();

export const acceptInvitationRequest = z
  .object({ displayName: displayName.optional() })
  .strict();

export const leaveOrganizationRequest = z.object({ workspaceId }).strict();

export const paymentAccessQuery = z.object({ workspace: workspaceId }).strict();

export function pathRecordId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("Invalid record id");
  const parsed = BigInt(value);
  if (parsed > BigInt("9223372036854775807"))
    throw new Error("Invalid record id");
  return parsed;
}
