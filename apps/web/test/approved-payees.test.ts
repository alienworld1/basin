import assert from "node:assert/strict";
import test from "node:test";

import { approvedPayeeHandler } from "../src/server/approved-payees/http";
import {
  acceptPrepareInput,
  authorizeInput,
  prepareInput,
  reconcileInput,
  resolveInput,
} from "../src/server/approved-payees/input";

const idempotencyKey = "91a58b23-33ae-4426-a57e-2c098fe30e91";

test("approved-payee requests accept identifiers and intent, never authority overrides", () => {
  assert.deepEqual(
    resolveInput.parse({ workspaceId: "2", identity: " adrian.basin.eth " }),
    { workspaceId: "2", identity: "adrian.basin.eth" },
  );
  assert.doesNotThrow(() =>
    prepareInput.parse({
      workspaceId: "2",
      action: "PROPOSE",
      identityId: "1",
      expiresAt: "2026-12-08T11:58:00.000Z",
      idempotencyKey,
    }),
  );
  for (const field of ["organization", "controller", "registry", "root"])
    assert.throws(() =>
      prepareInput.parse({
        workspaceId: "2",
        action: "PROPOSE",
        identityId: "1",
        expiresAt: "2026-12-08T11:58:00.000Z",
        idempotencyKey,
        [field]: "0x1111111111111111111111111111111111111111",
      }),
    );
});

test("revocation reasons are optional, normalized, bounded, and request-scoped", () => {
  assert.deepEqual(
    prepareInput.parse({
      workspaceId: "2",
      action: "REVOKE",
      relationshipId: "7",
      reason: "  Duplicate supplier record  ",
      idempotencyKey,
    }),
    {
      workspaceId: "2",
      action: "REVOKE",
      relationshipId: "7",
      reason: "Duplicate supplier record",
      idempotencyKey,
    },
  );
  assert.throws(() =>
    prepareInput.parse({
      workspaceId: "2",
      action: "REVOKE",
      relationshipId: "7",
      reason: "x".repeat(241),
      idempotencyKey,
    }),
  );
  assert.throws(() =>
    prepareInput.parse({
      workspaceId: "2",
      action: "REVOKE",
      relationshipId: "7",
      reason: "Duplicate",
      idempotencyKey,
      organizationId: "1",
    }),
  );
});

test("recipient authorization and reconciliation constrain signed evidence", () => {
  assert.doesNotThrow(() =>
    acceptPrepareInput.parse({ workspaceId: "1", idempotencyKey }),
  );
  assert.doesNotThrow(() =>
    authorizeInput.parse({
      workspaceId: "1",
      operationId: "16",
      signature: `0x${"a".repeat(130)}`,
    }),
  );
  assert.throws(() =>
    authorizeInput.parse({
      workspaceId: "1",
      operationId: "16",
      signature: "0x1234",
    }),
  );
  assert.throws(() =>
    reconcileInput.parse({
      workspaceId: "1",
      operationId: "16",
      transactionHash: "0x1234",
    }),
  );
  assert.deepEqual(
    reconcileInput.parse({ workspaceId: "1", relationshipId: "16" }),
    { workspaceId: "1", relationshipId: "16" },
  );
  assert.throws(() =>
    reconcileInput.parse({
      workspaceId: "1",
      operationId: "16",
      relationshipId: "16",
    }),
  );
});

test("every approved-payee handler authenticates before reading configuration or data", async () => {
  for (const kind of [
    "list",
    "detail",
    "resolve",
    "setup",
    "prepare",
    "accept",
    "authorize",
    "reconcile",
  ] as const) {
    const response = await approvedPayeeHandler(
      new Request("https://basin.test/api/approved-payees?workspaceId=1", {
        method: ["list", "detail"].includes(kind) ? "GET" : "POST",
      }),
      kind,
      kind === "detail" || kind === "accept" ? "1" : undefined,
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
