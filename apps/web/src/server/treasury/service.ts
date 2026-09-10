import "server-only";
import { createHash } from "node:crypto";
import type { createPersistence } from "@basin/db";
import type { Organization, OrganizationTreasury } from "@basin/db/schema";
import { address } from "@basin/domain";
import type { TreasuryStatusResponse } from "../../shared/treasury-types";
import {
  createPrivyTreasuryAdapter,
  TreasuryProviderError,
  type PrivyTreasuryAdapter,
  type WalletEvidence,
} from "./adapter";
import {
  configuredRoutineLimit,
  treasuryConfiguration,
  treasuryRouterConfigured,
} from "./config";
import { generateRoutineKey } from "./protection";
import {
  buildRoutinePolicy,
  observedPolicyFingerprint,
  policyFingerprint,
} from "./policy";
import { readTreasuryBalance, type TreasuryBalance } from "./balance";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;

const digest = (value: unknown) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

function validateWallet(
  wallet: WalletEvidence,
  organization: Organization,
  ownerId: string,
  routineSignerId: string,
  routinePolicyId?: string,
) {
  if (
    wallet.chainType !== "ethereum" ||
    wallet.ownerId !== ownerId ||
    wallet.entityId !== organization.privy_organization_id ||
    wallet.policyIds.length !== 0 ||
    wallet.additionalSigners.length !== 1 ||
    wallet.additionalSigners[0].signerId !== routineSignerId ||
    (routinePolicyId
      ? wallet.additionalSigners[0].policyIds.length !== 1 ||
        wallet.additionalSigners[0].policyIds[0] !== routinePolicyId
      : wallet.additionalSigners[0].policyIds.length !== 0)
  ) {
    throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
  }
  return address.parse(wallet.address);
}

function response(
  access: Access,
  organization: Organization,
  treasury: OrganizationTreasury | null,
  operation: Awaited<ReturnType<Persistence["treasury"]["latestOperation"]>>,
  balance?: TreasuryBalance,
): TreasuryStatusResponse {
  const status = treasury?.status ?? "NOT_STARTED";
  return {
    summary: {
      workspaceId: access.workspace.id.toString(),
      organizationName: access.workspace.display_name,
      role: access.memberRole as "ADMIN" | "PAYMENT_OPERATOR",
      status,
      network: "Ethereum Sepolia",
      routerConfigured: treasuryRouterConfigured(),
      ...((treasury?.routine_per_tx_limit_base_units ??
      configuredRoutineLimit())
        ? {
            routineLimit:
              treasury?.routine_per_tx_limit_base_units ??
              configuredRoutineLimit(),
          }
        : {}),
      ...(treasury?.last_verified_at
        ? { lastVerifiedAt: treasury.last_verified_at.toISOString() }
        : {}),
      ...(treasury?.last_error_code
        ? { errorCode: treasury.last_error_code }
        : {}),
      ...(treasury?.wallet_address
        ? {
            account: {
              address: treasury.wallet_address,
              ...(balance
                ? {
                    ethBalanceWei: balance.ethBalanceWei,
                    balanceCheckedAt: balance.checkedAt.toISOString(),
                  }
                : {}),
            },
          }
        : {}),
      ...(operation
        ? {
            operation: {
              id: operation.id.toString(),
              step: operation.step,
              status: operation.status,
              approvalPending: operation.status === "AWAITING_APPROVAL",
            },
          }
        : {}),
    },
    technical: {
      ...(treasury?.wallet_address
        ? { walletAddress: treasury.wallet_address }
        : {}),
      ...(organization.privy_organization_id
        ? { privyOrganizationId: organization.privy_organization_id }
        : {}),
      ...(treasury?.privy_wallet_id
        ? { privyWalletId: treasury.privy_wallet_id }
        : {}),
      ...(treasury?.owner_quorum_id
        ? { ownerQuorumId: treasury.owner_quorum_id }
        : {}),
      ...(treasury?.owner_quorum_threshold
        ? { ownerQuorumThreshold: treasury.owner_quorum_threshold }
        : {}),
      ...(treasury?.routine_signer_id
        ? { routineSignerId: treasury.routine_signer_id }
        : {}),
      ...(treasury?.routine_policy_id
        ? { routinePolicyId: treasury.routine_policy_id }
        : {}),
      ...(treasury?.routine_policy_fingerprint
        ? { routinePolicyFingerprint: treasury.routine_policy_fingerprint }
        : {}),
      ...(treasury?.router_address
        ? { routerAddress: treasury.router_address }
        : {}),
      ...(treasury?.router_version
        ? { routerVersion: treasury.router_version }
        : {}),
      ...(treasury?.routine_per_tx_limit_base_units
        ? { routineLimit: treasury.routine_per_tx_limit_base_units }
        : {}),
      ...(treasury?.last_verified_at
        ? { lastVerifiedAt: treasury.last_verified_at.toISOString() }
        : {}),
    },
  };
}

