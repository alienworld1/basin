import assert from "node:assert/strict";
import test from "node:test";
import { size } from "viem";

import {
  BASIN_IDENTITY_RECORD_KEY,
  decodeIdentityRecordV1,
  encodeIdentityRecordV1,
  ENSV2_SEPOLIA_DEPLOYMENT,
  EnsProtocolError,
  normalizeBasinLabel,
  ownedResolverSalt,
  resolverDataResource,
  resolverNameResource,
  ROLE_SET_DATA,
  roleCountMask,
} from "../src/index";

test("normalizes one Basin label and derives stable protocol identifiers", () => {
  const identity = normalizeBasinLabel("  Alice  ");
  assert.equal(identity.label, "alice");
  assert.equal(identity.name, "alice.basin.eth");
  assert.match(identity.labelhash, /^0x[\da-f]{64}$/);
  assert.match(identity.namehash, /^0x[\da-f]{64}$/);
  assert.equal(normalizeBasinLabel("alice").namehash, identity.namehash);
});

test("rejects empty, full, nested, invalid, oversized, and reserved labels", () => {
  const cases = [
    [" ", "Enter a Basin identity."],
    ["alice.basin.eth", "Enter only the name before .basin.eth."],
    ["alice.team", "Enter one name without dots."],
    ["a b", "Enter a valid Basin identity."],
    ["x".repeat(256), "Enter a valid Basin identity."],
    ["ADMIN", "That name is reserved by Basin."],
  ] as const;
  for (const [label, message] of cases) {
    assert.throws(
      () => normalizeBasinLabel(label),
      (error) => error instanceof EnsProtocolError && error.message === message,
    );
  }
});

test("V1 identity records round-trip exactly and reject other shapes", () => {
  const payeeId = normalizeBasinLabel("alice").namehash;
  const encoded = encodeIdentityRecordV1(payeeId);
  assert.equal(size(encoded), 96);
  assert.deepEqual(decodeIdentityRecordV1(encoded), {
    version: 1,
    payeeId,
    identityEpoch: 0n,
  });
  assert.throws(() => decodeIdentityRecordV1("0x01"));
  assert.throws(() => decodeIdentityRecordV1(`${encoded}00`));
});

test("record permissions are scoped to the exact name and data key", () => {
  const alice = normalizeBasinLabel("alice");
  const bob = normalizeBasinLabel("bob");
  assert.notEqual(
    resolverNameResource(alice.namehash),
    resolverDataResource(alice.namehash, BASIN_IDENTITY_RECORD_KEY),
  );
  assert.notEqual(
    resolverDataResource(alice.namehash, BASIN_IDENTITY_RECORD_KEY),
    resolverDataResource(bob.namehash, BASIN_IDENTITY_RECORD_KEY),
  );
  assert.equal(roleCountMask(ROLE_SET_DATA), 0xfn << 36n);
});

test("owned resolver salt is deterministic and controller-specific", () => {
  const alice = "0x1111111111111111111111111111111111111111";
  const bob = "0x2222222222222222222222222222222222222222";
  assert.equal(ownedResolverSalt(alice), ownedResolverSalt(alice));
  assert.notEqual(ownedResolverSalt(alice), ownedResolverSalt(bob));
});

test("pins the current official ENSv2 Sepolia deployment", () => {
  assert.equal(ENSV2_SEPOLIA_DEPLOYMENT.chainId, 11155111);
  assert.equal(
    ENSV2_SEPOLIA_DEPLOYMENT.sourceCommit,
    "48b3e2d39513b9dd32ef1850877a29009bc807b9",
  );
  assert.equal(ENSV2_SEPOLIA_DEPLOYMENT.namespace, "basin.eth");
});
