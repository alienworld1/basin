import assert from "node:assert/strict";
import test from "node:test";
import type { createPersistence } from "@basin/db";

import {
  acceptInvitationRequest,
  createInvitationRequest,
} from "../src/server/payment-access/input";
import { createPaymentAccessService } from "../src/server/payment-access/service";

type Persistence = ReturnType<typeof createPersistence>;

const now = new Date();
const access = {
  workspace: {
    id: 7n,
    type: "ORGANIZATION",
    display_name: "Acme Research",
    owner_user_id: 1n,
    created_at: now,
    updated_at: now,
  },
  organizationId: 8n,
  memberRole: "ADMIN",
} as const;

test("invitation inputs reject authority fields and normalize safe names", () => {
  assert.deepEqual(
    createInvitationRequest.parse({
      workspaceId: "7",
      inviteeLabel: "  Jordan Lee  ",
      idempotencyKey: "a".repeat(64),
    }),
    {
      workspaceId: "7",
      inviteeLabel: "Jordan Lee",
      idempotencyKey: "a".repeat(64),
    },
  );
  assert.throws(() =>
    createInvitationRequest.parse({
      workspaceId: "7",
      inviteeLabel: "Jordan",
      idempotencyKey: "a".repeat(64),
      role: "ADMIN",
    }),
  );
  assert.throws(() => acceptInvitationRequest.parse({ userId: "9" }));
  assert.throws(() =>
    acceptInvitationRequest.parse({ displayName: "A".repeat(121) }),
  );
});

test("invitation links are stable for a retry while persistence sees only a hash", async () => {
  const previousSecret = process.env.PRIVY_APP_SECRET;
  process.env.PRIVY_APP_SECRET = "test-only-server-secret";
  const captured: Record<string, unknown>[] = [];
  const repository = {
    createInvitation: async (values: Record<string, unknown>) => {
      captured.push(values);
      return {
        id: 10n,
        organization_id: 8n,
        role: "PAYMENT_OPERATOR",
        invitee_label: "Jordan Lee",
        secret_version: 1,
        secret_hash: values.secretHash,
        status: "PENDING",
        expires_at: values.expiresAt,
        created_by_user_id: 1n,
        accepted_by_user_id: null,
        accepted_at: null,
        revoked_by_user_id: null,
        revoked_at: null,
        created_at: now,
        updated_at: now,
      };
    },
  };
  try {
    const service = createPaymentAccessService({
      paymentAccess: repository,
    } as unknown as Persistence);
    const first = await service.createInvitation(
      access as never,
      1n,
      "Jordan Lee",
      "b".repeat(64),
      "https://basin.test",
    );
    const retry = await service.createInvitation(
      access as never,
      1n,
      "Jordan Lee",
      "b".repeat(64),
      "https://basin.test",
    );
    assert.equal(first.invitationUrl, retry.invitationUrl);
    assert.match(String(captured[0].secretHash), /^0x[0-9a-f]{64}$/);
    assert.notEqual(
      captured[0].secretHash,
      first.invitationUrl.split("/").at(-1),
    );
  } finally {
    process.env.PRIVY_APP_SECRET = previousSecret;
  }
});

test("public invitation review does not disclose organization data", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  let status = "PENDING" as "PENDING" | "ACCEPTED";
  const repository = {
    preflight: async () => ({
      invitation: {
        id: 10n,
        organization_id: 8n,
        status,
        expires_at: expiresAt,
        accepted_by_user_id: null,
      },
      organizationName: "Acme Research",
      workspaceId: 7n,
      membership: null,
      displayName: null,
      expired: false,
    }),
  };
  const service = createPaymentAccessService({
    paymentAccess: repository,
  } as unknown as Persistence);
  assert.deepEqual(await service.review("s".repeat(43)), {
    state: "VALID",
    authenticated: false,
  });
  assert.deepEqual(await service.review("s".repeat(43), 2n), {
    state: "VALID",
    authenticated: true,
    organizationName: "Acme Research",
    expiresAt: expiresAt.toISOString(),
    needsDisplayName: true,
    workspaceId: "7",
  });
  status = "ACCEPTED";
  assert.deepEqual(await service.review("s".repeat(43)), {
    state: "UNAVAILABLE",
    authenticated: false,
  });
});
