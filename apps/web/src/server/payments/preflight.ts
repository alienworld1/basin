import "server-only";

import { basinRouterActivationAbi, basinRouterAbi } from "@basin/contracts";
import type { createPersistence } from "@basin/db";
import { createRelationshipReader, SettlementError } from "@basin/ens";
import { createPublicClient, getAddress, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

import type { PaymentProblemCode } from "../../shared/payment-types";
import { approvedPayeeConfiguration } from "../approved-payees/config";
import { verifiedBasinRouter } from "../config/verified-basin-router";

type Persistence = ReturnType<typeof createPersistence>;
type Context = Awaited<ReturnType<Persistence["paymentExecutions"]["context"]>>;
type Settlement = Context["settlement"];

const usdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type PaymentPreflightResult =
  | {
      status: "READY" | "SETTLEMENT_UPDATED";
      context: Context;
      settlement: Settlement;
      router: Awaited<ReturnType<typeof verifiedBasinRouter>>;
      observedBlock: bigint;
    }
  | {
      status: Exclude<
        PaymentProblemCode,
        "SETTLEMENT_UPDATED" | "PAYMENT_UNCONFIRMED" | "PAYMENT_FAILED"
      >;
      message: string;
    };

export function paymentProblemMessage(code: PaymentProblemCode) {
  return {
    SETTLEMENT_UPDATED:
      "The payee updated their receiving details. Review the latest payment before continuing.",
    SETTLEMENT_UNAVAILABLE:
      "The payee's latest receiving details still need to sync before this payment can continue.",
    REAPPROVAL_REQUIRED:
      "This payee's security authority changed. An administrator needs to review the approval.",
    RELATIONSHIP_INACTIVE: "This payee is no longer approved for payment.",
    OBLIGATION_UNAVAILABLE:
      "This payment authorization is no longer available.",
    TREASURY_BLOCKED:
      "Your organization's payment controls blocked this payment.",
    INSUFFICIENT_FUNDS:
      "Your organization doesn't have enough available USDC for this payment.",
    AUTHORITY_UNAVAILABLE:
      "We couldn't verify this payment right now. Check again before continuing.",
    PAYMENT_UNCONFIRMED:
      "We couldn't confirm the payment yet. Check its status before trying again.",
    PAYMENT_FAILED:
      "No funds moved. Review the payment before trying again. No receipt was created.",
  }[code];
}

const blocked = (
  status: Exclude<
    PaymentProblemCode,
    "SETTLEMENT_UPDATED" | "PAYMENT_UNCONFIRMED" | "PAYMENT_FAILED"
  >,
): PaymentPreflightResult => ({
  status,
  message: paymentProblemMessage(status),
});

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

export async function paymentPreflight(
  persistence: Persistence,
  organizationId: bigint,
  expectedPaymentId: bigint,
): Promise<PaymentPreflightResult> {
  let context: Context;
  try {
    context = await persistence.paymentExecutions.context(
      organizationId,
      expectedPaymentId,
    );
  } catch {
    return blocked("OBLIGATION_UNAVAILABLE");
  }
  const now = new Date();
  if (
    context.relationship.status !== "ACTIVE" ||
    context.relationship.revoked_at ||
    (context.relationship.expires_at &&
      context.relationship.expires_at <= now) ||
    context.generation.ended_at ||
    context.generation.expires_at <= now
  ) {
    return blocked("RELATIONSHIP_INACTIVE");
  }
  if (
    !context.expected.obligation_record_id ||
    !context.treasury?.wallet_address ||
    !context.treasury.privy_wallet_id ||
    context.treasury.status !== "READY"
  ) {
    return blocked("TREASURY_BLOCKED");
  }

  try {
    const config = approvedPayeeConfiguration();
    const router = await verifiedBasinRouter();
    if (!config.activation) return blocked("AUTHORITY_UNAVAILABLE");
    const observed = await createRelationshipReader(config.ens).observe({
      name: context.relationship.relationship_name!,
      identityName: context.identity.ens_name,
      controller: getAddress(context.identity.controller_address),
      identityEpoch: BigInt(context.identity.identity_epoch),
      tokenId: BigInt(context.generation.relationship_token_id),
      registry: getAddress(context.generation.relationship_registry_address),
    });
    if (
      observed.tokenId !== BigInt(context.generation.relationship_token_id) ||
      observed.profile !== context.root.security_root_commitment ||
      !sameAddress(observed.resolver, context.root.resolver_proxy_address) ||
      !sameAddress(
        observed.implementation,
        context.root.resolver_implementation_address,
      ) ||
      observed.implementationCodeHash !==
        context.root.resolver_implementation_code_hash ||
      observed.resolverProfile !==
        context.root.resolver_permission_profile_hash ||
      observed.registryProfile !== context.root.registry_permission_profile_hash
    ) {
      return blocked("REAPPROVAL_REQUIRED");
    }

    const client = createPublicClient({
      chain: sepolia,
      transport: http(config.ens.rpcUrl, { timeout: 8_000, retryCount: 1 }),
    });
    const obligation = await persistence.obligations.read(
      organizationId,
      context.expected.obligation_record_id,
    );
    const [block, accepted, onchain, balance, allowance] = await Promise.all([
      client.getBlock({ blockNumber: observed.blockNumber }),
      client.readContract({
        address: config.activation.address,
        abi: basinRouterActivationAbi,
        functionName: "acceptedRoot",
        args: [
          getAddress(context.root.organization_wallet_address),
          context.generation.relationship_namehash as Hex,
          BigInt(context.generation.relationship_token_id),
        ],
        blockNumber: observed.blockNumber,
      }),
      client.readContract({
        address: router.address,
        abi: basinRouterAbi,
        functionName: "getObligation",
        args: [obligation.obligation_id as Hex],
        blockNumber: observed.blockNumber,
      }),
      client.readContract({
        address: router.asset,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [getAddress(context.treasury.wallet_address)],
        blockNumber: observed.blockNumber,
      }),
      client.readContract({
        address: router.asset,
        abi: usdcAbi,
        functionName: "allowance",
        args: [getAddress(context.treasury.wallet_address), router.address],
        blockNumber: observed.blockNumber,
      }),
    ]);
    if (
      accepted[0] !== context.root.security_root_commitment ||
      accepted[1] !== context.root.payee_id ||
      accepted[2] !==
        BigInt(
          Math.floor(
            context.root.accepted_relationship_expiry.getTime() / 1000,
          ),
        ) ||
      accepted[3] !== BigInt(context.root.acceptance_nonce)
    ) {
      return blocked("REAPPROVAL_REQUIRED");
    }
    if (
      !onchain.exists ||
      onchain.cancelled ||
      onchain.validUntil <= block.timestamp ||
      onchain.remainingAmount < BigInt(context.expected.amount_base_units) ||
      !sameAddress(onchain.organization, context.treasury.wallet_address) ||
      onchain.relationshipNamehash !==
        context.generation.relationship_namehash ||
      onchain.relationshipTokenId !==
        BigInt(context.generation.relationship_token_id) ||
      onchain.payeeId !== context.root.payee_id ||
      onchain.securityRootCommitment !==
        context.root.security_root_commitment ||
      !sameAddress(onchain.recipient, context.root.identity_controller) ||
      onchain.metadataHash !== obligation.metadata_hash ||
      !sameAddress(context.expected.asset_address, router.asset)
    ) {
      return blocked("OBLIGATION_UNAVAILABLE");
    }
    if (balance < BigInt(context.expected.amount_base_units)) {
      return blocked("INSUFFICIENT_FUNDS");
    }
    if (allowance < BigInt(context.expected.amount_base_units)) {
      return blocked("TREASURY_BLOCKED");
    }
    if (!observed.decoded) return blocked("SETTLEMENT_UNAVAILABLE");
    const settlement =
      await persistence.paymentExecutions.settlementByCommitment({
        generation_id: context.generation.id,
        settlement_epoch: observed.decoded.settlementEpoch.toString(),
        commitment: observed.decoded.commitment,
      });
    if (
      !settlement?.destination_ciphertext ||
      settlement.approved_security_root_id !== context.root.id ||
      settlement.chain_id !== 11_155_111 ||
      !sameAddress(settlement.asset_address, router.asset)
    ) {
      return blocked("SETTLEMENT_UNAVAILABLE");
    }
    return {
      status:
        settlement.id === context.settlement.id
          ? "READY"
          : "SETTLEMENT_UPDATED",
      context,
      settlement,
      router,
      observedBlock: observed.blockNumber,
    };
  } catch (error) {
    if (error instanceof SettlementError) {
      if (error.code === "RELATIONSHIP_INACTIVE")
        return blocked("RELATIONSHIP_INACTIVE");
      if (error.code === "REAPPROVAL_REQUIRED")
        return blocked("REAPPROVAL_REQUIRED");
    }
    return blocked("AUTHORITY_UNAVAILABLE");
  }
}
