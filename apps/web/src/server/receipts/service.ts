import "server-only";

import { basinRouterAbi } from "@basin/contracts";
import { formatUsdcBaseUnits } from "@basin/domain";
import { parseEventLogs } from "viem";
import type { createPersistence } from "@basin/db";
import type {
  ReceiptDetailDto,
  ReceiptVerificationDto,
} from "../../shared/receipt-types";
import { basinRouterManifest } from "../config/basin-router-manifest";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;
type ReceiptRow = NonNullable<
  Awaited<ReturnType<Persistence["activity"]["receiptForOrganization"]>>
>;

function notFound() {
  const error = new Error("We couldn't find that receipt.");
  error.name = "ReceiptNotFound";
  return error;
}

export async function readReceipt(
  persistence: Persistence,
  access: Access,
  receiptId: bigint,
): Promise<ReceiptRow> {
  const row =
    access.workspace.type === "ORGANIZATION"
      ? access.organizationId
        ? await persistence.activity.receiptForOrganization(
            access.organizationId,
            receiptId,
          )
        : undefined
      : await persistence.activity.receiptForRecipient(
          access.workspace.id,
          receiptId,
        );
  if (!row) throw notFound();
  return row;
}

export function receiptDto(row: ReceiptRow): ReceiptDetailDto {
  const { receipt, payment, snapshot, payee } = row;
  return {
    id: receipt.id.toString(),
    paymentId: payment.id.toString(),
    payerOrganizationName: receipt.payer_organization_name,
    payeeName: receipt.payee_display_name,
    payeeIdentity: snapshot.global_payee_name || payee.ens_name,
    amount: formatUsdcBaseUnits(receipt.amount_base_units),
    amountBaseUnits: receipt.amount_base_units,
    assetSymbol: "USDC",
    purpose: receipt.purpose,
    reference: receipt.external_reference ?? undefined,
    settledAt: receipt.settled_at.toISOString(),
    relationshipName: snapshot.relationship_name,
    relationshipTokenId: snapshot.relationship_token_id,
    relationshipExpiry: snapshot.relationship_expiry.toISOString(),
    relationshipStatusAtPayment: "ACTIVE",
    settlementEpoch: snapshot.settlement_epoch,
    verification: { status: "CHECKING", summary: "Checking receipt evidence…" },
    technical: {
      transactionHash: receipt.transaction_hash,
      routerAddress: receipt.router_address,
      routerVersion: receipt.router_version,
      paymentId: payment.payment_id,
      obligationId: receipt.obligation_protocol_id,
      settlementCommitment: snapshot.settlement_commitment,
      securityRootCommitment: snapshot.security_root_commitment,
      relationshipRegistry: snapshot.relationship_registry_address,
      resolverProxy: snapshot.resolver_proxy_address,
      resolverImplementation: snapshot.resolver_implementation_address,
      identityEpoch: snapshot.identity_epoch,
      executionPath:
        snapshot.execution_path === "ROUTINE_SIGNER"
          ? "Privy routine signer"
          : "Privy intent",
    },
  };
}

