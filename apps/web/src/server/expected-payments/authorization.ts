import "server-only";

import { createHash } from "node:crypto";
import { encodeFunctionData, getAddress, parseEventLogs } from "viem";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { basinRouterAbi, obligationId, obligationMetadataHash } from "@basin/contracts";
import { attestObligation, type createPersistence } from "@basin/db";
import { DomainError } from "@basin/domain";

import { createPrivyTreasuryAdapter, TreasuryAuthorizationRequired, TreasuryProviderError } from "../treasury/adapter";
import { verifiedBasinRouter } from "../config/verified-basin-router";
import { getEnsServerEnvironment } from "../config/environment";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>>;

const requestHash = (value: unknown) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

function operationDto(operation: Awaited<ReturnType<Persistence["paymentAuthorizations"]["prepare"]>>) {
  return {
    id: operation.id.toString(), status: operation.status, obligationId: operation.obligation_id,
    validUntil: operation.valid_until.toISOString(),
  };
}

export function createExpectedPaymentAuthorizationService(persistence: Persistence, access: Access) {
  if (access.workspace.type !== "ORGANIZATION" || access.memberRole !== "ADMIN" || !access.organizationId || !access.memberId)
    throw new DomainError("INVALID_INPUT", "You don't have permission to authorize this payment.");
  const organizationId = access.organizationId;
  const actorMemberId = access.memberId;

  async function prepare(expectedPaymentId: bigint, idempotencyKey: string) {
    const [context, router] = await Promise.all([
      persistence.paymentAuthorizations.context(organizationId, expectedPaymentId),
      verifiedBasinRouter(),
    ]);
    const { expected, generation, root, identity, treasury } = context;
    if (expected.status !== "EXPECTED" || expected.obligation_record_id || expected.payment_record_id)
      throw new DomainError("CONFLICT", "This expected payment has changed. Refresh and review it.");
    if (!treasury?.wallet_address || !treasury.privy_wallet_id || treasury.status !== "READY")
      throw new DomainError("CONFLICT", "Your organization's payment controls aren't ready yet.");
    if (generation.ended_at || generation.expires_at <= new Date() || root.acceptance_verifying_contract.toLowerCase() !== router.address.toLowerCase())
      throw new DomainError("CONFLICT", "This payee relationship needs attention before payment.");
    const validUntil = new Date(Math.min(Date.now() + 7 * 24 * 60 * 60 * 1000, generation.expires_at.getTime()));
    if (validUntil.getTime() - Date.now() < 10 * 60 * 1000)
      throw new DomainError("CONFLICT", "This payee relationship needs attention before payment.");
    const organization = getAddress(treasury.wallet_address);
    const protocolId = obligationId({ router: router.address, organization, expectedPaymentId });
    const metadataHash = obligationMetadataHash({ router: router.address, organization, relationshipNamehash: generation.relationship_namehash as `0x${string}`, relationshipTokenId: BigInt(generation.relationship_token_id), payeeId: identity.payee_id as `0x${string}`, asset: router.asset, amount: BigInt(expected.amount_base_units), purpose: expected.purpose, reference: expected.external_reference ?? undefined, expectedPaymentId });
    const operation = await persistence.paymentAuthorizations.prepare({
      organization_id: organizationId, expected_payment_id: expectedPaymentId, actor_member_id: actorMemberId,
      idempotency_key: idempotencyKey, request_hash: requestHash([expectedPaymentId.toString(), protocolId, metadataHash]),
      obligation_id: protocolId, metadata_hash: metadataHash, valid_until: validUntil,
    });
    return { operation: operationDto(operation), review: { payee: identity.label, amount: expected.amount_base_units, purpose: expected.purpose, reference: expected.external_reference ?? undefined, validUntil: validUntil.toISOString() } };
  }

  async function submit(expectedPaymentId: bigint, idempotencyKey: string, signature?: string, expiry?: number) {
    await prepare(expectedPaymentId, idempotencyKey);
    const context = await persistence.paymentAuthorizations.context(organizationId, expectedPaymentId);
    const operation = await persistence.paymentAuthorizations.read(organizationId, expectedPaymentId);
    if (operation.status === "CONFIRMED") return { operation: operationDto(operation) };
    const router = await verifiedBasinRouter();
    const treasury = context.treasury!;
    const data = encodeFunctionData({ abi: basinRouterAbi, functionName: "createObligation", args: [
      operation.obligation_id as `0x${string}`,
      { organization: getAddress(treasury.wallet_address!), relationshipNamehash: context.generation.relationship_namehash as `0x${string}`, relationshipTokenId: BigInt(context.generation.relationship_token_id), payeeId: context.identity.payee_id as `0x${string}`, securityRootCommitment: context.root.security_root_commitment as `0x${string}`, recipient: getAddress(context.root.identity_controller), expiry: BigInt(Math.floor(context.generation.expires_at.getTime() / 1000)) },
      BigInt(context.expected.amount_base_units), BigInt(Math.floor(operation.valid_until.getTime() / 1000)), operation.metadata_hash as `0x${string}`,
      { identityLabel: context.identity.label, organizationLabel: context.relationship.relationship_name!.split(".")[1]!, relationshipRegistry: getAddress(context.generation.relationship_registry_address), resolver: getAddress(context.root.resolver_proxy_address), identityEpoch: BigInt(context.identity.identity_epoch) },
    ] });
    try {
      const sent = await createPrivyTreasuryAdapter().sendHighAuthorityTransaction!({ walletId: treasury.privy_wallet_id!, to: router.address, data, idempotencyKey: operation.idempotency_key, authorizationSignature: signature, requestExpiry: expiry });
      const next = await persistence.paymentAuthorizations.update(operation.id, { status: "SUBMITTED", transaction_hash: sent.hash.toLowerCase(), privy_transaction_id: sent.transactionId });
      return { operation: operationDto(next) };
    } catch (error) {
      if (error instanceof TreasuryAuthorizationRequired) {
        const next = await persistence.paymentAuthorizations.update(operation.id, { status: "AWAITING_APPROVAL" });
        return { operation: operationDto(next), walletAuthorization: error.authorization };
      }
      const code = error instanceof TreasuryProviderError ? error.code : "UNKNOWN_EXTERNAL_STATE";
      const next = await persistence.paymentAuthorizations.update(operation.id, { status: code === "UNKNOWN_EXTERNAL_STATE" ? "UNKNOWN_EXTERNAL_STATE" : "FAILED", failure_code: code });
      if (code === "UNKNOWN_EXTERNAL_STATE") return { operation: operationDto(next) };
      throw new DomainError("CONFLICT", "Your organization didn't authorize this payment.");
    }
  }

  async function reconcile(expectedPaymentId: bigint) {
    const operation = await persistence.paymentAuthorizations.read(organizationId, expectedPaymentId);
    if (!operation.transaction_hash) return { operation: operationDto(operation) };
    const router = await verifiedBasinRouter();
    const client = createPublicClient({ chain: sepolia, transport: http(getEnsServerEnvironment().rpcUrl, { timeout: 8_000, retryCount: 1 }) });
    const receipt = await client.getTransactionReceipt({ hash: operation.transaction_hash as `0x${string}` }).catch(() => undefined);
    if (!receipt) return { operation: operationDto(operation) };
    if (receipt.status !== "success") {
      const next = await persistence.paymentAuthorizations.update(operation.id, { status: "FAILED", failure_code: "TRANSACTION_REVERTED", completed_at: new Date() });
      return { operation: operationDto(next) };
    }
    const logs = parseEventLogs({ abi: basinRouterAbi, logs: receipt.logs, eventName: "ObligationCreated", strict: false }).filter((log) => log.address.toLowerCase() === router.address.toLowerCase() && log.args.obligationId === operation.obligation_id);
    if (logs.length !== 1) throw new DomainError("CONFLICT", "We couldn't confirm the authorization yet. Check again before trying another authorization.");
    const context = await persistence.paymentAuthorizations.context(organizationId, expectedPaymentId);
    const onchain = await client.readContract({ address: router.address, abi: basinRouterAbi, functionName: "getObligation", args: [operation.obligation_id as `0x${string}`] });
    if (onchain.organization.toLowerCase() !== context.treasury!.wallet_address!.toLowerCase() || onchain.maxAmount !== BigInt(context.expected.amount_base_units) || onchain.metadataHash !== operation.metadata_hash) throw new DomainError("CONFLICT", "We couldn't confirm the authorization yet. Check again before trying another authorization.");
    const created = await persistence.obligations.createFromRouter(organizationId, attestObligation({ obligation_id: operation.obligation_id, organization_id: organizationId, organization_wallet_address: context.treasury!.wallet_address!, approved_payee_id: context.relationship.id, approved_payee_generation_id: context.generation.id, max_amount_base_units: context.expected.amount_base_units, remaining_amount_base_units: context.expected.amount_base_units, asset_address: router.asset, purpose: context.expected.purpose, external_reference: context.expected.external_reference, expected_at: null, valid_until: operation.valid_until, metadata_hash: operation.metadata_hash, router_address: router.address, router_version: router.version, status: "ACTIVE", creation_transaction_hash: receipt.transactionHash, creation_block_number: receipt.blockNumber.toString(), creation_log_index: logs[0].logIndex, created_by_member_id: actorMemberId }));
    await persistence.expectedPayments.linkObligation({ organization_id: organizationId, expected_payment_id: expectedPaymentId, obligation_record_id: created.id, canonical_metadata_hash: operation.metadata_hash });
    const next = await persistence.paymentAuthorizations.update(operation.id, { status: "CONFIRMED", completed_at: new Date() });
    return { operation: operationDto(next), ready: true };
  }
  return { prepare, submit, reconcile };
}
