import "server-only";
import { createHash } from "node:crypto";
import { attestSettlementVersion, type createPersistence } from "@basin/db";
import type { SettlementOperation } from "@basin/db/schema";
import { DomainError } from "@basin/domain";
import {
  checksumReceivingAddress,
  createSettlementAdapter,
  decodeSettlementDescriptor,
  descriptorRecord,
  encodeSettlementDescriptor,
  receivingAddress,
  requireSettlement,
  settlementCommitment,
  SettlementError,
  type PreparedSettlement,
  type SettlementObservation,
} from "@basin/ens";
import type {
  PreparedReceivingDto,
  ReceivingOperationDto,
  ReceivingStatusDto,
  ReceivingVersionDto,
} from "../../shared/settlement-types";
import { receivingConfiguration } from "./config";
import {
  operationContext,
  preferenceContext,
  seal,
  unseal,
  versionContext,
} from "./protection";

type Persistence = ReturnType<typeof createPersistence>;
type Context = Awaited<ReturnType<Persistence["receiving"]["context"]>>;
type Identity = NonNullable<
  Awaited<ReturnType<Persistence["identities"]["findByWorkspace"]>>
>;
// Router integration supplies a live activation reader, never a DB-only assertion.
export type ActivationReader = (
  context: Context,
  observed: SettlementObservation,
) => Promise<{ commitment: string; active: boolean }>;
const unavailableActivation: ActivationReader = async () => {
  throw new SettlementError("UNVERIFIED");
};
export const isUnresolved = (operation: SettlementOperation) =>
  !["CONFIRMED", "FAILED"].includes(operation.status);
const address = (value: string) => value as `0x${string}`;
const opContext = (op: SettlementOperation) =>
  operationContext(
    op.workspace_id,
    op.identity_id,
    op.relationship_id,
    op.idempotency_key,
  );
