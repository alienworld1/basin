import "server-only";

import { attestInitialIdentity, type createPersistence } from "@basin/db";
import { DomainError } from "@basin/domain";
import {
  createEnsAdapter,
  EnsProtocolError,
  normalizeBasinLabel,
  type VerifiedIdentityState,
} from "@basin/ens";

import { getEnsServerEnvironment } from "../config/environment";
import { networkConfig } from "../config/network";
import type {
  ActiveIdentityDto,
  IdentityStatusDto,
} from "../../shared/identity-types";

type Persistence = ReturnType<typeof createPersistence>;
type Address = `0x${string}`;
type Hash = `0x${string}`;

export function createConfiguredEnsAdapter() {
  try {
    return createEnsAdapter(getEnsServerEnvironment());
  } catch {
    throw new EnsProtocolError(
      "CONFIGURATION",
      "Basin identity setup is unavailable right now.",
    );
  }
}

function toActiveIdentityDto(
  state: VerifiedIdentityState,
  evidenceTransactionHash?: string | null,
): ActiveIdentityDto {
  return {
    status: "ACTIVE",
    name: state.name,
    label: state.label,
    payeeId: state.payeeId,
    identityEpoch: state.identityEpoch,
    technical: {
      networkName: networkConfig.networkName,
      chainId: networkConfig.chainId,
      name: state.name,
      controllerAddress: state.controllerAddress,
      registryAddress: state.registryAddress,
      resolverAddress: state.resolverAddress,
      resolverImplementationAddress: state.resolverImplementationAddress,
      recordVersion: state.recordVersion,
      identityEpoch: state.identityEpoch,
      ...(state.transactionHash || evidenceTransactionHash
        ? {
            transactionHash:
              state.transactionHash ?? evidenceTransactionHash ?? undefined,
          }
        : {}),
      blockNumber: state.blockNumber,
      checkedAt: state.verifiedAt,
      transferDisabled: true,
      controllerCanSetIdentityRecord: true,
      bootstrapAuthorityRemoved: true,
      permissionProfileHash: state.permissionProfile.hash,
    },
  };
}

export async function finalizeVerifiedIdentity(
  persistence: Persistence,
  workspaceId: bigint,
  state: VerifiedIdentityState,
) {
  const evidence = attestInitialIdentity({
    identity: {
      workspace_id: workspaceId,
      payee_id: state.payeeId,
      label: state.label,
      ens_name: state.name,
      identity_epoch: state.identityEpoch,
      controller_address: state.controllerAddress,
      resolver_address: state.resolverAddress,
      protocol_status: "ACTIVE",
    },
    authority: {
      identity_epoch: state.identityEpoch,
      controller_address: state.controllerAddress,
      identity_resolver_address: state.resolverAddress,
      valid_from: state.blockTimestamp,
      superseded_at: null,
      evidence_transaction_hash: state.transactionHash ?? null,
      evidence_block_number: state.blockNumber,
    },
  });
  try {
    const saved = await persistence.identities.finalizeInitial(
      workspaceId,
      evidence,
    );
    return toActiveIdentityDto(
      state,
      saved.authority.evidence_transaction_hash,
    );
  } catch (error) {
    if (error instanceof DomainError && error.code !== "UNAVAILABLE") {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "This identity needs review before Basin can use it.",
      );
    }
    throw new EnsProtocolError(
      "PERSISTENCE",
      "Your identity is onchain, but Basin couldn't finish setup. Check again.",
    );
  }
}

export async function readVerifiedIdentity(
  persistence: Persistence,
  workspaceId: bigint,
  expectedController: Address,
) {
  const existing = await persistence.identities.findByWorkspace(workspaceId);
  if (!existing) return null;
  const authority =
    await persistence.identities.findCurrentAuthority(workspaceId);
  const state = await createConfiguredEnsAdapter().verifyIdentity(
    existing.ens_name,
    expectedController,
  );
  if (
    state.payeeId !== existing.payee_id ||
    state.resolverAddress.toLowerCase() !== existing.resolver_address ||
    state.identityEpoch !== existing.identity_epoch
  ) {
    throw new EnsProtocolError(
      "NEEDS_REVIEW",
      "This identity needs review before Basin can use it.",
    );
  }
  return toActiveIdentityDto(state, authority?.evidence_transaction_hash);
}

export async function claimIdentity(
  persistence: Persistence,
  workspaceId: bigint,
  rawLabel: string,
  expectedController: Address,
) {
  const identity = normalizeBasinLabel(rawLabel);
  const existing = await persistence.identities.findByWorkspace(workspaceId);
  if (existing) {
    if (existing.ens_name !== identity.name) {
      throw new EnsProtocolError(
        "COLLISION",
        "This workspace already has a Basin identity.",
      );
    }
    return readVerifiedIdentity(persistence, workspaceId, expectedController);
  }
  const adapter = createConfiguredEnsAdapter();
  const result = await adapter.submitRegistration(
    identity.label,
    expectedController,
  );
  if ("profileValid" in result) {
    return finalizeVerifiedIdentity(persistence, workspaceId, result);
  }
  return { status: "SUBMITTED" as const, ...result };
}

export async function reconcileIdentity(
  persistence: Persistence,
  workspaceId: bigint,
  name: string,
  expectedController: Address,
  transactionHash?: Hash,
): Promise<IdentityStatusDto> {
  const identity = normalizeBasinLabel(
    name.endsWith(".basin.eth") ? name.slice(0, -10) : name,
  );
  if (identity.name !== name) {
    throw new EnsProtocolError(
      "NEEDS_REVIEW",
      "This identity needs review before Basin can use it.",
    );
  }
  const existing = await persistence.identities.findByWorkspace(workspaceId);
  if (existing && existing.ens_name !== name) {
    throw new EnsProtocolError(
      "COLLISION",
      "This workspace already has a different Basin identity.",
    );
  }
  if (!existing && !transactionHash) {
    const availability = await createConfiguredEnsAdapter().availability(
      identity.label,
      expectedController,
    );
    if (availability.status === "AVAILABLE") {
      return {
        status: "FAILED",
        name,
        message: "We couldn't claim that identity. Try again.",
      };
    }
    if (availability.status === "UNAVAILABLE") {
      return {
        status: "COLLISION",
        name,
        message:
          "That identity was claimed before your request completed. Choose another.",
      };
    }
  }
  try {
    const state = await createConfiguredEnsAdapter().verifyIdentity(
      name,
      expectedController,
      transactionHash,
    );
    if (existing) {
      return (await readVerifiedIdentity(
        persistence,
        workspaceId,
        expectedController,
      ))!;
    }
    return await finalizeVerifiedIdentity(persistence, workspaceId, state);
  } catch (error) {
    if (!(error instanceof EnsProtocolError)) throw error;
    if (error.code === "PENDING") {
      return {
        status: "PENDING",
        name,
        message:
          "Your request may still be processing. Check again before retrying.",
      };
    }
    if (error.code === "TRANSACTION_REVERTED") {
      const availability = await createConfiguredEnsAdapter().availability(
        identity.label,
        expectedController,
      );
      if (availability.status === "AVAILABLE") {
        return {
          status: "FAILED",
          name,
          message: "We couldn't claim that identity. Try again.",
        };
      }
    }
    if (error.code === "COLLISION") {
      return {
        status: "COLLISION",
        name,
        message:
          "That identity was claimed before your request completed. Choose another.",
      };
    }
    if (error.code === "NEEDS_REVIEW") {
      return {
        status: "NEEDS_REVIEW",
        name,
        message: "This identity needs review before Basin can use it.",
      };
    }
    throw error;
  }
}
