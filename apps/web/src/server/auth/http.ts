import "server-only";

import { DomainError } from "@basin/domain";
import { ZodError } from "zod";

import { AuthError } from "./errors";

export function noStoreJson(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigins = new Set([
    process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : new URL(request.url).origin,
  ]);

  // In local development the browser and Privy webhook can share a public
  // tunnel while APP_URL remains localhost. The tunnel is trusted only when it
  // is explicitly configured and never expands the production origin policy.
  const webhookUrl = process.env.PRIVY_WEBHOOK_PUBLIC_URL?.trim();
  const appEnvironment = process.env.APP_ENV?.trim() || "development";
  if (appEnvironment === "development" && webhookUrl) {
    try {
      expectedOrigins.add(new URL(webhookUrl).origin);
    } catch {
      // next.config.ts reports malformed tunnel URLs during server startup.
    }
  }

  if (!origin || !expectedOrigins.has(origin)) {
    throw new AuthError("FORBIDDEN", "We couldn't verify this request.");
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    const status = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      RATE_LIMITED: 429,
      UNAVAILABLE: 503,
    }[error.code];
    return noStoreJson(
      { error: error.message },
      status,
      error.retryAfter
        ? { "Retry-After": String(error.retryAfter) }
        : undefined,
    );
  }
  if (error instanceof ZodError) {
    return noStoreJson(
      {
        error: "Check the details and try again.",
        fieldErrors: error.flatten().fieldErrors,
      },
      400,
    );
  }
  if (error instanceof DomainError) {
    const status =
      error.code === "CONFLICT"
        ? 409
        : error.code === "INVALID_INPUT"
          ? 400
          : error.code === "NOT_FOUND"
            ? 404
            : 503;
    return noStoreJson({ error: error.message }, status);
  }
  return noStoreJson({ error: "We couldn't complete this request." }, 500);
}