function pack(prepared: PreparedSettlement) {
  return JSON.stringify({
    ...prepared,
    descriptor: encodeSettlementDescriptor(prepared.descriptor),
    scope: {
      ...prepared.scope,
      identityEpoch: prepared.scope.identityEpoch.toString(),
      tokenId: prepared.scope.tokenId?.toString(),
    },
    preparedBlock: prepared.preparedBlock.toString(),
    expiresAt: prepared.expiresAt.toString(),
  });
}
function unpack(op: SettlementOperation): PreparedSettlement {
  try {
    const value = JSON.parse(unseal(op.descriptor_ciphertext, opContext(op)));
    const prepared: PreparedSettlement = {
      ...value,
      descriptor: decodeSettlementDescriptor(value.descriptor),
      scope: {
        ...value.scope,
        identityEpoch: BigInt(value.scope.identityEpoch),
        tokenId: BigInt(value.scope.tokenId),
      },
      preparedBlock: BigInt(value.preparedBlock),
      expiresAt: BigInt(value.expiresAt),
    };
    requireSettlement(
      prepared.scope.tokenId!.toString() === op.relationship_token_id &&
        prepared.scope.identityEpoch.toString() === op.identity_epoch &&
        prepared.profile === op.profile_digest &&
        prepared.expectedRecord === op.expected_record &&
        prepared.transaction.to.toLowerCase() === op.resolver &&
        prepared.descriptor.settlementEpoch.toString() === op.target_epoch &&
        settlementCommitment(prepared.descriptor) === op.commitment,
    );
    return prepared;
  } catch {
    throw new SettlementError(
      "NEEDS_REVIEW",
      "We couldn't read your protected receiving details.",
    );
  }
}
export function operationDto(op: SettlementOperation): ReceivingOperationDto {
  const messages = {
    PREPARED: "Your receiving change is ready for review.",
    SUBMITTED: "Your change is being confirmed.",
    VERIFYING: "Your change is onchain. Basin is still syncing the details.",
    CONFIRMED:
      "Receiving account confirmed. Relationship acceptance is still needed.",
    FAILED: "The transaction reverted. Check your current receiving details.",
    UNKNOWN:
      "We couldn't confirm the result yet. Check again before trying another change.",
    NEEDS_REVIEW: "Receiving details need review.",
  };
  return {
    id: op.id.toString(),
    relationshipId: op.relationship_id.toString(),
    status: op.status,
    transactionHash: op.transaction_hash,
    epoch: op.target_epoch,
    commitment: op.commitment,
    blockNumber: op.receipt_block_number,
    blockHash: op.receipt_block_hash,
    verifiedAt: op.verified_at?.toISOString() ?? null,
    message:
      op.error_code === "SIGNATURE_REJECTED"
        ? "You cancelled the change. Your receiving account is unchanged."
        : op.error_code === "CANCELLED_BEFORE_SIGNATURE"
          ? "Receiving change cancelled."
          : messages[op.status],
  };
}
function versionDto(op: SettlementOperation): ReceivingVersionDto {
  const prepared = unpack(op);
  return {
    destination: checksumReceivingAddress(prepared.descriptor.destination),
    epoch: op.target_epoch,
    commitment: op.commitment,
    transactionHash: op.transaction_hash,
    blockNumber: op.receipt_block_number,
    blockHash: op.receipt_block_hash,
    verifiedAt: op.verified_at?.toISOString() ?? null,
  };
}
function preparedDto(
  op: SettlementOperation,
  oldDestination: string | null,
): PreparedReceivingDto {
  const prepared = unpack(op);
  return {
    operationId: op.id.toString(),
    expiresAt: op.prepared_expiry.toISOString(),
    oldDestination,
    destination: checksumReceivingAddress(prepared.descriptor.destination),
    epoch: op.target_epoch,
    relationshipName: prepared.scope.name,
    transaction: prepared.transaction,
  };
}
export function createReceivingService(
  persistence: Persistence,
  identity: Identity,
  activation: ActivationReader = unavailableActivation,
  dependencies?: {
    config: ReturnType<typeof receivingConfiguration>;
    adapter: ReturnType<typeof createSettlementAdapter>;
  },
) {
  const config = dependencies?.config ?? receivingConfiguration();
  const adapter = dependencies?.adapter ?? createSettlementAdapter(config.ens);
  const workspaceId = identity.workspace_id;
  const repo = persistence.receiving;
  async function contextFor(relationshipId: bigint) {
    const context = await repo.context(identity.id, relationshipId);
    requireSettlement(
      context.generation && context.relationship.relationship_name,
      "REAPPROVAL_REQUIRED",
    );
    requireSettlement(
      ["PENDING", "ACTIVE"].includes(context.relationship.status) &&
        !context.generation.ended_at &&
        context.generation.expires_at > new Date(),
      "RELATIONSHIP_INACTIVE",
    );
    return context;
  }
  function scopeFor(context: Context) {
    return {
      name: context.relationship.relationship_name!,
      identityName: identity.ens_name,
      controller: address(identity.controller_address),
      identityEpoch: BigInt(identity.identity_epoch),
      tokenId: BigInt(context.generation!.relationship_token_id),
      registry: address(context.generation!.relationship_registry_address),
    };
  }
  async function verifyActivation(
    context: Context,
    state: SettlementObservation,
  ) {
    if (context.relationship.status !== "ACTIVE") {
      requireSettlement(!context.root, "REAPPROVAL_REQUIRED");
      return null;
    }
    const root = context.root;
    requireSettlement(
      root &&
        root.payee_id === identity.payee_id &&
        root.identity_controller === identity.controller_address &&
        root.identity_epoch === identity.identity_epoch &&
        root.relationship_token_id === state.tokenId.toString() &&
        root.relationship_registry_address === state.registry.toLowerCase() &&
        root.resolver_proxy_address === state.resolver.toLowerCase() &&
        root.resolver_implementation_address ===
          state.implementation.toLowerCase() &&
        root.resolver_implementation_code_hash ===
          state.implementationCodeHash &&
        root.resolver_permission_profile_hash === state.resolverProfile &&
        root.registry_permission_profile_hash === state.registryProfile,
      "REAPPROVAL_REQUIRED",
    );
    const live = await activation(context, state);
    requireSettlement(
      live.active && live.commitment === root.security_root_commitment,
      "REAPPROVAL_REQUIRED",
    );
    return root.security_root_commitment;
  }
  async function knownFor(context: Context, operations: SettlementOperation[]) {
    const confirmed = operations.find(
      (op) =>
        op.status === "CONFIRMED" &&
        op.relationship_token_id === context.generation!.relationship_token_id,
    );
    const version = context.versions.find((item) => !item.superseded_at);
    if (
      version &&
      (!confirmed ||
        BigInt(version.settlement_epoch) > BigInt(confirmed.target_epoch))
    ) {
      requireSettlement(version.destination_ciphertext, "NEEDS_REVIEW");
      const destination = receivingAddress(
        unseal(
          version.destination_ciphertext,
          versionContext(
            workspaceId,
            identity.id,
            context.generation!.id,
            version.settlement_epoch,
          ),
        ),
      );
      // Existing versions cannot reconstruct the exact descriptor from a commitment alone.
      const matching = operations.find(
        (op) =>
          op.commitment === version.commitment && op.status === "CONFIRMED",
      );
      requireSettlement(matching, "NEEDS_REVIEW");
      return {
        record: descriptorRecord(unpack(matching).descriptor),
        destination,
      };
    }
    return confirmed
      ? {
          record: descriptorRecord(unpack(confirmed).descriptor),
          destination: unpack(confirmed).descriptor.destination,
        }
      : null;
  }
  async function savePreference(
    destination: string,
    expectedRevision: string | null,
  ) {
    let normalized: `0x${string}`;
    try {
      normalized = receivingAddress(destination, config.forbidden);
    } catch (error) {
      throw new SettlementError("INVALID_INPUT", (error as Error).message);
    }
    await adapter.verifyAsset(config.asset, config.symbol);
    const row = await repo.savePreference(
      {
        workspace_id: workspaceId,
        identity_id: identity.id,
        destination_ciphertext: seal(
          normalized,
          preferenceContext(workspaceId, identity.id),
          config.secret,
        ),
        key_version: config.secret.version,
        revision: "0",
      },
      expectedRevision,
    );
    return {
      destination: checksumReceivingAddress(normalized),
      revision: row.revision,
    };
  }
  async function prepare(
    relationshipId: bigint,
    destination: string,
    idempotencyKey: string,
  ) {
    let normalized: `0x${string}`;
    try {
      normalized = receivingAddress(destination, config.forbidden);
    } catch (error) {
      throw new SettlementError("INVALID_INPUT", (error as Error).message);
    }
    await adapter.verifyAsset(config.asset, config.symbol);
    const requestDigest = `0x${createHash("sha256")
      .update(
        JSON.stringify([
          workspaceId.toString(),
          relationshipId.toString(),
          normalized,
        ]),
      )
      .digest("hex")}`;
    const old = await repo.byKey(workspaceId, idempotencyKey);
    if (old && old.request_digest !== requestDigest)
      throw new DomainError(
        "CONFLICT",
        "This request was already used for different receiving details.",
      );
    const context = await contextFor(relationshipId);
    const operations = await repo.operations(workspaceId, relationshipId);
    const known = await knownFor(context, operations);
    if (old) {
      requireSettlement(old.status === "PREPARED", "STALE");
      await adapter.revalidate(unpack(old));
      await verifyActivation(context, await adapter.read(scopeFor(context)));
      return preparedDto(
        old,
        known ? checksumReceivingAddress(known.destination) : null,
      );
    }
    requireSettlement(!operations.some(isUnresolved), "STALE");
    const prepared = await adapter.prepare(
      scopeFor(context),
      config.asset,
      normalized,
      known,
    );
    const root = await verifyActivation(
      context,
      await adapter.read(scopeFor(context)),
    );
    await adapter.revalidate(prepared);
    const op = await repo.prepare({
      workspace_id: workspaceId,
      identity_id: identity.id,
      relationship_id: relationshipId,
      relationship_token_id: prepared.scope.tokenId!.toString(),
      identity_epoch: identity.identity_epoch,
      resolver: prepared.transaction.to.toLowerCase(),
      profile_digest: prepared.profile,
      accepted_root_digest: root,
      expected_record: prepared.expectedRecord,
      target_epoch: prepared.descriptor.settlementEpoch.toString(),
      commitment: settlementCommitment(prepared.descriptor),
      descriptor_ciphertext: seal(
        pack(prepared),
        operationContext(
          workspaceId,
          identity.id,
          relationshipId,
          idempotencyKey,
        ),
        config.secret,
      ),
      key_version: config.secret.version,
      idempotency_key: idempotencyKey,
      request_digest: requestDigest,
      prepared_block: prepared.preparedBlock.toString(),
      prepared_expiry: new Date(Number(prepared.expiresAt) * 1000),
    });
    return preparedDto(
      op,
      known ? checksumReceivingAddress(known.destination) : null,
    );
  }
  async function authorize(operationId: bigint) {
    const op = await repo.operation(workspaceId, operationId);
    requireSettlement(
      op.identity_id === identity.id && op.status === "PREPARED",
      "STALE",
    );
    const prepared = unpack(op);
    const context = await contextFor(op.relationship_id);
    await adapter.revalidate(prepared);
    requireSettlement(
      (await verifyActivation(
        context,
        await adapter.read(scopeFor(context)),
      )) === op.accepted_root_digest,
      "REAPPROVAL_REQUIRED",
    );
    await repo.transitionPrepared(workspaceId, operationId, false);
    return preparedDto(op, null);
  }
  async function cancel(operationId: bigint) {
    const op = await repo.operation(workspaceId, operationId);
    requireSettlement(op.identity_id === identity.id, "NEEDS_REVIEW");
    return operationDto(
      await repo.transitionPrepared(workspaceId, operationId, true),
    );
  }
  async function rejectWallet(operationId: bigint) {
    const op = await repo.operation(workspaceId, operationId);
    requireSettlement(
      op.identity_id === identity.id &&
        op.status === "UNKNOWN" &&
        !op.transaction_hash,
      "STALE",
    );
    const prepared = unpack(op);
    const state = await adapter.read(prepared.scope);
    requireSettlement(
      state.record === prepared.expectedRecord &&
        state.profile === prepared.profile,
      "STALE",
    );
    // A single issued wallet request explicitly rejected signing. This is workflow cancellation,
    // not chain failure evidence; ambiguous provider errors never enter this branch.
    return operationDto(
      await repo.update(workspaceId, op.id, {
        status: "FAILED",
        error_code: "SIGNATURE_REJECTED",
      }),
    );
  }
  async function reconcile(operationId: bigint, transactionHash?: string) {
    let op = await repo.operation(workspaceId, operationId);
    requireSettlement(op.identity_id === identity.id);
    if (op.status === "CONFIRMED" || op.status === "FAILED")
      return operationDto(op);
    const prepared = unpack(op);
    let chainVerified = false;
    try {
      const context = await contextFor(op.relationship_id);
      requireSettlement(
        context.generation!.relationship_token_id === op.relationship_token_id,
        "REAPPROVAL_REQUIRED",
      );
      const hash =
        transactionHash ??
        op.transaction_hash ??
        (await adapter.locate(prepared));
      if (!hash)
        return operationDto(
          await repo.update(workspaceId, op.id, { status: "UNKNOWN" }),
        );
      // Bind the untrusted hash hint only after inspecting the actual controller call.
      const tx = await adapter.client.getTransaction({ hash: address(hash) });
      requireSettlement(
        tx.from.toLowerCase() === prepared.scope.controller.toLowerCase() &&
          tx.to?.toLowerCase() === prepared.transaction.to.toLowerCase() &&
          tx.input === prepared.transaction.data &&
          tx.value === 0n &&
          tx.chainId === 11155111,
        "NEEDS_REVIEW",
      );
      if (op.transaction_hash && op.transaction_hash !== hash) {
        const replaced = await adapter.client.getTransaction({
          hash: address(op.transaction_hash),
        });
        requireSettlement(
          replaced.from.toLowerCase() === tx.from.toLowerCase() &&
            replaced.nonce === tx.nonce &&
            replaced.chainId === tx.chainId,
          "NEEDS_REVIEW",
        );
      }
      op = await repo.update(
        workspaceId,
        op.id,
        { transaction_hash: hash, status: "SUBMITTED" },
        op.transaction_hash ?? undefined,
      );
      const verified = await adapter.verify(prepared, address(hash));
      chainVerified = true;
      requireSettlement(
        (await verifyActivation(context, verified.current)) ===
          op.accepted_root_digest,
        "REAPPROVAL_REQUIRED",
      );
      op = await repo.update(workspaceId, op.id, {
        status: "VERIFYING",
        receipt_block_number: verified.receiptBlock.toString(),
        receipt_block_hash: verified.receiptBlockHash,
        verified_at: new Date(),
      });
      let settlement: Parameters<typeof repo.finalize>[2];
      if (context.root) {
        const descriptor = prepared.descriptor;
        // Reuse the persisted envelope across retries so exact append idempotency holds.
        const existing = context.versions.find(
          (version) =>
            version.settlement_epoch === op.target_epoch &&
            version.commitment === op.commitment,
        );
        const ciphertext =
          existing?.destination_ciphertext ??
          seal(
            descriptor.destination,
            versionContext(
              workspaceId,
              identity.id,
              context.generation!.id,
              op.target_epoch,
            ),
            config.secret,
          );
        settlement = {
          organizationId: context.relationship.organization_id,
          evidence: attestSettlementVersion({
            approved_payee_generation_id: context.generation!.id,
            approved_security_root_id: context.root.id,
            settlement_epoch: op.target_epoch,
            commitment: op.commitment,
            descriptor_version: 1,
            chain_id: 11155111,
            asset_address: descriptor.asset,
            destination_ciphertext: ciphertext,
            destination_fingerprint: null,
            valid_from: new Date(Number(descriptor.validFrom) * 1000),
            superseded_at: null,
          }),
        };
      }
      return operationDto(await repo.finalize(workspaceId, op.id, settlement));
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === "UNAVAILABLE" &&
        chainVerified
      )
        return {
          ...operationDto(op),
          status: "VERIFYING" as const,
          message:
            "Your change is onchain. Basin is still syncing the details.",
        };
      const code = error instanceof SettlementError ? error.code : "PENDING";
      const status = [
        "NEEDS_REVIEW",
        "REAPPROVAL_REQUIRED",
        "RELATIONSHIP_INACTIVE",
      ].includes(code)
        ? "NEEDS_REVIEW"
        : code === "REVERTED"
          ? "FAILED"
          : "UNKNOWN";
      return operationDto(
        await repo.update(workspaceId, op.id, { status, error_code: code }),
      );
    }
  }
  async function status(selected?: bigint): Promise<ReceivingStatusDto> {
    const [preference, relationships, allOperations] = await Promise.all([
      repo.preference(workspaceId),
      repo.relationships(identity.id),
      repo.operations(workspaceId),
    ]);
    const selectedId = selected ?? relationships[0]?.id;
    const result: ReceivingStatusDto = {
      status: preference ? "SAVED" : "EMPTY",
      trust: "PREFERENCE_ONLY",
      observedAt: new Date().toISOString(),
      blockNumber: null,
      canEdit: true,
      message: preference
        ? "Your account is saved. Receiving becomes active when a payment relationship is accepted."
        : "Choose the account where you want to receive payments.",
      asset: {
        address: checksumReceivingAddress(config.asset),
        symbol: config.symbol,
        chainId: "11155111",
        network: "Ethereum Sepolia",
      },
      preference: preference
        ? {
            destination: checksumReceivingAddress(
              unseal(
                preference.destination_ciphertext,
                preferenceContext(workspaceId, identity.id),
              ),
            ),
            revision: preference.revision,
          }
        : null,
      relationships: relationships.map((row) => ({
        id: row.id.toString(),
        name: row.relationship_name,
        status: row.status,
      })),
      relationshipId: selectedId?.toString() ?? null,
      current: null,
      history: [],
      pending: null,
      prepared: null,
      technical: null,
    };
    if (!selectedId) return result;
    requireSettlement(
      relationships.some((row) => row.id === selectedId),
      "INVALID_INPUT",
    );
    let operations = allOperations.filter(
      (op) => op.relationship_id === selectedId,
    );
    let pending = operations.find(isUnresolved);
    if (
      pending &&
      pending.status !== "PREPARED" &&
      pending.status !== "NEEDS_REVIEW"
    ) {
      await reconcile(pending.id);
      operations = await repo.operations(workspaceId, selectedId);
      pending = operations.find(isUnresolved);
    }
    result.pending = pending ? operationDto(pending) : null;
    if (pending?.status === "PREPARED")
      result.prepared = {
        destination: checksumReceivingAddress(
          unpack(pending).descriptor.destination,
        ),
        idempotencyKey: pending.idempotency_key,
      };
    try {
      const context = await contextFor(selectedId);
      const state = await adapter.read(scopeFor(context));
      result.blockNumber = state.blockNumber.toString();
      result.technical = {
        relationshipTokenId: state.tokenId.toString(),
        identityEpoch: state.identityEpoch.toString(),
        resolver: state.resolver,
        profile: state.profile,
        approvalVerified: false,
      };
      const root = await verifyActivation(context, state);
      result.technical.approvalVerified = root !== null;
      const known = await knownFor(context, operations);
      const verified = operations.filter(
        (op) =>
          op.status === "CONFIRMED" &&
          op.relationship_token_id === state.tokenId.toString(),
      );
      result.history = verified.map(versionDto);
      result.current = result.history[0] ?? null;
      if (
        pending &&
        state.record === descriptorRecord(unpack(pending).descriptor) &&
        state.profile === pending.profile_digest
      ) {
        result.status = "VERIFYING";
        result.trust = "UNVERIFIED";
        result.canEdit = false;
        result.message = "Checking your receiving account…";
        return result;
      }
      if (state.record !== (known?.record ?? "0x")) {
        if (state.decoded)
          result.current = {
            destination: null,
            epoch: state.decoded.settlementEpoch.toString(),
            commitment: state.decoded.commitment,
            transactionHash: null,
            blockNumber: state.blockNumber.toString(),
            blockHash: state.blockHash,
            verifiedAt: null,
          };
        throw new SettlementError("NEEDS_REVIEW");
      }
      result.status = known ? "VERIFIED" : "EMPTY";
      result.trust = "SETTLEMENT_ONLY";
      result.canEdit = !pending;
      result.message = known
        ? root
          ? "Receiving account confirmed. Your identity and approval are unchanged."
          : "Receiving account confirmed. Relationship acceptance is still needed."
        : "Choose the account for this relationship. Relationship acceptance is still needed.";
    } catch (error) {
      result.status = "NEEDS_REVIEW";
      result.trust =
        error instanceof SettlementError &&
        [
          "REAPPROVAL_REQUIRED",
          "RELATIONSHIP_INACTIVE",
          "NEEDS_REVIEW",
        ].includes(error.code)
          ? (error.code as ReceivingStatusDto["trust"])
          : "UNVERIFIED";
      result.message =
        error instanceof SettlementError
          ? error.message
          : "We couldn't verify your receiving details. Check again.";
      result.canEdit = false;
    }
    return result;
  }
  return {
    status,
    savePreference,
    prepare,
    authorize,
    cancel,
    rejectWallet,
    reconcile,
  };
}
