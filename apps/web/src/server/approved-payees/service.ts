import "server-only";

import { createHash } from "node:crypto";
import {
  acceptanceMessageHash,
  acceptanceTypes,
  basinRouterActivationAbi,
} from "@basin/contracts";
import { attestActivation, type createPersistence } from "@basin/db";
import { DomainError } from "@basin/domain";
import {
  createRelationshipReader,
  createRelationshipProvisioner,
  createOrganizationNamespaceProvisioner,
  deriveRelationshipName,
  EnsProtocolError,
  normalizeBasinIdentityInput,
  SettlementError,
} from "@basin/ens";
import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  namehash,
  recoverTypedDataAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

import type {
  ApprovedPayeeDetailDto,
  ApprovedPayeeListDto,
  ApprovedPayeeRowDto,
  PreparedRelationshipDto,
  RelationshipOperationDto,
  ResolvedPayeeDto,
} from "../../shared/approved-payee-types";
import { approvedPayeeConfiguration } from "./config";
import { createReceivingService } from "../settlement/service";
import { finalizeVerifiedIdentity } from "../identities/service";
import {
  createPrivyTreasuryAdapter,
  TreasuryAuthorizationRequired,
  TreasuryProviderError,
} from "../treasury/adapter";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;

const hashRequest = (value: unknown) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

function operationDto(
  operation: Awaited<
    ReturnType<Persistence["approvedPayees"]["readOperation"]>
  >,
): RelationshipOperationDto {
  const messages: Record<typeof operation.status, string> = {
    PREPARED: "Review this action before continuing.",
    AWAITING_AUTHORIZATION: "Approval needs your authorization.",
    SUBMITTED: "The relationship action is being confirmed.",
    CONFIRMED: "The relationship action is confirmed.",
    FAILED:
      "The relationship action failed. Review the current state before retrying.",
    NEEDS_ATTENTION:
      "We couldn't confirm the result yet. Check status before trying again.",
  };
  return {
    id: operation.id.toString(),
    kind: operation.kind,
    status: operation.status,
    step: operation.step,
    message:
      operation.last_error_code === "HIGH_AUTHORITY_TRANSACTION_UNAVAILABLE"
        ? "Organization wallet authorization is not available in this environment. No ENS change was submitted."
        : messages[operation.status],
    updatedAt: operation.updated_at.toISOString(),
  };
}

function currentStatus(
  status: ApprovedPayeeRowDto["status"],
  expiresAt: Date | null,
) {
  return expiresAt &&
    expiresAt <= new Date() &&
    !["REVOKED", "REAPPROVAL_REQUIRED"].includes(status)
    ? ("EXPIRED" as const)
    : status;
}

const statusLabel = (
  status: ApprovedPayeeRowDto["status"],
  recipient: boolean,
) =>
  ({
    PENDING: recipient ? "Review relationship" : "Awaiting acceptance",
    ACTIVE: "Relationship active",
    EXPIRED: "Expired",
    REVOKED: "Revoked",
    REAPPROVAL_REQUIRED: "Review required",
  })[status];

function rowDto(
  value: {
    relationship: {
      id: bigint;
      status: ApprovedPayeeRowDto["status"];
      relationship_name: string | null;
      expires_at: Date | null;
    };
    identity: { ens_name: string };
    payeeName: string;
    organizationName: string;
    organizationIdentity?: string;
    receivingReady?: boolean;
  },
  recipient: boolean,
): ApprovedPayeeRowDto {
  const status = currentStatus(
    value.relationship.status,
    value.relationship.expires_at,
  );
  return {
    id: value.relationship.id.toString(),
    payeeName: value.identity.ens_name,
    payeeDisplayName: value.payeeName,
    organizationName: value.organizationName,
    organizationIdentity: value.organizationIdentity,
    relationshipName: value.relationship.relationship_name ?? undefined,
    status,
    statusLabel: statusLabel(status, recipient),
    expiresAt: value.relationship.expires_at?.toISOString(),
    receivingStatus: value.receivingReady ? "READY" : "SETUP_NEEDED",
  };
}