export async function verifyReceipt(
  row: ReceiptRow,
): Promise<ReceiptVerificationDto> {
  const checkedAt = new Date().toISOString();
  if (
    !basinRouterManifest ||
    row.receipt.router_version !== basinRouterManifest.version ||
    row.receipt.router_address.toLowerCase() !==
      basinRouterManifest.address.toLowerCase() ||
    row.receipt.asset_address.toLowerCase() !==
      basinRouterManifest.assetAddress.toLowerCase()
  ) {
    return {
      status: "UNSUPPORTED",
      checkedAt,
      network: "Ethereum Sepolia",
      summary: "This receipt uses a Router version this app can't verify yet.",
    };
  }
  try {
    const { getEnsServerEnvironment } = await import("../config/environment");
    const { createPublicClient, http } = await import("viem");
    const { sepolia } = await import("viem/chains");
    const client = createPublicClient({
      chain: sepolia,
      transport: http(getEnsServerEnvironment().rpcUrl, {
        timeout: 8_000,
        retryCount: 1,
      }),
    });
    const [network, transaction, latest, transactionRequest] =
      await Promise.all([
        client.getChainId(),
        client.getTransactionReceipt({
          hash: row.receipt.transaction_hash as `0x${string}`,
        }),
        client.getBlockNumber(),
        client.getTransaction({
          hash: row.receipt.transaction_hash as `0x${string}`,
        }),
      ]);
    if (
      network !== 11155111 ||
      transaction.status !== "success" ||
      transactionRequest.to?.toLowerCase() !==
        row.receipt.router_address.toLowerCase()
    ) {
      return {
        status: "MISMATCH",
        checkedAt,
        network: "Ethereum Sepolia",
        summary: "The available network evidence does not match this receipt.",
        mismatches: ["ROUTER"],
      };
    }
    const block = await client.getBlock({
      blockNumber: transaction.blockNumber,
    });
    if (block.hash !== transaction.blockHash) {
      return {
        status: "MISMATCH",
        checkedAt,
        network: "Ethereum Sepolia",
        summary: "The available network evidence does not match this receipt.",
        mismatches: ["TRANSACTION_STATUS"],
      };
    }
    const events = parseEventLogs({
      abi: basinRouterAbi,
      logs: transaction.logs,
      eventName: "ObligationExecuted",
      strict: true,
    }).filter(
      (event) =>
        event.address.toLowerCase() ===
          row.receipt.router_address.toLowerCase() &&
        event.args.paymentId === row.payment.payment_id,
    );
    if (events.length !== 1)
      return {
        status: "MISMATCH",
        checkedAt,
        network: "Ethereum Sepolia",
        summary: "The available network evidence does not match this receipt.",
        mismatches: ["PAYMENT_ID"],
      };
    const event = events[0].args;
    const mismatch: string[] = [];
    if (event.obligationId !== row.snapshot.obligation_protocol_id)
      mismatch.push("OBLIGATION");
    if (
      event.organization?.toLowerCase() !==
      row.snapshot.organization_wallet_address.toLowerCase()
    )
      mismatch.push("ORGANIZATION");
    if (
      event.relationshipNamehash !== row.generation.relationship_namehash ||
      event.relationshipTokenId !== BigInt(row.snapshot.relationship_token_id)
    )
      mismatch.push("RELATIONSHIP_GENERATION");
    if (event.payeeId !== row.snapshot.payee_id) mismatch.push("PAYEE");
    if (
      event.settlementEpoch !== BigInt(row.snapshot.settlement_epoch) ||
      event.settlementCommitment !== row.snapshot.settlement_commitment
    )
      mismatch.push("SETTLEMENT_COMMITMENT");
    if (event.amount !== BigInt(row.receipt.amount_base_units))
      mismatch.push("AMOUNT");
    if (event.asset?.toLowerCase() !== row.receipt.asset_address.toLowerCase())
      mismatch.push("ASSET");
    if (event.metadataHash !== row.receipt.obligation_metadata_hash)
      mismatch.push("OBLIGATION");
    if (mismatch.length)
      return {
        status: "MISMATCH",
        checkedAt,
        network: "Ethereum Sepolia",
        summary: "The available network evidence does not match this receipt.",
        mismatches: [...new Set(mismatch)],
      };
    return {
      status: "VERIFIED",
      checkedAt,
      network: "Ethereum Sepolia",
      confirmations: (latest - transaction.blockNumber + 1n).toString(),
      blockNumber: transaction.blockNumber.toString(),
      blockHash: transaction.blockHash,
      eventName: "ObligationExecuted",
      summary:
        "Verified against the Basin Router transaction on Ethereum Sepolia.",
    };
  } catch {
    return {
      status: "EVIDENCE_UNAVAILABLE",
      checkedAt,
      network: "Ethereum Sepolia",
      summary:
        "The receipt is still available. Check the network evidence again.",
    };
  }
}