export function createTreasuryService(
  persistence: Persistence,
  access: Access,
  privyUserId: string,
  providedAdapter?: PrivyTreasuryAdapter,
) {
  if (
    !access.organizationId ||
    !access.memberRole ||
    access.workspace.type !== "ORGANIZATION"
  )
    throw new Error("Organization access required");
  const organizationId = access.organizationId;
  const adapter = () => providedAdapter ?? createPrivyTreasuryAdapter();

  async function state() {
    const [context, operation] = await Promise.all([
      persistence.treasury.byWorkspace(access.workspace.id),
      persistence.treasury.latestOperation(organizationId),
    ]);
    const balance = context.treasury?.wallet_address
      ? await readTreasuryBalance(context.treasury.wallet_address)
      : undefined;
    return response(
      access,
      context.organization,
      context.treasury,
      operation,
      balance,
    );
  }

  async function reconcile() {
    const context = await persistence.treasury.byWorkspace(access.workspace.id);
    const treasury = context.treasury;
    if (!treasury || !context.organization.privy_organization_id)
      return state();
    if (
      !treasury.owner_quorum_id ||
      !treasury.routine_signer_id ||
      !treasury.privy_wallet_id
    )
      return state();
    try {
      const [org, owner, signer, wallet] = await Promise.all([
        adapter().getOrganization(context.organization.privy_organization_id),
        adapter().getQuorum(treasury.owner_quorum_id),
        adapter().getQuorum(treasury.routine_signer_id),
        adapter().getWallet(treasury.privy_wallet_id),
      ]);
      const adminPrivyUserIds =
        await persistence.treasury.adminPrivyUserIds(organizationId);
      const secret = await persistence.treasury.signerSecret(organizationId);
      if (
        org.defaultQuorumId !== owner.id ||
        owner.threshold !== 1 ||
        owner.userIds.length !== 1 ||
        !adminPrivyUserIds.includes(owner.userIds[0]) ||
        signer.threshold !== 1 ||
        !secret ||
        signer.publicKeys.length !== 1 ||
        signer.publicKeys[0] !== secret.public_key
      )
        throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
      let expectedPolicyFingerprint: string | undefined;
      if (treasury.routine_policy_id) {
        const policy = await adapter().getPolicy(
          treasury.routine_policy_id,
          observedPolicyFingerprint,
        );
        if (
          !treasury.routine_policy_fingerprint ||
          policy.ownerId !== owner.id ||
          policy.fingerprint !== treasury.routine_policy_fingerprint
        )
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
        expectedPolicyFingerprint = policy.fingerprint;
      }
      const walletAddress = validateWallet(
        wallet,
        context.organization,
        owner.id,
        signer.id,
        treasury.routine_policy_id ?? undefined,
      );
      await persistence.treasury.saveTreasury({
        organization_id: organizationId,
        status: expectedPolicyFingerprint ? "READY" : "CONTROL_READY",
        wallet_address: walletAddress,
        chain_type: "ethereum",
        owner_quorum_threshold: 1,
        last_verified_at: new Date(),
        last_error_code: null,
      });
    } catch (error) {
      const code =
        error instanceof TreasuryProviderError
          ? error.code
          : "UNKNOWN_EXTERNAL_STATE";
      await persistence.treasury.saveTreasury({
        organization_id: organizationId,
        status:
          code === "PRIVY_UNAVAILABLE" || code === "RATE_LIMITED"
            ? treasury.status
            : "NEEDS_ATTENTION",
        last_error_code: code,
      });
    }
    return state();
  }

  async function setup(idempotencyKey: string) {
    const config = treasuryConfiguration();
    const requestFingerprint = digest({
      organizationId: organizationId.toString(),
      chainId: config.chainId,
      router: config.router,
    });
    const operation = await persistence.treasury.operation(
      organizationId,
      "PROVISION_TREASURY",
      idempotencyKey,
      requestFingerprint,
    );
    if (operation.status === "COMPLETED") return reconcile();
    if (operation.status === "AWAITING_APPROVAL" && operation.privy_intent_id) {
      const intent = await adapter().getIntent(operation.privy_intent_id);
      if (intent.status === "pending") return state();
      if (intent.status !== "executed") {
        await persistence.treasury.updateOperation(operation.id, {
          status: "FAILED_FINAL",
          safe_error_code:
            intent.status === "expired" ? "INTENT_EXPIRED" : "INTENT_REJECTED",
        });
        await persistence.treasury.saveTreasury({
          organization_id: organizationId,
          status: "FAILED",
          last_error_code:
            intent.status === "expired" ? "INTENT_EXPIRED" : "INTENT_REJECTED",
        });
        return state();
      }
      await persistence.treasury.updateOperation(operation.id, {
        status: "IN_PROGRESS",
        privy_intent_id: null,
      });
    }
    const providerKey = operation.idempotency_key;
    const context = await persistence.treasury.byWorkspace(access.workspace.id);
    let treasury = context.treasury;
    await persistence.treasury.saveTreasury({
      organization_id: organizationId,
      status: "PROVISIONING",
    });
    try {
      let ownerId = treasury?.owner_quorum_id;
      if (ownerId) {
        const owner = await adapter().getQuorum(ownerId);
        if (
          owner.threshold !== 1 ||
          owner.userIds.length !== 1 ||
          owner.userIds[0] !== privyUserId
        )
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
      } else {
        const owner = await adapter().createOwnerQuorum({
          userId: privyUserId,
          name: `${access.workspace.display_name} treasury administrators`,
          idempotencyKey: `${providerKey}-owner`,
        });
        const verified = await adapter().getQuorum(owner.id);
        if (
          verified.threshold !== 1 ||
          verified.userIds.length !== 1 ||
          verified.userIds[0] !== privyUserId
        )
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
        ownerId = verified.id;
        treasury = await persistence.treasury.saveTreasury({
          organization_id: organizationId,
          status: "PROVISIONING",
          owner_quorum_id: ownerId,
          owner_quorum_threshold: 1,
        });
        await persistence.treasury.updateOperation(operation.id, {
          step: "OWNER_QUORUM_VERIFIED",
        });
      }

      let privyOrganizationId = context.organization.privy_organization_id;
      if (privyOrganizationId) {
        const org = await adapter().getOrganization(privyOrganizationId);
        if (org.defaultQuorumId !== ownerId)
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
      } else {
        const org = await adapter().createOrganization({
          quorumId: ownerId,
          name: access.workspace.display_name,
          idempotencyKey: `${providerKey}-organization`,
        });
        const verified = await adapter().getOrganization(org.id);
        if (verified.defaultQuorumId !== ownerId)
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
        await persistence.treasury.saveOrganizationMapping(
          organizationId,
          verified.id,
        );
        privyOrganizationId = verified.id;
        await persistence.treasury.updateOperation(operation.id, {
          step: "ORGANIZATION_VERIFIED",
        });
      }

      let signerId = treasury?.routine_signer_id;
      let signerSecret =
        await persistence.treasury.signerSecret(organizationId);
      if (!signerSecret) {
        if (signerId) throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
        const sealed = generateRoutineKey(organizationId, config.signerSecret);
        signerSecret = await persistence.treasury.saveSignerSecret({
          organization_id: organizationId,
          public_key: sealed.publicKey,
          public_key_fingerprint: sealed.publicKeyFingerprint,
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          auth_tag: sealed.authTag,
          key_version: sealed.keyVersion,
        });
      }
      if (signerId) {
        const signer = await adapter().getQuorum(signerId);
        if (
          signer.publicKeys.length !== 1 ||
          signer.publicKeys[0] !== signerSecret.public_key
        )
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
      } else {
        const signer = await adapter().createRoutineSigner({
          publicKey: signerSecret.public_key,
          name: `${access.workspace.display_name} routine payments`,
          idempotencyKey: `${providerKey}-routine`,
        });
        const verified = await adapter().getQuorum(signer.id);
        if (
          verified.threshold !== 1 ||
          verified.publicKeys.length !== 1 ||
          verified.publicKeys[0] !== signerSecret.public_key
        )
          throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
        signerId = verified.id;
        treasury = await persistence.treasury.saveTreasury({
          organization_id: organizationId,
          status: "PROVISIONING",
          routine_signer_id: signerId,
        });
        await persistence.treasury.updateOperation(operation.id, {
          step: "ROUTINE_SIGNER_VERIFIED",
        });
      }

      let walletId = treasury?.privy_wallet_id;
      let routinePolicyId = treasury?.routine_policy_id ?? undefined;
      let expectedPolicyFingerprint: string | undefined;
      if (config.router) {
        const definition = buildRoutinePolicy({
          ownerId,
          routerAddress: config.router.address,
          abi: config.router.abi,
          limit: config.router.limit,
        });
        expectedPolicyFingerprint = policyFingerprint(definition);
        if (routinePolicyId) {
          const policy = await adapter().getPolicy(
            routinePolicyId,
            observedPolicyFingerprint,
          );
          if (
            policy.ownerId !== ownerId ||
            policy.fingerprint !== expectedPolicyFingerprint
          )
            throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
        } else {
          const created = await adapter().createPolicy({
            definition,
            idempotencyKey: `${providerKey}-policy`,
          });
          const policy = await adapter().getPolicy(
            created.id,
            observedPolicyFingerprint,
          );
          if (
            policy.ownerId !== ownerId ||
            policy.fingerprint !== expectedPolicyFingerprint
          )
            throw new TreasuryProviderError("CONFIGURATION_MISMATCH");
          routinePolicyId = policy.id;
          treasury = await persistence.treasury.saveTreasury({
            organization_id: organizationId,
            status: "PROVISIONING",
            routine_policy_id: policy.id,
            routine_policy_owner_id: ownerId,
            routine_policy_fingerprint: expectedPolicyFingerprint,
            router_address: config.router.address.toLowerCase(),
            router_version: config.router.version,
            routine_per_tx_limit_base_units: config.router.limit,
          });
          await persistence.treasury.updateOperation(operation.id, {
            step: "POLICY_VERIFIED",
          });
        }
      }
      let wallet: WalletEvidence;
      if (walletId) {
        wallet = await adapter().getWallet(walletId);
      } else {
        wallet = await adapter().createWallet({
          organizationId: privyOrganizationId,
          ownerId,
          routineSignerId: signerId,
          routinePolicyId,
          name: `${access.workspace.display_name} Basin treasury`,
          externalId: `basin_treasury_${organizationId}`,
          idempotencyKey: `${providerKey}-wallet`,
        });
        walletId = wallet.id;
      }
      let verifiedWallet = await adapter().getWallet(walletId);
      if (
        routinePolicyId &&
        verifiedWallet.additionalSigners.length === 1 &&
        verifiedWallet.additionalSigners[0].signerId === signerId &&
        verifiedWallet.additionalSigners[0].policyIds.length === 0
      ) {
        const intent = await adapter().createWalletUpdateIntent({
          walletId,
          routineSignerId: signerId,
          routinePolicyId,
          idempotencyKey: `${providerKey}-attach-policy`,
        });
        if (intent.status !== "executed") {
          await persistence.treasury.updateOperation(operation.id, {
            status: "AWAITING_APPROVAL",
            privy_intent_id: intent.id,
            expires_at: intent.expiresAt,
          });
          await persistence.treasury.saveTreasury({
            organization_id: organizationId,
            status: "AWAITING_APPROVAL",
          });
          return state();
        }
        verifiedWallet = await adapter().getWallet(walletId);
      }
      const walletAddress = validateWallet(
        verifiedWallet,
        { ...context.organization, privy_organization_id: privyOrganizationId },
        ownerId,
        signerId,
        routinePolicyId,
      );
      await persistence.treasury.saveTreasury({
        organization_id: organizationId,
        status: expectedPolicyFingerprint ? "READY" : "CONTROL_READY",
        privy_wallet_id: walletId,
        wallet_address: walletAddress,
        chain_type: "ethereum",
        owner_quorum_id: ownerId,
        owner_quorum_threshold: 1,
        routine_signer_id: signerId,
        ...(routinePolicyId
          ? {
              routine_policy_id: routinePolicyId,
              routine_policy_owner_id: ownerId,
              routine_policy_fingerprint: expectedPolicyFingerprint,
              router_address: config.router!.address.toLowerCase(),
              router_version: config.router!.version,
              routine_per_tx_limit_base_units: config.router!.limit,
            }
          : {}),
        last_verified_at: new Date(),
        last_error_code: null,
      });
      await persistence.treasury.updateOperation(operation.id, {
        step: "COMPLETE",
        status: "COMPLETED",
        safe_error_code: null,
      });
    } catch (error) {
      const code =
        error instanceof TreasuryProviderError
          ? error.code
          : "UNKNOWN_EXTERNAL_STATE";
      await persistence.treasury.saveTreasury({
        organization_id: organizationId,
        status:
          code === "CONFIGURATION_MISMATCH" ? "NEEDS_ATTENTION" : "FAILED",
        last_error_code: code,
      });
      await persistence.treasury.updateOperation(operation.id, {
        status:
          code === "CONFIGURATION_MISMATCH"
            ? "FAILED_FINAL"
            : "FAILED_RETRYABLE",
        safe_error_code: code,
      });
    }
    return state();
  }

  return { state, setup, reconcile };
}
