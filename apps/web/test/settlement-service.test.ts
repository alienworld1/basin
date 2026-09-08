import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import type { createPersistence } from "@basin/db";
import type { SettlementOperation } from "@basin/db/schema";
import { DomainError } from "@basin/domain";
import {
  descriptorRecord,
  settlementCommitment,
  SettlementError,
  type PreparedSettlement,
  type SettlementObservation,
  type createSettlementAdapter,
} from "@basin/ens";
import { createReceivingService } from "../src/server/settlement/service";

type Persistence = ReturnType<typeof createPersistence>;
const addr = "0x1111111111111111111111111111111111111111" as const;
const dest = "0x2222222222222222222222222222222222222222" as const;
const digest = `0x${"a".repeat(64)}` as const;
const prepared: PreparedSettlement = {
  scope: {
    name: "alice.acme.basin.eth",
    identityName: "alice.basin.eth",
    controller: addr,
    identityEpoch: 0n,
    tokenId: 4n,
    registry: addr,
  },
  descriptor: {
    version: 1,
    chainId: 11155111n,
    asset: addr,
    destination: dest,
    settlementEpoch: 0n,
    validFrom: 1700000000n,
  },
  expectedRecord: "0x",
  profile: digest,
  preparedBlock: 12n,
  expiresAt: 1700000600n,
  transaction: {
    to: addr,
    from: addr,
    data: "0x1234",
    value: "0x0",
    chainId: 11155111,
  },
};
const identity = {
  id: 2n,
  workspace_id: 1n,
  ens_name: "alice.basin.eth",
  identity_epoch: "0",
  controller_address: addr,
} as NonNullable<
  Awaited<ReturnType<Persistence["identities"]["findByWorkspace"]>>
