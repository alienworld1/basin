import assert from "node:assert/strict";
import test from "node:test";
import type { createPersistence } from "@basin/db";
import type {
  Organization,
  OrganizationTreasury,
  PrivyProvisioningOperation,
  RoutineSignerSecret,
} from "@basin/db/schema";
import type { PrivyTreasuryAdapter } from "../src/server/treasury/adapter";
import { createTreasuryService } from "../src/server/treasury/service";
import { generateRoutineKey, unsealRoutineKey } from "../src/server/treasury/protection";
import { buildRoutinePolicy, policyFingerprint } from "../src/server/treasury/policy";

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

function harness() {
  let organization: Organization = {
    id: 8n,
    workspace_id: 7n,
    privy_organization_id: null,
    basin_identity_id: null,
    created_at: now,
    updated_at: now,
  };
  let treasury: OrganizationTreasury | null = null;
  let secret: RoutineSignerSecret | null = null;
  let operation: PrivyProvisioningOperation | null = null;
  const calls = { owner: 0, organization: 0, signer: 0, wallet: 0 };
  const quorums = new Map<string, { id: string; threshold: number; userIds: string[]; publicKeys: string[] }>();
  let wallet: Awaited<ReturnType<PrivyTreasuryAdapter["getWallet"]>> | undefined;
  const adapter: PrivyTreasuryAdapter = {
    async createOwnerQuorum({ userId }) {
      calls.owner++;
      const value = { id: "quorum-owner", threshold: 1, userIds: [userId], publicKeys: [] };
      quorums.set(value.id, value);
      return value;
    },
    async getQuorum(id) { return quorums.get(id)!; },
    async createOrganization({ quorumId }) {
      calls.organization++;
      return { id: "org-privy", defaultQuorumId: quorumId };
    },
    async getOrganization() { return { id: "org-privy", defaultQuorumId: "quorum-owner" }; },
    async createRoutineSigner({ publicKey }) {
      calls.signer++;
      const value = { id: "quorum-routine", threshold: 1, userIds: [], publicKeys: [publicKey] };
      quorums.set(value.id, value);
      return value;
    },
    async createPolicy() { throw new Error("not configured"); },
    async getPolicy() { throw new Error("not configured"); },
    async createWallet({ organizationId, ownerId, routineSignerId }) {
      calls.wallet++;
      wallet = {
        id: "wallet-privy",
        address: "0x1111111111111111111111111111111111111111",
        chainType: "ethereum",
        ownerId,
        additionalSigners: [{ signerId: routineSignerId, policyIds: [] }],
        policyIds: [],
        entityId: organizationId,
      };
      return wallet;
    },
    async getWallet() { return wallet!; },
    async createWalletUpdateIntent() { throw new Error("not configured"); },
    async getIntent() { throw new Error("not configured"); },
  };
  const repository = {
    byWorkspace: async () => ({ organization, treasury }),
    latestOperation: async () => operation,
    adminPrivyUserIds: async () => ["did:privy:admin"],
    operation: async (_organizationId: bigint, operationType: string, key: string, requestFingerprint: string) => {
      operation ??= {
        id: 1n,
        organization_id: 8n,
        operation_type: operationType,
        idempotency_key: key,
        request_fingerprint: requestFingerprint,
        step: "STARTED",
        status: "IN_PROGRESS",
        privy_intent_id: null,
        safe_error_code: null,
        expires_at: null,
        created_at: now,
        updated_at: now,
      } as PrivyProvisioningOperation;
      return operation;
    },
    saveTreasury: async (values: Partial<OrganizationTreasury> & { organization_id: bigint }) => {
      treasury = {
        id: 2n,
        status: "NOT_STARTED",
        privy_wallet_id: null,
        wallet_address: null,
        chain_type: null,
        owner_quorum_id: null,
        owner_quorum_threshold: null,
        routine_signer_id: null,
        routine_policy_id: null,
        routine_policy_owner_id: null,
        routine_policy_fingerprint: null,
        router_address: null,
        router_version: null,
        routine_per_tx_limit_base_units: null,
        last_verified_at: null,
        last_error_code: null,
        created_at: now,
        updated_at: now,
        ...treasury,
        ...values,
      } as OrganizationTreasury;
      return treasury;
    },
    updateOperation: async (_id: bigint, values: Partial<PrivyProvisioningOperation>) => {
      operation = { ...operation!, ...values };
      return operation;
    },
    saveOrganizationMapping: async (_id: bigint, id: string) => {
      organization = { ...organization, privy_organization_id: id };
      return organization;
    },
    signerSecret: async () => secret,
    saveSignerSecret: async (values: Partial<RoutineSignerSecret>) => {
      secret = { id: 3n, created_at: now, updated_at: now, ...values } as RoutineSignerSecret;
      return secret;
    },
  };
  const persistence = { treasury: repository } as unknown as Persistence;
  return { persistence, adapter, calls, treasury: () => treasury, secret: () => secret };
}

