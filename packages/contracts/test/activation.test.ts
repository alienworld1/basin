import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import { acceptanceMessageHash, securityRootCommitment } from "../src/index";

const one = `0x${"11".repeat(20)}` as const;
const two = `0x${"22".repeat(20)}` as const;
const hash = `0x${"33".repeat(32)}` as const;

test("SecurityRootV1 and acceptance remain deterministic and domain-bound", async () => {
  const commitment = securityRootCommitment({
    payeeId: hash,
    identityController: one,
    identityEpoch: 3n,
    relationshipRegistry: two,
    relationshipTokenId: 9n,
    resolverProxy: one,
    resolverImplementation: two,
    resolverImplementationCodeHash: hash,
    resolverPermissionProfileHash: hash,
    registryPermissionProfileHash: hash,
  });
  const message = {
    organization: one,
    relationshipNamehash: hash,
    relationshipTokenId: 9n,
    payeeId: hash,
    securityRootCommitment: commitment,
    expiry: 2_000_000_000n,
    nonce: 0n,
  };
  const digest = acceptanceMessageHash(two, message);
  assert.match(commitment, /^0x[0-9a-f]{64}$/);
  assert.match(digest, /^0x[0-9a-f]{64}$/);
  assert.notEqual(
    digest,
    acceptanceMessageHash(one, message),
    "verifying contract must change the signed message",
  );
  const account = privateKeyToAccount(`0x${"44".repeat(32)}`);
  assert.match(await account.sign({ hash: digest }), /^0x[0-9a-f]{130}$/);
});
