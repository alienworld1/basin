import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@basin/domain";

import { AuthError } from "../src/server/auth/errors";
import {
  errorResponse,
  noStoreJson,
  requireSameOrigin,
} from "../src/server/auth/http";
import {
  readBearerToken,
  requireAuthenticatedUser,
  requireOrganizationRole,
  requireWorkspaceAccess,
} from "../src/server/auth/authorization";
import { normalizeVerifiedClaims } from "../src/server/auth/privy";
import { workspaceRequest } from "../src/server/auth/workspace-input";
import { requestBootstrap } from "../src/ui/auth/bootstrap-client";

type Persistence = Parameters<typeof requireAuthenticatedUser>[1];

const request = (authorization?: string) =>
  new Request("https://basin.test/api/auth/bootstrap", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });

const principal = {
  privyUserId: "did:privy:verified",
  sessionId: "session-1",
  expiresAt: 2_000_000_000,
};

test("bearer parsing rejects missing, malformed, and repeated credentials", () => {
  assert.throws(() => readBearerToken(request()), AuthError);
  assert.throws(() => readBearerToken(request("Basic value")), AuthError);
  assert.throws(
    () => readBearerToken(request("Bearer first, Bearer second")),
    AuthError,
  );
  assert.equal(readBearerToken(request("Bearer access-token")), "access-token");
});

test("authenticated user mapping trusts only the verified subject", async () => {
  let mappedSubject = "";
  const persistence = {
    workspaces: {
      findOrCreateUser: async (input: { privy_user_id: string }) => {
        mappedSubject = input.privy_user_id;
        return {
          id: BigInt(1),
          privy_user_id: input.privy_user_id,
          display_name: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
      },
    },
  } as unknown as Persistence;
  const result = await requireAuthenticatedUser(
    request("Bearer valid"),
    persistence,
    async () => principal,
  );
  assert.equal(mappedSubject, principal.privyUserId);
  assert.equal(result.user.id, BigInt(1));
});

test("verification failure creates no Basin user", async () => {
  let writes = 0;
  const persistence = {
    workspaces: {
      findOrCreateUser: async () => {
        writes += 1;
      },
    },
  } as unknown as Persistence;
  await assert.rejects(
    requireAuthenticatedUser(
      request("Bearer invalid"),
      persistence,
      async () => {
        throw new AuthError("UNAUTHENTICATED", "Your session ended.");
      },
    ),
    AuthError,
  );
  assert.equal(writes, 0);
});

test("verified claims reject expired and wrong-app sessions", () => {
  const claims = {
    app_id: "app-a",
    user_id: "did:privy:user",
    session_id: "session",
    expiration: 2_000,
  };
  assert.throws(
    () => normalizeVerifiedClaims(claims, "app-b", 1_000_000),
    AuthError,
  );
  assert.throws(
    () => normalizeVerifiedClaims(claims, "app-a", 2_001_000),
    AuthError,
  );
  assert.equal(
    normalizeVerifiedClaims(claims, "app-a", 1_000_000).privyUserId,
    claims.user_id,
  );
});

test("workspace creation input is strict, trimmed, and bounded", () => {
  assert.deepEqual(
    workspaceRequest.parse({ type: "PERSONAL", displayName: "  Alice  " }),
    { type: "PERSONAL", displayName: "Alice" },
  );
  assert.throws(() =>
    workspaceRequest.parse({ type: "TEAM", displayName: "Acme" }),
  );
  assert.throws(() =>
    workspaceRequest.parse({ type: "ORGANIZATION", displayName: " " }),
  );
  assert.throws(() =>
    workspaceRequest.parse({
      type: "ORGANIZATION",
      displayName: "A".repeat(121),
    }),
  );
  assert.throws(() =>
    workspaceRequest.parse({
      type: "ORGANIZATION",
      displayName: "Acme",
      role: "ADMIN",
    }),
  );
});

test("workspace and organization role authorization stay server scoped", async () => {
  const user = { id: BigInt(7) } as never;
  const persistence = {
    workspaces: {
      readWorkspaceAccess: async (_userId: bigint, workspaceId: bigint) => ({
        workspace: { id: workspaceId, type: "ORGANIZATION" },
        organizationId: BigInt(4),
        memberRole: "PAYMENT_OPERATOR",
      }),
    },
  } as unknown as Persistence;
  assert.equal(
    (await requireWorkspaceAccess(persistence, user, "8")).workspace.id,
    BigInt(8),
  );
  await assert.rejects(
    requireOrganizationRole(persistence, user, "8", ["ADMIN"]),
    (error) => error instanceof AuthError && error.code === "FORBIDDEN",
  );
  assert.equal(
    (
      await requireOrganizationRole(persistence, user, "8", [
        "PAYMENT_OPERATOR",
      ])
    ).memberRole,
    "PAYMENT_OPERATOR",
  );
  await assert.rejects(
    requireWorkspaceAccess(persistence, user, "900719925474099312345"),
    (error) => error instanceof AuthError && error.code === "NOT_FOUND",
  );
});

test("organization role checks deny personal workspaces and missing membership", async () => {
  const user = { id: BigInt(7) } as never;
  const personalPersistence = {
    workspaces: {
      readWorkspaceAccess: async () => ({
        workspace: { id: BigInt(8), type: "PERSONAL" },
        organizationId: null,
        memberRole: null,
      }),
    },
  } as unknown as Persistence;
  await assert.rejects(
    requireOrganizationRole(personalPersistence, user, "8", ["ADMIN"]),
    (error) => error instanceof AuthError && error.code === "FORBIDDEN",
  );

  const inaccessiblePersistence = {
    workspaces: {
      readWorkspaceAccess: async () => {
        throw new DomainError("NOT_FOUND");
      },
    },
  } as unknown as Persistence;
  await assert.rejects(
    requireWorkspaceAccess(inaccessiblePersistence, user, "8"),
    (error) => error instanceof AuthError && error.code === "FORBIDDEN",
  );
});

test("mutation origin checks fail closed", () => {
  const previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://basin.test/app";
  try {
    assert.doesNotThrow(() =>
      requireSameOrigin(
        new Request("https://basin.test/api/workspaces", {
          headers: { origin: "https://basin.test" },
        }),
      ),
    );
    assert.throws(
      () =>
        requireSameOrigin(
          new Request("https://basin.test/api/workspaces", {
            headers: { origin: "https://attacker.test" },
          }),
        ),
      (error) => error instanceof AuthError && error.code === "FORBIDDEN",
    );
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("auth responses remain non-cacheable with safe status mapping", async () => {
  const response = noStoreJson(
    { ok: true },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
  assert.equal(response.headers.get("cache-control"), "no-store");

  const unauthorized = errorResponse(
    new AuthError("UNAUTHENTICATED", "Your session ended."),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("cache-control"), "no-store");
  assert.deepEqual(await unauthorized.json(), { error: "Your session ended." });
});

test("bootstrap deduplication never crosses token-source boundaries", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return Response.json({ user: { id: "1" }, workspaces: [] });
  };
  try {
    const firstSession = async () => "first-token";
    await Promise.all([
      requestBootstrap(firstSession),
      requestBootstrap(firstSession),
    ]);
    assert.equal(fetches, 1);

    await Promise.all([
      requestBootstrap(async () => "second-token"),
      requestBootstrap(async () => "third-token"),
    ]);
    assert.equal(fetches, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