test("provisions one verified organization control boundary and resumes without duplicates", async () => {
  process.env.TREASURY_ROUTINE_KEY_ENCRYPTION_KEY = "11".repeat(32);
  process.env.TREASURY_ROUTINE_KEY_VERSION = "test-v1";
  const h = harness();
  const service = createTreasuryService(h.persistence, access as never, "did:privy:admin", h.adapter);
  const first = await service.setup("f7241e10-f9b1-4f6c-b1f0-443817c4d124");
  assert.equal(first.summary.status, "CONTROL_READY");
  assert.equal(first.summary.routerConfigured, false);
  assert.equal(first.technical.walletAddress, "0x1111111111111111111111111111111111111111");
  assert.equal(h.treasury()?.routine_policy_id, null);
  assert.deepEqual(h.calls, { owner: 1, organization: 1, signer: 1, wallet: 1 });
  const refreshed = await service.setup("f7241e10-f9b1-4f6c-b1f0-443817c4d124");
  assert.equal(refreshed.summary.status, "CONTROL_READY");
  assert.deepEqual(h.calls, { owner: 1, organization: 1, signer: 1, wallet: 1 });
});

test("routine key material is per-organization and encrypted at rest", () => {
  const encryption = { key: Buffer.from("22".repeat(32), "hex"), version: "v1" };
  const first = generateRoutineKey(8n, encryption);
  const second = generateRoutineKey(9n, encryption);
  assert.notEqual(first.publicKeyFingerprint, second.publicKeyFingerprint);
  assert.doesNotMatch(first.ciphertext, /BEGIN PRIVATE KEY/);
  const plaintext = unsealRoutineKey(
    8n,
    { ciphertext: first.ciphertext, iv: first.iv, auth_tag: first.authTag, key_version: first.keyVersion },
    encryption,
  );
  assert.ok(plaintext.length > 100);
  plaintext.fill(0);
});

test("routine policy is one exact default-deny Basin execution rule", () => {
  const policy = buildRoutinePolicy({
    ownerId: "quorum-owner",
    routerAddress: "0x2222222222222222222222222222222222222222",
    limit: "5000000",
    abi: [
      {
        type: "function",
        name: "executeObligation",
        stateMutability: "nonpayable",
        inputs: [
          { name: "obligationId", type: "bytes32" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      },
    ],
  });
  assert.equal(policy.owner_id, "quorum-owner");
  assert.equal(policy.rules.length, 1);
  assert.equal(policy.rules[0].method, "eth_sendTransaction");
  assert.equal(policy.rules[0].action, "ALLOW");
  assert.deepEqual(
    policy.rules[0].conditions.map((condition) => [condition.field_source, condition.field, condition.operator, condition.value]),
    [
      ["ethereum_transaction", "chain_id", "eq", "11155111"],
      ["ethereum_transaction", "to", "eq", "0x2222222222222222222222222222222222222222"],
      ["ethereum_transaction", "value", "eq", "0"],
      ["ethereum_calldata", "function_name", "eq", "executeObligation"],
      ["ethereum_calldata", "executeObligation.amount", "lte", "5000000"],
    ],
  );
  assert.match(policyFingerprint(policy), /^0x[0-9a-f]{64}$/);
});
