import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, maxUint256, zeroAddress, zeroHash } from "viem";
import {
  decodeSettlementDescriptor,
  decodeSettlementRecord,
  descriptorRecord,
  encodeSettlementDescriptor,
  encodeSettlementRecord,
  nextSettlementEpoch,
  receivingAddress,
  settlementCommitment,
  verifyDescriptorRecord,
  type SettlementDescriptorV1,
} from "../src/settlement-record";
import { verifyRelationshipPermissionProfile } from "../src/settlement";
import { ROLE_SET_DATA } from "../src/roles";

const descriptor: SettlementDescriptorV1 = {
  version: 1,
  chainId: 11155111n,
  asset: "0x1111111111111111111111111111111111111111",
  destination: "0x2222222222222222222222222222222222222222",
  settlementEpoch: 0n,
  validFrom: 1700000000n,
};
const vector =
  `0x${["1", "aa36a7", "1111111111111111111111111111111111111111", "2222222222222222222222222222222222222222", "0", "6553f100"].map((word) => word.padStart(64, "0")).join("")}` as const;
test("V1 ABI vector is six ordinary words, lossless and scoped to Sepolia", () => {
  assert.equal(encodeSettlementDescriptor(descriptor), vector);
  assert.deepEqual(decodeSettlementDescriptor(vector), descriptor);
  assert.equal((vector.length - 2) / 2, 192);
  assert.equal((descriptorRecord(descriptor).length - 2) / 2, 96);
  assert.deepEqual(decodeSettlementRecord(descriptorRecord(descriptor)), {
    version: 1,
    settlementEpoch: 0n,
    commitment: settlementCommitment(descriptor),
  });
  assert.throws(() =>
    encodeSettlementDescriptor({ ...descriptor, chainId: 1n }),
  );
});
test("strict lengths, canonical ABI padding, versions and commitments fail closed", () => {
  for (const bytes of [
    "0x",
    `${vector}00`,
    vector.slice(0, -2),
    `0x01${vector.slice(4)}`,
  ])
    assert.throws(() => decodeSettlementDescriptor(bytes as `0x${string}`));
  const record = descriptorRecord(descriptor);
  for (const bytes of [
    "0x",
    `${record}00`,
    record.slice(0, -2),
    encodeAbiParameters(
      [{ type: "uint8" }, { type: "uint256" }, { type: "bytes32" }],
      [2, 0n, settlementCommitment(descriptor)],
    ),
  ])
    assert.throws(() => decodeSettlementRecord(bytes as `0x${string}`));
  assert.throws(() =>
    encodeSettlementRecord({
      version: 1,
      settlementEpoch: 0n,
      commitment: zeroHash,
    }),
  );
  assert.throws(() =>
    verifyDescriptorRecord(
      { ...descriptor, destination: descriptor.asset },
      record,
    ),
  );
});
test("addresses require nonzero, valid checksum; contract destinations remain permitted", () => {
  assert.equal(
    receivingAddress(" 0x52908400098527886E0F7030069857D2E4169EE7 "),
    "0x52908400098527886e0f7030069857d2e4169ee7",
  );
  assert.throws(() =>
    receivingAddress("0x52908400098527886E0F7030069857D2E4169Ee7"),
  );
  assert.throws(() => receivingAddress(zeroAddress));
  assert.throws(() =>
    receivingAddress(descriptor.destination, [descriptor.destination]),
  );
});
test("epochs begin at zero, advance by one and never overflow or round", () => {
  assert.equal(nextSettlementEpoch(null), 0n);
  assert.equal(nextSettlementEpoch(0n), 1n);
  assert.equal(nextSettlementEpoch(9007199254740993n), 9007199254740994n);
  assert.throws(() => nextSettlementEpoch(maxUint256));
  assert.throws(() => nextSettlementEpoch(-1n));
  assert.throws(() =>
    encodeSettlementDescriptor({
      ...descriptor,
      settlementEpoch: maxUint256 + 1n,
    }),
  );
});
const profile = {
  counts: [0n, 0n, 0n, ROLE_SET_DATA],
  controllerRoles: ROLE_SET_DATA,
  rootCounts: 1n | (1n << 12n) | (1n << 16n),
  nameCounts: 0n,
  controllerRegistryRoot: 0n,
  parentRootCounts: 1n,
  parentCounts: 0n,
};
test("relationship profile permits payer lifecycle but rejects broader powers and admins", () => {
  assert.doesNotThrow(() => verifyRelationshipPermissionProfile(profile));
  for (let i = 0; i < 3; i++) {
    const counts = [...profile.counts];
    counts[i] = ROLE_SET_DATA;
    assert.throws(() =>
      verifyRelationshipPermissionProfile({ ...profile, counts }),
    );
  }
  for (const role of [1n << 20n, 1n << 24n, 1n << 124n, 1n << 156n, 1n << 252n])
    assert.throws(() =>
      verifyRelationshipPermissionProfile({
        ...profile,
        rootCounts: profile.rootCounts | role,
      }),
    );
  assert.throws(() =>
    verifyRelationshipPermissionProfile({
      ...profile,
      counts: [0n, 0n, 0n, 2n * ROLE_SET_DATA],
    }),
  );
  assert.throws(() =>
    verifyRelationshipPermissionProfile({
      ...profile,
      controllerRegistryRoot: 1n << 16n,
    }),
  );
  assert.throws(() =>
    verifyRelationshipPermissionProfile({
      ...profile,
      parentCounts: 1n << 20n,
    }),
  );
});
