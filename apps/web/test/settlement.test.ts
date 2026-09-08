import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import {
  confirmInput,
  preferenceInput,
  prepareInput,
  statusInput,
} from "../src/server/settlement/input";
import {
  operationContext,
  preferenceContext,
  seal,
  unseal,
} from "../src/server/settlement/protection";
import { receivingHandler } from "../src/server/settlement/http";

const destination = "0x1111111111111111111111111111111111111111";
test("preference input requires a revision and rejects authority overrides", () => {
  const input = { workspaceId: "42", destination, expectedRevision: null };
  assert.deepEqual(preferenceInput.parse(input), input);
  for (const key of [
    "chainId",
    "asset",
    "controller",
    "epoch",
    "resolver",
    "root",
    "calldata",
    "descriptor",
  ])
    assert.throws(() => preferenceInput.parse({ ...input, [key]: "override" }));
  assert.throws(() =>
    preferenceInput.parse({ ...input, expectedRevision: "01" }),
  );
  assert.throws(() =>
    preferenceInput.parse({ ...input, workspaceId: "9223372036854775808" }),
  );
  assert.throws(() =>
    preferenceInput.parse({ ...input, destination: "alice.eth" }),
  );
});
test("protocol requests accept resource IDs, destination and idempotency only", () => {
  assert.doesNotThrow(() =>
    prepareInput.parse({
      workspaceId: "1",
      relationshipId: "2",
      destination,
      idempotencyKey: "91a58b23-33ae-4426-a57e-2c098fe30e91",
    }),
  );
  assert.throws(() =>
    prepareInput.parse({
      workspaceId: "1",
      relationshipId: "2",
      destination,
      idempotencyKey: "one",
    }),
  );
  assert.throws(() =>
    confirmInput.parse({
      workspaceId: "1",
      operationId: "2",
      transactionHash: "0x123",
    }),
  );
  assert.throws(() => statusInput.parse({ workspaceId: "1", identityId: "2" }));
});
test("AES-GCM encrypts nondeterministically and binds every ownership scope", () => {
  const secret = { version: "v1", key: randomBytes(32) };
  const context = preferenceContext(1n, 2n);
  const first = seal(destination, context, secret),
    second = seal(destination, context, secret);
  assert.notEqual(first, second);
  assert.ok(first.length <= 240);
  assert.ok(!first.includes(destination));
  assert.equal(unseal(first, context, secret), destination);
  assert.throws(() => unseal(first, preferenceContext(3n, 2n), secret));
  assert.throws(() => unseal(first, preferenceContext(1n, 3n), secret));
  assert.throws(() =>
    unseal(first, context, { ...secret, key: randomBytes(32) }),
  );
  assert.throws(() => unseal(first, context, { ...secret, version: "v2" }));
  assert.throws(() => unseal(first + ".extra", context, secret));
  const parts = first.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => unseal(parts.join("."), context, secret));
  const operation = seal(
    "protected descriptor",
    operationContext(1n, 2n, 3n, "request"),
    secret,
  );
  assert.throws(() =>
    unseal(operation, operationContext(1n, 2n, 4n, "request"), secret),
  );
  assert.throws(() =>
    unseal(operation, operationContext(1n, 2n, 3n, "another"), secret),
  );
});
test("every settlement handler rejects unauthenticated requests before DB/config access", async () => {
  for (const kind of [
    "status",
    "preference",
    "prepare",
    "confirm",
    "reconcile",
    "authorize",
    "cancel",
  ] as const) {
    const response = await receivingHandler(
      new Request(`https://basin.test/api/settlement/${kind}?workspaceId=1`, {
        method: kind === "status" ? "GET" : "POST",
      }),
      kind,
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    assert.ok(!body.includes(destination));
    assert.ok(!body.includes("ciphertext"));
  }
});
