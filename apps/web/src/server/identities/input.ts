import { z } from "zod";

const workspaceId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19);

export const identityClaimRequest = z
  .object({
    workspaceId,
    label: z.string(),
  })
  .strict();

export function readStrictIdentityQuery(url: URL, keys: readonly string[]) {
  const allowed = new Set(keys);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new z.ZodError([
        { code: "custom", path: [key], message: "Invalid query." },
      ]);
    }
  }
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null) result[key] = value;
  }
  return result;
}

export const availabilityQuery = z
  .object({ workspace: workspaceId, label: z.string() })
  .strict();

export const identityStatusQuery = z
  .object({
    workspace: workspaceId,
    name: z.string(),
    transaction: z
      .string()
      .regex(/^0x[\da-fA-F]{64}$/)
      .optional(),
  })
  .strict();
