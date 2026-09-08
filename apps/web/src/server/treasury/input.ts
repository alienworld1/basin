import { z } from "zod";

export const treasuryMutationInput = z
  .object({
    workspaceId: z.string().regex(/^[1-9]\d{0,18}$/),
    idempotencyKey: z.string().trim().min(16).max(160),
  })
  .strict();

export const treasuryWorkspaceInput = z
  .object({ workspaceId: z.string().regex(/^[1-9]\d{0,18}$/) })
  .strict();
