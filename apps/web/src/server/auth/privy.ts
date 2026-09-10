import "server-only";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  InvalidAuthTokenError,
  PrivyClient,
  RateLimitError,
} from "@privy-io/node";
import { z } from "zod";
import { address } from "@basin/domain";

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

/**
 * Privy's dashboard provides the ES256 verification key as base64-encoded
 * SubjectPublicKeyInfo. The Node SDK passes a configured key to jose's
 * `importSPKI`, which requires PEM rather than the dashboard's raw value.
 * Accept both forms so local configuration cannot make every valid session
 * look like an invalid token.
 */
export function normalizePrivyVerificationKey(key: string) {
  const value = key.trim();
  if (value.includes("-----BEGIN PUBLIC KEY-----")) return value;

  const der = Buffer.from(value, "base64");
  if (!der.length || der.toString("base64") !== value.replace(/\s/g, "")) {
    throw new AuthError(
      "UNAVAILABLE",
      "Privy authentication is not configured for this environment.",
    );
  }

  const pemBody = der.toString("base64").match(/.{1,64}/g)?.join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----`;
}

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

function getPrivyClient() {
  const environment = getPrivyEnvironment();
  client ??= new PrivyClient({
    appId: environment.appId,
    appSecret: environment.appSecret,
    jwtVerificationKey: environment.verificationKey
      ? normalizePrivyVerificationKey(environment.verificationKey)
      : undefined,
  });
  return { client, environment };
}

export const verifyPrivyAccessToken: TokenVerifier = async (accessToken) => {
  const { client, environment } = getPrivyClient();
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

const privyUserSchema = z.object({
  id: z.string(),
  linked_accounts: z.array(
    z.looseObject({
      type: z.string(),
      address: z.string().optional(),
      chain_type: z.string().optional(),
      connector_type: z.string().optional(),
      wallet_client: z.string().optional(),
      wallet_index: z.number().int().nonnegative().optional(),
    }),
  ),
});

export async function getPrivyEmbeddedController(privyUserId: string) {
  const { environment } = getPrivyClient();
  try {
    const response = await fetch(
      `https://api.privy.io/v1/users/${encodeURIComponent(privyUserId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${environment.appId}:${environment.appSecret}`).toString("base64")}`,
          "privy-app-id": environment.appId,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      throw new AuthError(
        response.status === 401 || response.status === 403
          ? "UNAUTHENTICATED"
          : "UNAVAILABLE",
        response.status === 401 || response.status === 403
          ? "Your session ended."
          : "We couldn't prepare your personal account. Try again.",
      );
    }
    const user = privyUserSchema.parse(await response.json());
    if (user.id !== privyUserId) throw new Error("Wrong Privy user");
    const wallet = user.linked_accounts
      .filter(
        (account) =>
          account.type === "wallet" &&
          account.chain_type === "ethereum" &&
          account.connector_type === "embedded" &&
          account.wallet_client === "privy" &&
          account.address,
      )
      .toSorted(
        (left, right) =>
          (left.wallet_index ?? Number.MAX_SAFE_INTEGER) -
          (right.wallet_index ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (!wallet?.address) {
      throw new AuthError(
        "UNAVAILABLE",
        "Finish your personal setup before claiming an identity.",
      );
    }
    return address.parse(wallet.address);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(
      "UNAVAILABLE",
      "We couldn't prepare your personal account. Try again.",
    );
  }
}
