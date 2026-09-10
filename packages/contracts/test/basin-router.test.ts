import assert from "node:assert/strict";
import test from "node:test";

import { obligationId, obligationMetadataHash } from "../src/index";

const organization = `0x${"11".repeat(20)}` as const;
const router = `0x${"22".repeat(20)}` as const;
const asset = `0x${"33".repeat(20)}` as const;
const relationship = `0x${"44".repeat(32)}` as const;
const payee = `0x${"55".repeat(32)}` as const;

test("Router obligation identifiers are stable and scoped to the deployment", () => {
  const first = obligationId({ router, organization, expectedPaymentId: 12n });
  assert.equal(first, obligationId({ router, organization, expectedPaymentId: 12n }));
  assert.notEqual(first, obligationId({ router: asset, organization, expectedPaymentId: 12n }));
  assert.match(first, /^0x[0-9a-f]{64}$/);
});

test("Router metadata commits every economic field with explicit nullable reference encoding", () => {
  const base = {
    router,
    organization,
    relationshipNamehash: relationship,
    relationshipTokenId: 4n,
    payeeId: payee,
    asset,
    amount: 1_250_000n,
    purpose: "September engineering",
    expectedPaymentId: 12n,
  };
  const noReference = obligationMetadataHash(base);
  assert.equal(noReference, obligationMetadataHash(base));
  assert.notEqual(noReference, obligationMetadataHash({ ...base, reference: "INV-9" }));
  assert.notEqual(noReference, obligationMetadataHash({ ...base, amount: 1_250_001n }));
});
