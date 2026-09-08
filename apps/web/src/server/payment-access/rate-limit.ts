import "server-only";

import { createHash } from "node:crypto";
import { AuthError } from "../auth/errors";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceInvitationRateLimit(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const signal = forwarded || request.headers.get("user-agent") || "unknown";
  const key = createHash("sha256").update(signal).digest("hex");
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS) {
    throw new AuthError(
      "RATE_LIMITED",
      "Too many invitation requests. Try again shortly.",
      Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    );
  }
  if (buckets.size > 2_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
}