export function createApprovedPayeeService(
  persistence: Persistence,
  access: Access,
  actorUserId: bigint,
) {
  const workspaceId = access.workspace.id;
  const organizationId = access.organizationId;

  async function list(
    cursor?: bigint,
    limit = 25,
  ): Promise<ApprovedPayeeListDto> {
    if (access.workspace.type === "ORGANIZATION" && organizationId) {
      const [rows, namespace] = await Promise.all([
        persistence.approvedPayees.listForOrganization(
          organizationId,
          cursor,
          limit,
        ),
        persistence.approvedPayees.namespace(organizationId),
      ]);
      const receivingReady = await persistence.approvedPayees.receivingReady(
        rows.map((item) => item.relationship.id),
      );
      return {
        viewer: "ORGANIZATION",
        canApprove: access.memberRole === "ADMIN",
        setup: {
          ready: Boolean(namespace),
          canSetup: access.memberRole === "ADMIN",
          message: namespace
            ? "Organization identity and relationship registry verified."
            : access.memberRole === "ADMIN"
              ? "Set up the organization identity before approving a payee."
              : "An administrator needs to set up the organization identity.",
        },
        rows: rows.map((item) =>
          rowDto(
            {
              ...item,
              payeeName: item.payeeWorkspace.display_name,
              organizationName: access.workspace.display_name,
              receivingReady: receivingReady.has(item.relationship.id),
            },
            false,
          ),
        ),
        ...(rows.length === limit
          ? { nextCursor: rows.at(-1)!.relationship.id.toString() }
          : {}),
      };
    }
    const identity = await persistence.identities.findByWorkspace(workspaceId);
    if (!identity) {
      return {
        viewer: "RECIPIENT",
        canApprove: false,
        setup: {
          ready: false,
          canSetup: false,
          message: "Claim a Basin identity to receive relationship proposals.",
        },
        rows: [],
      };
    }
    const rows = await persistence.approvedPayees.listForIdentity(
      identity.id,
      cursor,
      limit,
    );
    const receivingReady = await persistence.approvedPayees.receivingReady(
      rows.map((item) => item.relationship.id),
    );
    return {
      viewer: "RECIPIENT",
      canApprove: false,
      setup: {
        ready: true,
        canSetup: false,
        message: "Proposals addressed to your Basin identity.",
      },
      rows: rows.map((item) =>
        rowDto(
          {
            relationship: item.relationship,
            identity: item.identity,
            payeeName: access.workspace.display_name,
            organizationName: item.organizationWorkspace.display_name,
            receivingReady: receivingReady.has(item.relationship.id),
          },
          true,
        ),
      ),
      ...(rows.length === limit
        ? { nextCursor: rows.at(-1)!.relationship.id.toString() }
        : {}),
    };
  }

  async function resolve(rawIdentity: string): Promise<ResolvedPayeeDto> {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only an organization administrator can change payee approvals.",
      );
    }
    const normalized = normalizeBasinIdentityInput(rawIdentity);
    let identity;
    try {
      identity = await persistence.identities.findByName(normalized.name);
    } catch {
      throw new DomainError(
        "NOT_FOUND",
        "We couldn't find an active Basin identity with that name.",
      );
    }
    if (identity.protocol_status !== "ACTIVE") {
      throw new DomainError(
        "NOT_FOUND",
        "We couldn't find an active Basin identity with that name.",
      );
    }
    try {
      await createRelationshipReader(
        approvedPayeeConfiguration().ens,
      ).resolveIdentity(
        normalized.name,
        identity.controller_address as Address,
      );
    } catch {
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify this relationship. Try again.",
      );
    }
    let existingRelationshipId: string | undefined;
    try {
      existingRelationshipId = (
        await persistence.relationships.find(organizationId, identity.id)
      ).id.toString();
    } catch {
      existingRelationshipId = undefined;
    }
    const maximumExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return {
      identityId: identity.id.toString(),
      canonicalName: identity.ens_name,
      status: "ACTIVE",
      controller: identity.controller_address,
      identityEpoch: identity.identity_epoch,
      existingRelationshipId,
      maximumExpiry: maximumExpiry.toISOString(),
      reviewExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async function setup(
    organizationLabel: string,
    idempotencyKey: string,
  ): Promise<PreparedRelationshipDto> {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only an organization administrator can change payee approvals.",
      );
    }
    normalizeBasinIdentityInput(organizationLabel);
    const treasury = await persistence.treasury.byOrganization(organizationId);
    if (
      !treasury?.wallet_address ||
      !["CONTROL_READY", "READY"].includes(treasury.status)
    ) {
      throw new DomainError(
        "CONFLICT",
        "Finish organization treasury controls before setting up the organization identity.",
      );
    }
    const existing = await persistence.approvedPayees.namespace(organizationId);
    if (existing) {
      throw new DomainError(
        "CONFLICT",
        "This organization identity is already set up.",
      );
    }
    const operation = await persistence.approvedPayees.operation({
      kind: "SETUP_NAMESPACE",
      organization_id: organizationId,
      actor_user_id: actorUserId,
      actor_workspace_id: workspaceId,
      idempotency_key: idempotencyKey,
      request_hash: hashRequest([
        organizationId.toString(),
        organizationLabel,
        treasury.wallet_address,
      ]),
      status: "AWAITING_AUTHORIZATION",
      step: "AUTHORIZATION_REQUIRED",
      review_snapshot: {
        version: 1,
        organizationLabel: normalizeBasinIdentityInput(organizationLabel).label,
        organizationWallet: treasury.wallet_address,
        chainId: 11155111,
      },
      review_expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    return { operation: operationDto(operation) };
  }

  async function prepareProposal(
    identityId: bigint,
    expiresAt: Date,
    idempotencyKey: string,
  ) {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only an organization administrator can change payee approvals.",
      );
    }
    const [namespace, organization, target] = await Promise.all([
      persistence.approvedPayees.namespace(organizationId),
      persistence.approvedPayees.organizationContext(workspaceId),
      persistence.identities.read(identityId),
    ]);
    if (!namespace || !organization.identity) {
      throw new DomainError(
        "CONFLICT",
        "Set up the organization identity before approving a payee.",
      );
    }
    if (
      target.protocol_status !== "ACTIVE" ||
      target.id === organization.identity.id
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Choose another active Basin identity.",
      );
    }
    const minimum = Date.now() + 60 * 60 * 1000;
    const maximum = Date.now() + 90 * 24 * 60 * 60 * 1000;
    if (expiresAt.getTime() < minimum) {
      throw new DomainError("INVALID_INPUT", "Choose an expiry in the future.");
    }
    if (expiresAt.getTime() > maximum + 60_000) {
      throw new DomainError(
        "INVALID_INPUT",
        "Choose an expiry before this identity or organization name expires.",
      );
    }
    await createRelationshipReader(
      approvedPayeeConfiguration().ens,
    ).resolveIdentity(target.ens_name, getAddress(target.controller_address));
    const existing = await persistence.relationships.findOrCreate(
      organizationId,
      target.id,
    );
    if (existing.status === "ACTIVE") {
      throw new DomainError(
        "CONFLICT",
        "This payee already has an active approval.",
      );
    }
    const relationshipName = deriveRelationshipName(
      target.ens_name,
      organization.identity.label,
    );
    const existingDetail = await persistence.approvedPayees.detail(existing.id);
    if (
      existingDetail.operation?.kind === "PROPOSE" &&
      existingDetail.operation.actor_user_id === actorUserId &&
      existingDetail.operation.actor_workspace_id === workspaceId &&
      existingDetail.operation.review_snapshot.relationshipName ===
        relationshipName &&
      (existingDetail.operation.transaction_hashes.length > 0 ||
        existingDetail.operation.review_snapshot.expiresAt ===
          expiresAt.toISOString())
    ) {
      return {
        operation: operationDto(existingDetail.operation),
        relationshipId: existing.id.toString(),
      };
    }
    const operation = await persistence.approvedPayees.operation({
      kind: "PROPOSE",
      organization_id: organizationId,
      actor_user_id: actorUserId,
      actor_workspace_id: workspaceId,
      approved_payee_id: existing.id,
      identity_id: target.id,
      idempotency_key: idempotencyKey,
      request_hash: hashRequest([
        organizationId.toString(),
        target.id.toString(),
        relationshipName,
        expiresAt.toISOString(),
      ]),
      status: "AWAITING_AUTHORIZATION",
      step: "AUTHORIZATION_REQUIRED",
      review_snapshot: {
        version: 1,
        identityName: target.ens_name,
        identityController: target.controller_address,
        identityEpoch: target.identity_epoch,
        payeeId: target.payee_id,
        relationshipName,
        relationshipRegistry: namespace.registry_address,
        expiresAt: expiresAt.toISOString(),
      },
      review_expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    return {
      operation: operationDto(operation),
      relationshipId: existing.id.toString(),
    };
  }

  async function detail(
    relationshipId: bigint,
  ): Promise<ApprovedPayeeDetailDto> {
    const value = await persistence.approvedPayees.detail(relationshipId);
    const receivingOperation = value.generation
      ? (
          await persistence.receiving.operations(
            value.identity.workspace_id,
            relationshipId,
          )
        ).find(
          (operation) =>
            operation.status === "CONFIRMED" &&
            operation.relationship_token_id ===
              value.generation!.relationship_token_id,
        )
      : undefined;
    const receivingReady = Boolean(value.settlement || receivingOperation);
    const organizationViewer =
      access.workspace.type === "ORGANIZATION" &&
      access.organizationId === value.organization.id;
    const recipientViewer =
      access.workspace.type === "PERSONAL" &&
      access.workspace.id === value.identity.workspace_id;
    if (!organizationViewer && !recipientViewer) {
      throw new DomainError("NOT_FOUND", "We couldn't find that relationship.");
    }
    const row = rowDto(
      {
        relationship: value.relationship,
        identity: value.identity,
        payeeName: value.payeeWorkspace.display_name,
        organizationName: value.organizationWorkspace.display_name,
        receivingReady,
      },
      recipientViewer,
    );
    let verification: ApprovedPayeeDetailDto["verification"] = "unavailable";
    let technical: ApprovedPayeeDetailDto["technical"] = {
      network: "Ethereum Sepolia",
    };
    let activationReady = false;
    const blockingReasons: string[] = [];
    if (value.generation && value.relationship.relationship_name) {
      try {
        const config = approvedPayeeConfiguration();
        activationReady = Boolean(config.activation);
        const observed = await createRelationshipReader(config.ens).observe({
          name: value.relationship.relationship_name,
          identityName: value.identity.ens_name,
          controller: getAddress(value.identity.controller_address),
          identityEpoch: BigInt(value.identity.identity_epoch),
          tokenId: BigInt(value.generation.relationship_token_id),
          registry: getAddress(value.generation.relationship_registry_address),
        });
        verification =
          value.root && observed.profile !== value.root.security_root_commitment
            ? "changed"
            : "verified";
        if (row.status === "ACTIVE") {
          if (!value.root || !config.activation) {
            verification = "unavailable";
          } else {
            const client = createPublicClient({
              chain: sepolia,
              transport: http(config.ens.rpcUrl, {
                timeout: 8_000,
                retryCount: 1,
              }),
            });
            const accepted = await client.readContract({
              address: config.activation.address,
              abi: basinRouterActivationAbi,
              functionName: "acceptedRoot",
              args: [
                getAddress(value.root.organization_wallet_address),
                value.generation.relationship_namehash as `0x${string}`,
                BigInt(value.generation.relationship_token_id),
              ],
              blockNumber: observed.blockNumber,
            });
            if (
              accepted[0] !== value.root.security_root_commitment ||
              accepted[1] !== value.root.payee_id ||
              accepted[2] !==
                BigInt(
                  Math.floor(
                    value.root.accepted_relationship_expiry.getTime() / 1000,
                  ),
                ) ||
              accepted[3] !== BigInt(value.root.acceptance_nonce)
            ) {
              verification = "changed";
            }
          }
        }
        technical = {
          network: "Ethereum Sepolia",
          registryAddress: observed.registry,
          relationshipTokenId: observed.tokenId.toString(),
          generationId: value.generation.id.toString(),
          resolverAddress: observed.resolver,
          resolverImplementationAddress: observed.implementation,
          resolverImplementationCodeHash: observed.implementationCodeHash,
          resolverPermissionProfileHash: observed.resolverProfile,
          registryPermissionProfileHash: observed.registryProfile,
          securityRootCommitment: value.root?.security_root_commitment,
          activationTransactionHash: value.root?.activation_transaction_hash,
          activationBlockNumber: value.root?.activation_block_number,
          lastVerifiedAt: new Date(
            Number(observed.timestamp) * 1000,
          ).toISOString(),
        };
      } catch {
        blockingReasons.push(
          "We couldn't verify this relationship. Try again.",
        );
      }
    } else {
      blockingReasons.push("Organization authorization is not confirmed yet.");
    }
    if (verification === "changed")
      blockingReasons.push(
        "This payee's authority changed. A new approval and acceptance are needed.",
      );
    if (verification === "unavailable" && blockingReasons.length === 0)
      blockingReasons.push("We couldn't verify this relationship. Try again.");
    if (!activationReady)
      blockingReasons.push(
        "Relationship acceptance is temporarily unavailable while Basin's activation service is being configured.",
      );
    if (!receivingReady) blockingReasons.push("Receiving setup needed.");
    if (row.status === "PENDING")
      blockingReasons.push("Recipient acceptance is still needed.");
    if (["EXPIRED", "REVOKED", "REAPPROVAL_REQUIRED"].includes(row.status))
      blockingReasons.push(`${row.statusLabel}.`);
    const eligible =
      row.status === "ACTIVE" &&
      verification === "verified" &&
      Boolean(value.root) &&
      Boolean(value.settlement);
    return {
      ...row,
      organizationId: value.organization.id.toString(),
      payeeId: value.identity.payee_id,
      identityController: value.identity.controller_address,
      identityEpoch: value.identity.identity_epoch,
      verification,
      eligible,
      blockingReasons,
      canAccept:
        recipientViewer &&
        row.status === "PENDING" &&
        verification === "verified" &&
        activationReady &&
        Boolean(value.generation) &&
        receivingReady,
      canSetupReceiving:
        recipientViewer &&
        row.status === "PENDING" &&
        verification === "verified" &&
        Boolean(value.generation) &&
        !receivingReady,
      canRevoke:
        organizationViewer &&
        access.memberRole === "ADMIN" &&
        ["PENDING", "ACTIVE"].includes(row.status),
      canReapprove:
        organizationViewer &&
        access.memberRole === "ADMIN" &&
        ["EXPIRED", "REVOKED", "REAPPROVAL_REQUIRED"].includes(row.status),
      operation: value.operation ? operationDto(value.operation) : undefined,
      history: value.events.map((event) => ({
        id: event.id.toString(),
        type: event.event_type,
        occurredAt: event.occurred_at.toISOString(),
        generationId: event.generation_id?.toString(),
        transactionHash: event.transaction_hash ?? undefined,
      })),
      technical,
    };
  }

  async function prepareRevoke(
    relationshipId: bigint,
    reason: string | undefined,
    idempotencyKey: string,
  ) {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only an organization administrator can change payee approvals.",
      );
    }
    const value = await persistence.approvedPayees.detail(relationshipId);
    if (
      value.organization.id !== organizationId ||
      !value.generation ||
      !["PENDING", "ACTIVE"].includes(
        currentStatus(value.relationship.status, value.relationship.expires_at),
      )
    ) {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const operation = await persistence.approvedPayees.operation({
      kind: "REVOKE",
      organization_id: organizationId,
      actor_user_id: actorUserId,
      actor_workspace_id: workspaceId,
      approved_payee_id: value.relationship.id,
      identity_id: value.identity.id,
      idempotency_key: idempotencyKey,
      request_hash: hashRequest([
        relationshipId.toString(),
        value.generation.relationship_token_id,
        reason ?? null,
      ]),
      status: "AWAITING_AUTHORIZATION",
      step: "AUTHORIZATION_REQUIRED",
      review_snapshot: {
        version: 1,
        relationshipName: value.relationship.relationship_name,
        relationshipTokenId: value.generation.relationship_token_id,
        generationId: value.generation.id.toString(),
        reason: reason ?? null,
      },
      review_expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    return {
      operation: operationDto(operation),
      relationshipId: value.relationship.id.toString(),
    };
  }

  async function prepareAccept(
    relationshipId: bigint,
    idempotencyKey: string,
  ): Promise<PreparedRelationshipDto> {
    const value = await persistence.approvedPayees.detail(relationshipId);
    if (
      access.workspace.type !== "PERSONAL" ||
      access.workspace.id !== value.identity.workspace_id
    ) {
      throw new DomainError("NOT_FOUND", "We couldn't find that relationship.");
    }
    if (
      !value.generation ||
      !value.relationship.relationship_name ||
      currentStatus(
        value.relationship.status,
        value.relationship.expires_at,
      ) !== "PENDING"
    ) {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const receiving = (
      await persistence.receiving.operations(workspaceId, relationshipId)
    ).find(
      (item) =>
        item.status === "CONFIRMED" &&
        item.relationship_token_id === value.generation!.relationship_token_id,
    );
    if (!receiving) {
      throw new DomainError(
        "CONFLICT",
        "Set up receiving for this relationship before accepting.",
      );
    }
    const config = approvedPayeeConfiguration();
    if (!config.activation) {
      throw new DomainError(
        "UNAVAILABLE",
        "Relationship acceptance is temporarily unavailable while Basin's activation service is being configured.",
      );
    }
    const observed = await createRelationshipReader(config.ens).observe({
      name: value.relationship.relationship_name,
      identityName: value.identity.ens_name,
      controller: getAddress(value.identity.controller_address),
      identityEpoch: BigInt(value.identity.identity_epoch),
      tokenId: BigInt(value.generation.relationship_token_id),
      registry: getAddress(value.generation.relationship_registry_address),
    });
    if (
      observed.record === "0x" ||
      observed.decoded?.commitment !== receiving.commitment
    ) {
      throw new DomainError(
        "CONFLICT",
        "Receiving details changed. Review the latest account before continuing.",
      );
    }
    const treasury = await persistence.treasury.byOrganization(
      value.organization.id,
    );
    if (!treasury?.wallet_address)
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify this relationship. Try again.",
      );
    const client = createPublicClient({
      chain: sepolia,
      transport: http(config.ens.rpcUrl, { timeout: 8_000, retryCount: 1 }),
    });
    const key = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "bytes32" }, { type: "uint256" }],
        [
          getAddress(treasury.wallet_address),
          namehash(value.relationship.relationship_name),
          observed.tokenId,
        ],
      ),
    );
    const nonce = await client.readContract({
      address: config.activation.address,
      abi: basinRouterActivationAbi,
      functionName: "nextNonce",
      args: [key],
    });
    const message = {
      organization: getAddress(treasury.wallet_address),
      relationshipNamehash: namehash(value.relationship.relationship_name),
      relationshipTokenId: observed.tokenId,
      payeeId: value.identity.payee_id as `0x${string}`,
      securityRootCommitment: observed.profile,
      expiry: BigInt(Math.floor(value.generation.expires_at.getTime() / 1000)),
      nonce,
    };
    const serializedMessage = Object.fromEntries(
      Object.entries(message).map(([keyName, item]) => [
        keyName,
        typeof item === "bigint" ? item.toString() : item,
      ]),
    );
    const operation = await persistence.approvedPayees.operation({
      kind: "ACCEPT",
      organization_id: value.organization.id,
      actor_user_id: actorUserId,
      actor_workspace_id: workspaceId,
      approved_payee_id: value.relationship.id,
      identity_id: value.identity.id,
      idempotency_key: idempotencyKey,
      request_hash: hashRequest(serializedMessage),
      status: "AWAITING_AUTHORIZATION",
      step: "AUTHORIZATION_REQUIRED",
      review_snapshot: {
        version: 1,
        generationId: value.generation.id.toString(),
        resolver: observed.resolver,
        resolverImplementation: observed.implementation,
        resolverImplementationCodeHash: observed.implementationCodeHash,
        resolverPermissionProfileHash: observed.resolverProfile,
        registryPermissionProfileHash: observed.registryProfile,
        receivingCommitment: receiving.commitment,
        observedBlock: observed.blockNumber.toString(),
      },
      acceptance_payload: serializedMessage,
      review_expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    return {
      operation: operationDto(operation),
      relationshipId: value.relationship.id.toString(),
      authorization: {
        type: "CONTROLLER_SIGNATURE",
        controller: value.identity.controller_address,
        domain: {
          name: "BasinRouter",
          version: "1",
          chainId: 11155111,
          verifyingContract: config.activation.address,
        },
        types: acceptanceTypes,
        primaryType: "AcceptApprovedPayee",
        message: serializedMessage,
      },
    };
  }

  async function authorize(
    operationId: bigint,
    signature?: `0x${string}`,
    walletAuthorizationSignature?: string,
    walletAuthorizationExpiry?: number,
  ): Promise<PreparedRelationshipDto> {
    const operation =
      await persistence.approvedPayees.readOperation(operationId);
    if (
      operation.actor_user_id !== actorUserId ||
      operation.actor_workspace_id !== workspaceId
    ) {
      throw new DomainError(
        "NOT_FOUND",
        "We couldn't find that relationship action.",
      );
    }
    if (operation.status === "CONFIRMED") {
      return {
        operation: operationDto(operation),
        relationshipId: operation.approved_payee_id?.toString(),
      };
    }
    const canReconcileSubmittedWrite =
      operation.status === "NEEDS_ATTENTION" &&
      operation.transaction_hashes.length > 0 &&
      ["SETUP_NAMESPACE", "PROPOSE", "REVOKE"].includes(operation.kind);
    if (
      operation.review_expires_at <= new Date() &&
      !canReconcileSubmittedWrite
    ) {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    if (operation.kind === "SETUP_NAMESPACE") {
      if (
        access.workspace.type !== "ORGANIZATION" ||
        access.memberRole !== "ADMIN" ||
        access.organizationId !== operation.organization_id
      ) {
        throw new DomainError(
          "INVALID_INPUT",
          "Only an organization administrator can set up this identity.",
        );
      }
      const treasury = await persistence.treasury.byOrganization(
        operation.organization_id,
      );
      if (
        !treasury?.wallet_address ||
        !treasury.privy_wallet_id ||
        !["CONTROL_READY", "READY"].includes(treasury.status)
      ) {
        throw new DomainError(
          "CONFLICT",
          "Finish organization treasury controls before setting up the organization identity.",
        );
      }
      const label = operation.review_snapshot.organizationLabel;
      if (typeof label !== "string") {
        throw new DomainError(
          "CONFLICT",
          "Review the organization identity before trying again.",
        );
      }
      const ensConfig = approvedPayeeConfiguration().ens;
      let organizationWalletBalance: bigint;
      try {
        organizationWalletBalance = await createPublicClient({
          chain: sepolia,
          transport: http(ensConfig.rpcUrl, {
            timeout: 8_000,
            retryCount: 1,
          }),
        }).getBalance({ address: getAddress(treasury.wallet_address) });
      } catch {
        throw new DomainError(
          "UNAVAILABLE",
          "We couldn't check the organization wallet's Sepolia balance. Try again.",
        );
      }
      if (organizationWalletBalance === 0n) {
        throw new DomainError(
          "CONFLICT",
          "Add Sepolia ETH to the organization wallet to cover identity setup gas, then try again.",
        );
      }
      await persistence.approvedPayees.updateOperation(operation.id, {
        status: "SUBMITTED",
        step: "NAMESPACE_SUBMITTED",
        last_error_code: null,
      });
      try {
        const privy = createPrivyTreasuryAdapter();
        const sendHighAuthorityTransaction = privy.sendHighAuthorityTransaction;
        if (!sendHighAuthorityTransaction) {
          throw new DomainError(
            "UNAVAILABLE",
            "Organization wallet authorization is unavailable right now.",
          );
        }
        let authorizationReference: string | undefined;
        let pendingAuthorizationSignature = walletAuthorizationSignature;
        let pendingAuthorizationExpiry = walletAuthorizationExpiry;
        const provisioner = createOrganizationNamespaceProvisioner(
          ensConfig,
          async (transaction) => {
            const submitted = await sendHighAuthorityTransaction({
              walletId: treasury.privy_wallet_id!,
              to: transaction.to,
              data: transaction.data,
              idempotencyKey: `${operation.idempotency_key}-${transaction.idempotencySuffix}`,
              authorizationSignature: pendingAuthorizationSignature,
              requestExpiry: pendingAuthorizationExpiry,
            });
            pendingAuthorizationSignature = undefined;
            pendingAuthorizationExpiry = undefined;
            authorizationReference = submitted.transactionId;
            return submitted.hash as `0x${string}`;
          },
        );
        const provisioned = await provisioner.provision(
          label,
          getAddress(treasury.wallet_address),
        );
        await finalizeVerifiedIdentity(
          persistence,
          workspaceId,
          provisioned.identity,
        );
        const identity =
          await persistence.identities.findByWorkspace(workspaceId);
        if (!identity) {
          throw new DomainError(
            "UNAVAILABLE",
            "The organization identity is onchain, but Basin couldn't finish setup. Check again.",
          );
        }
        await persistence.approvedPayees.saveNamespace({
          organization_id: operation.organization_id,
          basin_identity_id: identity.id,
          chain_id: 11155111,
          registry_address: provisioned.registryAddress.toLowerCase(),
          parent_name: provisioned.identity.name,
          registry_implementation_address:
            provisioned.registryImplementationAddress.toLowerCase(),
          setup_operation_id: operation.id,
          verification_block_number:
            provisioned.verificationBlockNumber.toString(),
          verified_at: new Date(provisioned.identity.verifiedAt),
        });
        const confirmed = await persistence.approvedPayees.updateOperation(
          operation.id,
          {
            status: "CONFIRMED",
            step: "COMPLETE",
            authorization_reference: authorizationReference,
            transaction_hashes: provisioned.transactionHashes,
            last_error_code: null,
          },
        );
        return { operation: operationDto(confirmed) };
      } catch (error) {
        if (error instanceof TreasuryAuthorizationRequired) {
          const pending = await persistence.approvedPayees.updateOperation(
            operation.id,
            {
              status: "AWAITING_AUTHORIZATION",
              step: "AUTHORIZATION_REQUIRED",
              last_error_code: null,
            },
          );
          return {
            operation: operationDto(pending),
            walletAuthorization: error.authorization,
          };
        }
        const setupErrorCode =
          error instanceof TreasuryProviderError
            ? [error.code, error.diagnostic].filter(Boolean).join(":")
            : error instanceof EnsProtocolError
              ? error.code
              : "NAMESPACE_SETUP_UNCONFIRMED";
        await persistence.approvedPayees.updateOperation(operation.id, {
          status: "NEEDS_ATTENTION",
          step: "VERIFYING",
          last_error_code: setupErrorCode,
        });
        if (error instanceof DomainError) throw error;
        if (error instanceof TreasuryProviderError) {
          if (error.code === "INSUFFICIENT_FUNDS") {
            throw new DomainError(
              "CONFLICT",
              "Add Sepolia ETH to the organization wallet to cover identity setup gas, then try again.",
            );
          }
          if (error.code === "TRANSACTION_REJECTED") {
            throw new DomainError(
              "CONFLICT",
              "ENS rejected the organization wallet transaction. Check the current identity state before retrying.",
            );
          }
          throw new DomainError(
            "UNAVAILABLE",
            error.code === "AUTHORIZATION_REQUIRED"
              ? "Your current session couldn't authorize the organization wallet. Sign in again and retry."
              : "The organization wallet is unavailable right now. No ENS setup was confirmed.",
          );
        }
        if (error instanceof EnsProtocolError) {
          throw new DomainError(
            error.code === "COLLISION" ? "CONFLICT" : "UNAVAILABLE",
            error.message,
          );
        }
        throw new DomainError(
          "UNAVAILABLE",
          "We couldn't confirm the organization identity setup. Check wallet funding and try again.",
        );
      }
    }
    if (operation.kind === "PROPOSE" || operation.kind === "REVOKE") {
      if (
        access.workspace.type !== "ORGANIZATION" ||
        access.memberRole !== "ADMIN" ||
        access.organizationId !== operation.organization_id ||
        !operation.approved_payee_id
      ) {
        throw new DomainError(
          "INVALID_INPUT",
          "Only an organization administrator can change payee approvals.",
        );
      }
      const treasury = await persistence.treasury.byOrganization(
        operation.organization_id,
      );
      if (
        !treasury?.wallet_address ||
        !treasury.privy_wallet_id ||
        !["CONTROL_READY", "READY"].includes(treasury.status)
      ) {
        throw new DomainError(
          "CONFLICT",
          "Finish organization treasury controls before changing payee approvals.",
        );
      }
      const sendHighAuthorityTransaction =
        createPrivyTreasuryAdapter().sendHighAuthorityTransaction;
      if (!sendHighAuthorityTransaction) {
        throw new DomainError(
          "UNAVAILABLE",
          "Organization wallet authorization is unavailable right now.",
        );
      }
      const config = approvedPayeeConfiguration().ens;
      let pendingAuthorizationSignature = walletAuthorizationSignature;
      let pendingAuthorizationExpiry = walletAuthorizationExpiry;
      let authorizationReference =
        operation.authorization_reference ?? undefined;
      const transactionHashes = [...operation.transaction_hashes];
      const provisioner = createRelationshipProvisioner(
        config,
        async (transaction) => {
          const submitted = await sendHighAuthorityTransaction({
            walletId: treasury.privy_wallet_id!,
            to: transaction.to,
            data: transaction.data,
            idempotencyKey: `${operation.idempotency_key}-${transaction.idempotencySuffix}`,
            authorizationSignature: pendingAuthorizationSignature,
            requestExpiry: pendingAuthorizationExpiry,
          });
          pendingAuthorizationSignature = undefined;
          pendingAuthorizationExpiry = undefined;
          authorizationReference = submitted.transactionId;
          if (!transactionHashes.includes(submitted.hash))
            transactionHashes.push(submitted.hash);
          await persistence.approvedPayees.updateOperation(operation.id, {
            status: "SUBMITTED",
            step:
              operation.kind === "PROPOSE"
                ? "REGISTRATION_SUBMITTED"
                : "REVOCATION_SUBMITTED",
            authorization_reference: authorizationReference,
            transaction_hashes: transactionHashes,
            last_error_code: null,
          });
          return submitted.hash as `0x${string}`;
        },
      );
      try {
        if (operation.kind === "PROPOSE") {
          const snapshot = operation.review_snapshot;
          if (
            typeof snapshot.relationshipName !== "string" ||
            typeof snapshot.identityName !== "string" ||
            typeof snapshot.identityController !== "string" ||
            typeof snapshot.identityEpoch !== "string" ||
            typeof snapshot.relationshipRegistry !== "string" ||
            typeof snapshot.expiresAt !== "string"
          ) {
            throw new DomainError(
              "CONFLICT",
              "Review the payee again before continuing.",
            );
          }
          const expiry = new Date(snapshot.expiresAt);
          if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
            throw new DomainError(
              "CONFLICT",
              "The approval expiry changed. Review the payee again.",
            );
          }
          const current = await persistence.approvedPayees.detail(
            operation.approved_payee_id,
          );
          if (
            current.generation &&
            current.relationship.status !== "REVOKED" &&
            current.generation.expires_at > new Date()
          ) {
            throw new DomainError(
              "CONFLICT",
              "The relationship changed. Review the latest details before trying again.",
            );
          }
          const provisioned = await provisioner.provision({
            name: snapshot.relationshipName,
            identityName: snapshot.identityName,
            controller: getAddress(snapshot.identityController),
            identityEpoch: BigInt(snapshot.identityEpoch),
            registry: getAddress(snapshot.relationshipRegistry),
            expiry: BigInt(Math.floor(expiry.getTime() / 1000)),
            generationSalt: operation.id,
          });
          for (const hash of provisioned.transactionHashes)
            if (!transactionHashes.includes(hash)) transactionHashes.push(hash);
          let registeredAt = new Date(
            Number(provisioned.observed.timestamp) * 1000,
          );
          const registrationHash = transactionHashes.at(-1) as
            `0x${string}` | undefined;
          if (registrationHash) {
            const chain = createPublicClient({
              chain: sepolia,
              transport: http(config.rpcUrl, {
                timeout: 8_000,
                retryCount: 1,
              }),
            });
            const receipt = await chain.getTransactionReceipt({
              hash: registrationHash,
            });
            if (receipt.status !== "success") {
              throw new EnsProtocolError(
                "TRANSACTION_REVERTED",
                "The relationship transaction reverted.",
              );
            }
            const block = await chain.getBlock({
              blockNumber: receipt.blockNumber,
            });
            registeredAt = new Date(Number(block.timestamp) * 1000);
          }
          const confirmed = await persistence.approvedPayees.confirmProposal({
            operationId: operation.id,
            relationshipId: operation.approved_payee_id,
            relationshipName: snapshot.relationshipName,
            relationshipTokenId: provisioned.observed.tokenId.toString(),
            relationshipNamehash: namehash(snapshot.relationshipName),
            relationshipRegistryAddress:
              provisioned.observed.registry.toLowerCase(),
            registeredAt,
            expiresAt: expiry,
            transactionHashes,
            actorUserId,
            evidence: {
              chainId: 11155111,
              blockNumber: provisioned.observed.blockNumber.toString(),
              relationshipTokenId: provisioned.observed.tokenId.toString(),
              resolver: provisioned.observed.resolver,
              securityRootCommitment: provisioned.observed.profile,
            },
          });
          return {
            operation: operationDto(confirmed),
            relationshipId: operation.approved_payee_id.toString(),
          };
        }
        const snapshot = operation.review_snapshot;
        if (
          typeof snapshot.relationshipName !== "string" ||
          typeof snapshot.relationshipTokenId !== "string" ||
          typeof snapshot.generationId !== "string"
        ) {
          throw new DomainError(
            "CONFLICT",
            "Review the relationship again before continuing.",
          );
        }
        const current = await persistence.approvedPayees.detail(
          operation.approved_payee_id,
        );
        if (
          !current.generation ||
          current.generation.id !== BigInt(snapshot.generationId) ||
          current.generation.relationship_token_id !==
            snapshot.relationshipTokenId
        ) {
          throw new DomainError(
            "CONFLICT",
            "The relationship changed. Review the latest details before trying again.",
          );
        }
        const revoked = await provisioner.revoke({
          registry: getAddress(
            current.generation.relationship_registry_address,
          ),
          tokenId: BigInt(snapshot.relationshipTokenId),
          label: snapshot.relationshipName.split(".")[0],
        });
        for (const hash of revoked.transactionHashes)
          if (!transactionHashes.includes(hash)) transactionHashes.push(hash);
        const revokedAt = new Date();
        const confirmed = await persistence.approvedPayees.confirmRevocation({
          operationId: operation.id,
          relationshipId: operation.approved_payee_id,
          generationId: current.generation.id,
          revokedAt,
          reason:
            typeof snapshot.reason === "string" ? snapshot.reason : undefined,
          transactionHashes,
          actorUserId,
          evidence: {
            chainId: 11155111,
            relationshipTokenId: snapshot.relationshipTokenId,
            registry: current.generation.relationship_registry_address,
          },
        });
        return {
          operation: operationDto(confirmed),
          relationshipId: operation.approved_payee_id.toString(),
        };
      } catch (error) {
        if (error instanceof TreasuryAuthorizationRequired) {
          const pending = await persistence.approvedPayees.updateOperation(
            operation.id,
            {
              status: "AWAITING_AUTHORIZATION",
              step: "AUTHORIZATION_REQUIRED",
              authorization_reference: authorizationReference,
              transaction_hashes: transactionHashes,
              last_error_code: null,
            },
          );
          return {
            operation: operationDto(pending),
            relationshipId: operation.approved_payee_id.toString(),
            walletAuthorization: error.authorization,
          };
        }
        await persistence.approvedPayees.updateOperation(operation.id, {
          status: "NEEDS_ATTENTION",
          step: "VERIFYING",
          authorization_reference: authorizationReference,
          transaction_hashes: transactionHashes,
          last_error_code:
            error instanceof TreasuryProviderError
              ? [error.code, error.diagnostic].filter(Boolean).join(":")
              : error instanceof EnsProtocolError
                ? error.code
                : error instanceof SettlementError
                  ? error.code
                  : "RELATIONSHIP_WRITE_UNCONFIRMED",
        });
        if (error instanceof DomainError) throw error;
        if (error instanceof EnsProtocolError) {
          throw new DomainError(
            error.code === "COLLISION" ? "CONFLICT" : "UNAVAILABLE",
            error.message,
          );
        }
        if (error instanceof SettlementError) {
          throw new DomainError(
            "UNAVAILABLE",
            "We couldn't verify the relationship permissions after submission. Check its status before retrying.",
          );
        }
        throw new DomainError(
          "UNAVAILABLE",
          "We couldn't confirm the relationship change. Check its status before retrying.",
        );
      }
    }
    if (operation.kind !== "ACCEPT") {
      throw new DomainError(
        "CONFLICT",
        "The relationship action cannot be resumed from its current state.",
      );
    }
    if (
      !signature ||
      !operation.acceptance_payload ||
      !operation.approved_payee_id
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only this identity's controller can accept the relationship.",
      );
    }
    const value = await persistence.approvedPayees.detail(
      operation.approved_payee_id,
    );
    if (!value.generation || !value.relationship.relationship_name) {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const reviewSnapshot = operation.review_snapshot as Record<string, unknown>;
    if (typeof reviewSnapshot.resolver !== "string") {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const config = approvedPayeeConfiguration();
    if (!config.activation)
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify this relationship. Try again.",
      );
    const raw = operation.acceptance_payload as Record<string, string>;
    const message = {
      organization: getAddress(raw.organization),
      relationshipNamehash: raw.relationshipNamehash as `0x${string}`,
      relationshipTokenId: BigInt(raw.relationshipTokenId),
      payeeId: raw.payeeId as `0x${string}`,
      securityRootCommitment: raw.securityRootCommitment as `0x${string}`,
      expiry: BigInt(raw.expiry),
      nonce: BigInt(raw.nonce),
    };
    const signer = await recoverTypedDataAddress({
      domain: {
        name: "BasinRouter",
        version: "1",
        chainId: 11155111,
        verifyingContract: config.activation.address,
      },
      types: acceptanceTypes,
      primaryType: "AcceptApprovedPayee",
      message,
      signature,
    });
    if (
      signer.toLowerCase() !== value.identity.controller_address.toLowerCase()
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only this identity's controller can accept the relationship.",
      );
    }
    const data = encodeFunctionData({
      abi: basinRouterActivationAbi,
      functionName: "activateApprovedPayee",
      args: [
        message,
        getAddress(value.identity.controller_address),
        signature,
        {
          identityLabel: value.identity.ens_name.split(".")[0],
          organizationLabel: value.relationship.relationship_name.split(".")[1],
          relationshipRegistry: getAddress(
            value.generation.relationship_registry_address,
          ),
          resolver: getAddress(reviewSnapshot.resolver),
          identityEpoch: BigInt(value.identity.identity_epoch),
        },
      ],
    });
    const updated = await persistence.approvedPayees.updateOperation(
      operation.id,
      {
        acceptance_signature: signature.toLowerCase(),
        status: "SUBMITTED",
        step: "ACTIVATION_SUBMITTED",
      },
    );
    return {
      operation: operationDto(updated),
      relationshipId: operation.approved_payee_id.toString(),
      transaction: {
        to: config.activation.address,
        data,
        chainId: 11155111,
        from: value.identity.controller_address,
      },
    };
  }

  async function reconcile(
    operationId: bigint,
    transactionHash?: `0x${string}`,
  ) {
    const operation =
      await persistence.approvedPayees.readOperation(operationId);
    const organizationViewer =
      access.workspace.type === "ORGANIZATION" &&
      access.organizationId === operation.organization_id;
    const actorViewer =
      operation.actor_user_id === actorUserId &&
      operation.actor_workspace_id === workspaceId;
    if (!organizationViewer && !actorViewer)
      throw new DomainError(
        "NOT_FOUND",
        "We couldn't find that relationship action.",
      );
    if (
      transactionHash &&
      !operation.transaction_hashes.includes(transactionHash)
    ) {
      await persistence.approvedPayees.updateOperation(operation.id, {
        transaction_hashes: [transactionHash],
      });
    }
    // Setup/proposal/revocation operations are reconciled from their stored
    // server-side context; a caller-supplied hash is never sufficient evidence.
    if (operation.kind !== "ACCEPT") {
      if (
        operation.transaction_hashes.length > 0 &&
        ["SUBMITTED", "NEEDS_ATTENTION"].includes(operation.status)
      ) {
        return (await authorize(operation.id)).operation;
      }
      return operationDto(operation);
    }
    if (
      !operation.approved_payee_id ||
      !operation.acceptance_payload ||
      !operation.acceptance_signature
    ) {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const hash = (transactionHash ?? operation.transaction_hashes[0]) as
      `0x${string}` | undefined;
    if (!hash) return operationDto(operation);
    const value = await persistence.approvedPayees.detail(
      operation.approved_payee_id,
    );
    if (!value.generation || !value.relationship.relationship_name) {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const reviewSnapshot = operation.review_snapshot as Record<string, unknown>;
    if (typeof reviewSnapshot.resolver !== "string") {
      throw new DomainError(
        "CONFLICT",
        "The relationship changed. Review the latest details before trying again.",
      );
    }
    const config = approvedPayeeConfiguration();
    if (!config.activation)
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify this relationship. Try again.",
      );
    const activationAddress = config.activation.address;
    const raw = operation.acceptance_payload as Record<string, string>;
    const message = {
      organization: getAddress(raw.organization),
      relationshipNamehash: raw.relationshipNamehash as `0x${string}`,
      relationshipTokenId: BigInt(raw.relationshipTokenId),
      payeeId: raw.payeeId as `0x${string}`,
      securityRootCommitment: raw.securityRootCommitment as `0x${string}`,
      expiry: BigInt(raw.expiry),
      nonce: BigInt(raw.nonce),
    };
    const expectedInput = encodeFunctionData({
      abi: basinRouterActivationAbi,
      functionName: "activateApprovedPayee",
      args: [
        message,
        getAddress(value.identity.controller_address),
        operation.acceptance_signature as `0x${string}`,
        {
          identityLabel: value.identity.ens_name.split(".")[0],
          organizationLabel: value.relationship.relationship_name.split(".")[1],
          relationshipRegistry: getAddress(
            value.generation.relationship_registry_address,
          ),
          resolver: getAddress(reviewSnapshot.resolver),
          identityEpoch: BigInt(value.identity.identity_epoch),
        },
      ],
    });
    const client = createPublicClient({
      chain: sepolia,
      transport: http(config.ens.rpcUrl, { timeout: 8_000, retryCount: 1 }),
    });
    const [transaction, receipt, head] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
      client.getBlockNumber({ cacheTime: 0 }),
    ]);
    if (
      !transaction.to ||
      transaction.to.toLowerCase() !==
        config.activation.address.toLowerCase() ||
      transaction.from.toLowerCase() !==
        value.identity.controller_address.toLowerCase() ||
      transaction.input !== expectedInput ||
      transaction.chainId !== 11155111 ||
      receipt.status !== "success" ||
      head < receipt.blockNumber + 1n ||
      transaction.blockHash !== receipt.blockHash
    ) {
      throw new DomainError(
        "CONFLICT",
        "This relationship needs a new approval before it can be used.",
      );
    }
    const accepted = await client.readContract({
      address: config.activation.address,
      abi: basinRouterActivationAbi,
      functionName: "acceptedRoot",
      args: [
        message.organization,
        message.relationshipNamehash,
        message.relationshipTokenId,
      ],
      blockNumber: head,
    });
    if (
      accepted[0] !== message.securityRootCommitment ||
      accepted[1] !== message.payeeId ||
      accepted[2] !== message.expiry ||
      accepted[3] !== message.nonce
    ) {
      throw new DomainError(
        "CONFLICT",
        "This relationship needs a new approval before it can be used.",
      );
    }
    const observed = await createRelationshipReader(config.ens).observe({
      name: value.relationship.relationship_name,
      identityName: value.identity.ens_name,
      controller: getAddress(value.identity.controller_address),
      identityEpoch: BigInt(value.identity.identity_epoch),
      tokenId: BigInt(value.generation.relationship_token_id),
      registry: getAddress(value.generation.relationship_registry_address),
    });
    if (
      observed.profile !== message.securityRootCommitment ||
      observed.blockNumber < receipt.blockNumber
    ) {
      throw new DomainError(
        "CONFLICT",
        "This relationship needs a new approval before it can be used.",
      );
    }
    const activationLog = receipt.logs.find((log) => {
      try {
        if (log.address.toLowerCase() !== activationAddress.toLowerCase())
          return false;
        const decoded = decodeEventLog({
          abi: basinRouterActivationAbi,
          data: log.data,
          topics: log.topics,
        });
        return (
          decoded.eventName === "ApprovedPayeeActivated" &&
          decoded.args.organization === message.organization &&
          decoded.args.relationshipNamehash === message.relationshipNamehash &&
          decoded.args.relationshipTokenId === message.relationshipTokenId &&
          decoded.args.payeeId === message.payeeId &&
          decoded.args.securityRootCommitment ===
            message.securityRootCommitment &&
          decoded.args.expiry === message.expiry &&
          decoded.args.nonce === message.nonce
        );
      } catch {
        return false;
      }
    });
    if (!activationLog)
      throw new DomainError(
        "CONFLICT",
        "We couldn't verify this relationship. Try again.",
      );
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const activationEvidence = {
      approved_payee_generation_id: value.generation.id,
      payee_id: value.identity.payee_id,
      identity_controller: value.identity.controller_address,
      identity_epoch: value.identity.identity_epoch,
      organization_wallet_address: message.organization.toLowerCase(),
      relationship_registry_address: observed.registry.toLowerCase(),
      relationship_token_id: observed.tokenId.toString(),
      resolver_proxy_address: observed.resolver.toLowerCase(),
      resolver_implementation_address: observed.implementation.toLowerCase(),
      resolver_implementation_code_hash: observed.implementationCodeHash,
      resolver_permission_profile_hash: observed.resolverProfile,
      registry_permission_profile_hash: observed.registryProfile,
      security_root_commitment: observed.profile,
      acceptance_chain_id: 11155111,
      acceptance_verifying_contract: config.activation.address.toLowerCase(),
      acceptance_message_hash: acceptanceMessageHash(
        config.activation.address,
        message,
      ),
      acceptance_nonce: message.nonce.toString(),
      accepted_relationship_expiry: new Date(Number(message.expiry) * 1000),
      recipient_acceptance_signature: operation.acceptance_signature,
      activation_transaction_hash: hash,
      activation_block_number: receipt.blockNumber.toString(),
      activation_log_index: activationLog.logIndex,
      activated_at: new Date(Number(block.timestamp) * 1000),
    };
    if (
      value.root &&
      (value.root.approved_payee_generation_id !== value.generation.id ||
        value.root.security_root_commitment !== observed.profile ||
        value.root.activation_transaction_hash !== hash ||
        value.root.acceptance_verifying_contract !==
          config.activation.address.toLowerCase() ||
        value.root.acceptance_nonce !== message.nonce.toString())
    ) {
      throw new DomainError(
        "CONFLICT",
        "This relationship needs a new approval before it can be used.",
      );
    }
    const root =
      value.root ??
      (await persistence.relationships.acceptRoot(
        value.organization.id,
        attestActivation(activationEvidence),
      ));
    await persistence.approvedPayees.addEvent({
      operation_id: operation.id,
      approved_payee_id: value.relationship.id,
      generation_id: value.generation.id,
      event_type: "ACCEPTANCE_ACTIVATED",
      actor_user_id: actorUserId,
      occurred_at: new Date(Number(block.timestamp) * 1000),
      evidence: {
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        rootId: root.id.toString(),
      },
      transaction_hash: hash,
      log_index: activationLog.logIndex,
    });
    await persistence.approvedPayees.updateOperation(operation.id, {
      status: "CONFIRMED",
      step: "COMPLETE",
      transaction_hashes: [hash],
      last_error_code: null,
    });
    await createReceivingService(persistence, value.identity, async () => ({
      commitment: observed.profile,
      active: true,
    })).reconcileInitialAfterActivation(value.relationship.id);
    return operationDto(
      await persistence.approvedPayees.readOperation(operation.id),
    );
  }

  return {
    list,
    resolve,
    setup,
    detail,
    prepareProposal,
    prepareRevoke,
    prepareAccept,
    authorize,
    reconcile,
  };
}
