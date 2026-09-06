import "server-only";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  InvalidAuthTokenError,
  PrivyClient,
  RateLimitError,
} from "@privy-io/node";
import { z } from "zod";

import { AuthError } from "./errors";

export type AuthenticatedPrincipal = {
  privyUserId: string;
  sessionId: string;
  expiresAt: number;
};

export type TokenVerifier = (
  accessToken: string,
) => Promise<AuthenticatedPrincipal>;

type VerifiedAccessClaims = {
  app_id: string;
  user_id: string;
  session_id: string;
  expiration: number;
};

export function normalizeVerifiedClaims(
  claims: VerifiedAccessClaims,
  appId: string,
  now = Date.now(),
): AuthenticatedPrincipal {
  if (
    claims.app_id !== appId ||
    claims.expiration <= now / 1000 ||
    !claims.user_id ||
    !claims.session_id
  ) {
    throw new AuthError("UNAUTHENTICATED", "Your session ended.");
  }
  return {
    privyUserId: claims.user_id,
    sessionId: claims.session_id,
    expiresAt: claims.expiration,
  };
}

const privyEnvironmentSchema = z.object({
  appId: z.string().trim().min(1),
  appSecret: z.string().trim().min(1),
  verificationKey: z.string().trim().min(1).optional(),
});

function getPrivyEnvironment() {
  const result = privyEnvironmentSchema.safeParse({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET,
    verificationKey: process.env.PRIVY_JWT_VERIFICATION_KEY || undefined,
  });
  if (!result.success) {
    throw new AuthError(
      "UNAVAILABLE",
      "Privy authentication is not configured for this environment.",
    );
  }
  return result.data;
}

let client: PrivyClient | undefined;

export const verifyPrivyAccessToken: TokenVerifier = async (accessToken) => {
  const environment = getPrivyEnvironment();
  client ??= new PrivyClient({
    appId: environment.appId,
    appSecret: environment.appSecret,
    jwtVerificationKey: environment.verificationKey,
  });
  try {
    const claims = await client.utils().auth().verifyAccessToken(accessToken);
    return normalizeVerifiedClaims(claims, environment.appId);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof InvalidAuthTokenError) {
      throw new AuthError("UNAUTHENTICATED", "Your session ended.");
    }
    if (error instanceof RateLimitError) {
      throw new AuthError("RATE_LIMITED", "Authentication is busy.", 1);
    }
    if (
      error instanceof APIConnectionError ||
      error instanceof APIConnectionTimeoutError
    ) {
      throw new AuthError("UNAVAILABLE", "Authentication is unavailable.");
    }
    throw new AuthError("UNAVAILABLE", "Authentication is unavailable.");
  }
};
