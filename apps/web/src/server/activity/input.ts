import { z } from "zod";

export const decimalId = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);

export const activityQuery = z.strictObject({
  workspaceId: decimalId,
  cursor: z.string().min(1).max(300).optional(),
});

const cursorPayload = z.strictObject({
  v: z.literal(1),
  t: z.string().datetime(),
  id: decimalId,
});

export function decodeActivityCursor(value?: string) {
  if (!value) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const payload = cursorPayload.parse(JSON.parse(decoded));
    return { occurredAt: new Date(payload.t), id: BigInt(payload.id) };
  } catch {
    throw new z.ZodError([
      { code: "custom", path: ["cursor"], message: "Invalid cursor." },
    ]);
  }
}

export function encodeActivityCursor(occurredAt: Date, id: bigint) {
  return Buffer.from(
    JSON.stringify({ v: 1, t: occurredAt.toISOString(), id: id.toString() }),
  ).toString("base64url");
}

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