>;
function harness() {
  let operation: SettlementOperation | null = null;
  let failFinalize = false;
  let verifyError: SettlementError | null = null;
  let record = "0x";
  let finalizations = 0;
  let verificationCalls = 0;
  const context = {
    relationship: {
      id: 3n,
      status: "PENDING",
      relationship_name: prepared.scope.name,
    },
    generation: {
      id: 4n,
      relationship_token_id: "4",
      relationship_registry_address: addr,
      expires_at: new Date(Date.now() + 60_000),
      ended_at: null,
    },
    root: null,
    versions: [],
  };
  const read = async () =>
    ({
      name: prepared.scope.name,
      record,
      profile: digest,
      tokenId: 4n,
      registry: addr,
      resolver: addr,
      identityEpoch: 0n,
      blockNumber: 14n,
      blockHash: digest,
      timestamp: 1700000024n,
    }) as unknown as SettlementObservation;
  const repo = {
    byKey: async () => operation,
    context: async () => context,
    operations: async () => (operation ? [operation] : []),
    prepare: async (values: Partial<SettlementOperation>) =>
      (operation = {
        ...values,
        id: 5n,
        status: "PREPARED",
        transaction_hash: null,
        receipt_block_number: null,
        receipt_block_hash: null,
        verified_at: null,
        error_code: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as SettlementOperation),
    operation: async () => operation!,
    transitionPrepared: async (
      _workspace: bigint,
      _id: bigint,
      cancel: boolean,
    ) => {
      if (operation!.status !== "PREPARED") throw new DomainError("CONFLICT");
      operation!.status = cancel ? "FAILED" : "UNKNOWN";
      return operation!;
    },
    update: async (
      _workspace: bigint,
      _id: bigint,
      values: Partial<SettlementOperation>,
    ) => (operation = { ...operation!, ...values }),
    finalize: async () => {
      if (failFinalize) throw new DomainError("UNAVAILABLE");
      finalizations++;
      operation!.status = "CONFIRMED";
      return operation!;
    },
    preference: async () => null,
    relationships: async () => [context.relationship],
  };
  const adapter = {
    read,
    verifyAsset: async () => {},
    prepare: async () => prepared,
    revalidate: async () => {
      if (record !== prepared.expectedRecord)
        throw new SettlementError("STALE");
      return prepared.transaction;
    },
    locate: async () => null,
    verify: async () => {
      verificationCalls++;
      if (verifyError) throw verifyError;
      return {
        current: await read(),
        receiptBlock: 13n,
        receiptBlockHash: digest,
        transactionHash: digest,
      };
    },
    client: {
      getTransaction: async () => ({
        from: addr,
        to: addr,
        input: prepared.transaction.data,
        value: 0n,
        chainId: 11155111,
      }),
    },
  } as unknown as ReturnType<typeof createSettlementAdapter>;
  const persistence = { receiving: repo } as unknown as Persistence;
  const dependencies = {
    config: {
      ens: { rpcUrl: "https://rpc.invalid", basinRegistryAddress: addr },
      asset: addr,
      symbol: "USDC",
      secret: { version: "test", key: randomBytes(32) },
      forbidden: [],
    },
    adapter,
  };
  // The operation envelope uses the same private key on save and reconciliation.
  process.env.SETTLEMENT_ENCRYPTION_KEY =
    dependencies.config.secret.key.toString("hex");
  process.env.SETTLEMENT_KEY_VERSION = "test";
  const service = createReceivingService(
    persistence,
    identity,
    undefined,
    dependencies,
  );
  return {
    service,
    operation: () => operation!,
    setRecord: (value: string) => {
      record = value;
    },
    failFinalize: (value: boolean) => {
      failFinalize = value;
    },
    verifyError: (value: SettlementError | null) => {
      verifyError = value;
    },
    finalizations: () => finalizations,
    verificationCalls: () => verificationCalls,
  };
}
const key = "f7241e10-f9b1-4f6c-b1f0-443817c4d124";
test("durable preparation encrypts before signing, claims once, and rejects stale review", async () => {
  const h = harness();
  const result = await h.service.prepare(3n, dest, key);
  assert.equal(result.operationId, "5");
  assert.ok(!h.operation().descriptor_ciphertext.includes(dest));
  assert.equal(
    h.operation().commitment,
    settlementCommitment(prepared.descriptor),
  );
  h.setRecord(descriptorRecord(prepared.descriptor));
  await assert.rejects(
    h.service.authorize(5n),
    (error: unknown) =>
      error instanceof SettlementError && error.code === "STALE",
  );
  h.setRecord("0x");
  await h.service.authorize(5n);
  await assert.rejects(h.service.authorize(5n));
  await assert.rejects(h.service.cancel(5n));
});
test("DB-after-chain failure recovers the same operation without another signature or duplicate history", async () => {
  const h = harness();
  await h.service.prepare(3n, dest, key);
  await h.service.authorize(5n);
  h.setRecord(descriptorRecord(prepared.descriptor));
  h.failFinalize(true);
  const pending = await h.service.reconcile(5n, digest);
  assert.equal(pending.status, "VERIFYING");
  assert.match(pending.message, /onchain/);
  assert.equal(h.finalizations(), 0);
  h.failFinalize(false);
  assert.equal((await h.service.reconcile(5n)).status, "CONFIRMED");
  assert.equal((await h.service.reconcile(5n)).status, "CONFIRMED");
  assert.equal(h.finalizations(), 1);
  assert.equal(h.verificationCalls(), 2);
});
test("missing hash, reverted writes, and authority disagreement never append history", async () => {
  const h = harness();
  await h.service.prepare(3n, dest, key);
  await h.service.authorize(5n);
  assert.equal((await h.service.reconcile(5n)).status, "UNKNOWN");
  h.verifyError(new SettlementError("REAPPROVAL_REQUIRED"));
  assert.equal((await h.service.reconcile(5n, digest)).status, "NEEDS_REVIEW");
  assert.equal(h.finalizations(), 0);
  const reverted = harness();
  await reverted.service.prepare(3n, dest, key);
  await reverted.service.authorize(5n);
  reverted.verifyError(new SettlementError("REVERTED"));
  assert.equal((await reverted.service.reconcile(5n, digest)).status, "FAILED");
  assert.equal(reverted.finalizations(), 0);
});
test("explicit wallet rejection releases only an unbroadcast operation after fresh unchanged state", async () => {
  const h = harness();
  await h.service.prepare(3n, dest, key);
  await h.service.authorize(5n);
  h.setRecord(descriptorRecord(prepared.descriptor));
  await assert.rejects(h.service.rejectWallet(5n));
  h.setRecord("0x");
  assert.equal((await h.service.rejectWallet(5n)).status, "FAILED");
  assert.equal(h.finalizations(), 0);
});
