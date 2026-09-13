import "server-only";

import { createHash } from "node:crypto";
import { basinRouterAbi } from "@basin/contracts";
import {
  attestExecution,
  attestSettlement,
  type createPersistence,
} from "@basin/db";
import { DomainError, formatUsdcBaseUnits } from "@basin/domain";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbiItem,
  parseEventLogs,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";

import {
  paymentProblemCodes,
  type PaymentExecutionDto,
  type PaymentProblemCode,
  type PaymentReviewDto,
} from "../../shared/payment-types";
import { UNKNOWN_PAYMENT_SUBMISSION_GRACE_MS } from "../../shared/payment-reconciliation";
import { getEnsServerEnvironment } from "../config/environment";
import { verifiedBasinRouter } from "../config/verified-basin-router";
import { unseal, versionContext } from "../settlement/protection";
import {
  createPrivyTreasuryAdapter,
  TreasuryProviderError,
} from "../treasury/adapter";
import { treasuryConfiguration } from "../treasury/config";
import {
  encodeRoutineAuthorizationKey,
  unsealRoutineKey,
} from "../treasury/protection";
import { paymentPreflight, paymentProblemMessage } from "./preflight";
import { hasConclusiveNonSubmissionEvidence } from "./reconciliation";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;
type Operation = Awaited<ReturnType<Persistence["paymentExecutions"]["read"]>>;
type Payment = Awaited<ReturnType<Persistence["payments"]["read"]>>;

const reviewSchema = z.strictObject({
  organizationName: z.string().min(1),
  payeeName: z.string().min(1),
  payeeIdentity: z.string().min(1),
  amount: z.string().min(1),
  assetSymbol: z.literal("USDC"),
  purpose: z.string().min(1),
  reference: z.string().optional(),
  settlementEpoch: z.string().regex(/^\d+$/),
  settlementUpdated: z.boolean(),
});
const transferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;
const obligationExecutedEvent = parseAbiItem(
  "event ObligationExecuted(bytes32 indexed paymentId, bytes32 indexed obligationId, address indexed organization, bytes32 relationshipNamehash, uint256 relationshipTokenId, bytes32 payeeId, uint256 settlementEpoch, bytes32 settlementCommitment, address destination, uint256 amount, address asset, bytes32 metadataHash, uint256 remainingAmount)",
);
const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
const problemAction = (code: PaymentProblemCode) =>
  code === "PAYMENT_UNCONFIRMED"
    ? ("CHECK_STATUS" as const)
    : [
          "REAPPROVAL_REQUIRED",
          "RELATIONSHIP_INACTIVE",
          "SETTLEMENT_UNAVAILABLE",
        ].includes(code)
      ? ("OPEN_PAYEE" as const)
      : ["TREASURY_BLOCKED", "INSUFFICIENT_FUNDS"].includes(code)
        ? ("CONTACT_ADMIN" as const)
        : ("REVIEW_AGAIN" as const);

export function paymentExecutionDto(
  operation: Operation,
  receiptId?: string,
): PaymentExecutionDto {
  let review: PaymentReviewDto | undefined;
  try {
    review = reviewSchema.parse(JSON.parse(operation.review_snapshot));
  } catch {
    review = undefined;
  }
  const code = paymentProblemCodes.includes(
    operation.failure_code as PaymentProblemCode,
  )
    ? (operation.failure_code as PaymentProblemCode)
    : operation.status === "UNKNOWN_EXTERNAL_STATE"
      ? "PAYMENT_UNCONFIRMED"
      : operation.status === "FAILED"
        ? "PAYMENT_FAILED"
        : undefined;
  const contextualMessage =
    code === "SETTLEMENT_UPDATED" && review
      ? `${review.payeeName} updated where they receive. Review the payment again.`
      : code === "RELATIONSHIP_INACTIVE" && review
        ? `Payment blocked — ${review.organizationName} no longer approves ${review.payeeName}.`
        : code === "REAPPROVAL_REQUIRED"
          ? "Approval required again — protected identity or relationship authority changed."
          : code
            ? paymentProblemMessage(code)
            : undefined;
  return {
    id: operation.id.toString(),
    status: operation.status,
    ...(operation.validation_step ? { step: operation.validation_step } : {}),
    ...(operation.review_expires_at
      ? { reviewExpiresAt: operation.review_expires_at.toISOString() }
      : {}),
    ...(review ? { review } : {}),
    ...(code
      ? {
          problem: {
            code,
            message: contextualMessage!,
            action: problemAction(code),
          },
        }
      : {}),
    ...(receiptId ? { receiptId } : {}),
  };
}

const reasonFor = (code: PaymentProblemCode) =>
  (
    ({
      SETTLEMENT_UPDATED: "SETTLEMENT_UPDATED",
      SETTLEMENT_UNAVAILABLE: "SETTLEMENT_UNAVAILABLE",
      REAPPROVAL_REQUIRED: "REAPPROVAL_REQUIRED",
      RELATIONSHIP_INACTIVE: "RELATIONSHIP_INACTIVE",
      OBLIGATION_UNAVAILABLE: "OBLIGATION_UNAVAILABLE",
      TREASURY_BLOCKED: "TREASURY_BLOCKED",
      INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
      AUTHORITY_UNAVAILABLE: "AUTHORIZATION_UNAVAILABLE",
      PAYMENT_UNCONFIRMED: "PAYMENT_UNCONFIRMED",
      PAYMENT_FAILED: "PAYMENT_FAILED",
    }) as const
  )[code];

export function createPaymentService(persistence: Persistence, access: Access) {
  if (access.workspace.type !== "ORGANIZATION" || !access.organizationId)
    throw new DomainError("INVALID_INPUT", "We couldn't find that payment.");
  const organizationId = access.organizationId;
  const requireOperator = async () => {
    if (
      access.memberRole !== "PAYMENT_OPERATOR" ||
      !access.memberId ||
      !(await persistence.paymentAccess.activeOperator(
        organizationId,
        access.memberId,
      ))
    )
      throw new DomainError(
        "INVALID_INPUT",
        "A payment operator can complete this payment.",
      );
    return access.memberId;
  };
  async function advancePaymentToReady(payment: Payment) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (payment.status === "READY") return payment;
      if (
        !["DRAFT", "VALIDATING_AUTHORITY", "BLOCKED", "FAILED"].includes(
          payment.status,
        )
      )
        throw new DomainError(
          "CONFLICT",
          "This payment changed. Refresh and review it again.",
        );
      const toStatus =
        payment.status === "VALIDATING_AUTHORITY"
          ? "READY"
          : "VALIDATING_AUTHORITY";
      try {
        payment = await persistence.payments.transition(organizationId, {
          payment_id: payment.id,
          expected_status: payment.status,
          to_status: toStatus,
        });
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "CONFLICT")
          throw error;
        payment = await persistence.payments.read(organizationId, payment.id);
      }
    }
    throw new DomainError(
      "CONFLICT",
      "This payment changed. Refresh and review it again.",
    );
  }
  async function block(
    expectedPaymentId: bigint,
    code: Exclude<
      PaymentProblemCode,
      "SETTLEMENT_UPDATED" | "PAYMENT_UNCONFIRMED" | "PAYMENT_FAILED"
    >,
  ): Promise<never> {
    await persistence.expectedPayments.projectAttention({
      organization_id: organizationId,
      expected_payment_id: expectedPaymentId,
      reason: reasonFor(code),
    });
    const operation = await persistence.paymentExecutions.readMaybe(
      organizationId,
      expectedPaymentId,
    );
    if (operation && !["SUBMITTED", "CONFIRMED"].includes(operation.status))
      await persistence.paymentExecutions.update(operation.id, {
        status: "BLOCKED",
        failure_code: code,
      });
    throw new DomainError("BLOCKED", paymentProblemMessage(code));
  }
  async function prepare(expectedPaymentId: bigint, idempotencyKey: string) {
    const actorMemberId = await requireOperator();
    const existingOperation = await persistence.paymentExecutions.readMaybe(
      organizationId,
      expectedPaymentId,
    );
    if (
      existingOperation &&
      [
        "SUBMITTING",
        "SUBMITTED",
        "UNKNOWN_EXTERNAL_STATE",
        "CONFIRMED",
      ].includes(existingOperation.status)
    ) {
      return { operation: paymentExecutionDto(existingOperation) };
    }
    const result = await paymentPreflight(
      persistence,
      organizationId,
      expectedPaymentId,
    );
    if (result.status !== "READY" && result.status !== "SETTLEMENT_UPDATED")
      return block(expectedPaymentId, result.status);
    const { context, settlement, router } = result;
    if (
      context.expected.status === "ATTENTION" &&
      !context.expected.payment_record_id
    )
      await persistence.expectedPayments.projectReady(
        organizationId,
        expectedPaymentId,
      );
    let payment =
      context.payment ??
      (await persistence.payments.createOrResume(organizationId, {
        key: `expected-payment:${expectedPaymentId.toString()}:execution`,
        obligation_record_id: context.expected.obligation_record_id,
        approved_payee_id: context.expected.approved_payee_id,
        approved_payee_generation_id:
          context.expected.approved_payee_generation_id,
        amount_base_units: context.expected.amount_base_units,
        asset_address: context.expected.asset_address,
        purpose: context.expected.purpose,
        external_reference: context.expected.external_reference,
      }));
    payment = await advancePaymentToReady(payment);
    if (
      !context.expected.payment_record_id ||
      context.expected.status === "ATTENTION"
    )
      await persistence.expectedPayments.linkPayment({
        organization_id: organizationId,
        expected_payment_id: expectedPaymentId,
        payment_record_id: payment.id,
      });
    const review: PaymentReviewDto = {
      organizationName: context.organizationWorkspace.display_name,
      payeeName: context.payeeWorkspace.display_name,
      payeeIdentity: context.identity.ens_name,
      amount: formatUsdcBaseUnits(context.expected.amount_base_units),
      assetSymbol: "USDC",
      purpose: context.expected.purpose,
      ...(context.expected.external_reference
        ? { reference: context.expected.external_reference }
        : {}),
      settlementEpoch: settlement.settlement_epoch,
      settlementUpdated:
        BigInt(settlement.settlement_epoch) > 0n ||
        result.status === "SETTLEMENT_UPDATED" ||
        Boolean(
          existingOperation?.settlement_version_id &&
          existingOperation.settlement_version_id !== settlement.id,
        ),
    };
    const requestHash = `0x${createHash("sha256")
      .update(
        JSON.stringify({
          expectedPaymentId: expectedPaymentId.toString(),
          paymentId: payment.id.toString(),
          obligationId: context.expected.obligation_record_id!.toString(),
          router: router.address,
          routerVersion: router.version,
          generationId: context.generation.id.toString(),
          securityRoot: context.root.security_root_commitment,
          settlementVersionId: settlement.id.toString(),
          amount: context.expected.amount_base_units,
          asset: context.expected.asset_address,
        }),
      )
      .digest("hex")}`;
    const operation = await persistence.paymentExecutions.prepare({
      organization_id: organizationId,
      expected_payment_id: expectedPaymentId,
      payment_id: payment.id,
      actor_member_id: actorMemberId,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      review_snapshot: JSON.stringify(review),
      review_expires_at: new Date(Date.now() + 5 * 60 * 1000),
      settlement_version_id: settlement.id,
    });
    return { operation: paymentExecutionDto(operation), review };
  }
  async function submit(expectedPaymentId: bigint, operationId: bigint) {
    const actorMemberId = await requireOperator();
    const operation = await persistence.paymentExecutions.read(
      organizationId,
      expectedPaymentId,
    );
    if (operation.id !== operationId)
      throw new DomainError(
        "CONFLICT",
        "This payment changed. Refresh and review it again.",
      );
    if (
      [
        "SUBMITTING",
        "SUBMITTED",
        "UNKNOWN_EXTERNAL_STATE",
        "CONFIRMED",
      ].includes(operation.status)
    )
      return { operation: paymentExecutionDto(operation) };
    if (
      operation.status !== "READY" ||
      !operation.review_expires_at ||
      operation.review_expires_at <= new Date()
    )
      throw new DomainError(
        "CONFLICT",
        "This payment review expired. Review the payment again.",
      );
    const result = await paymentPreflight(
      persistence,
      organizationId,
      expectedPaymentId,
    );
    if (result.status !== "READY" && result.status !== "SETTLEMENT_UPDATED")
      return block(expectedPaymentId, result.status);
    if (result.settlement.id !== operation.settlement_version_id) {
      await persistence.paymentExecutions.update(operation.id, {
        status: "BLOCKED",
        failure_code: "SETTLEMENT_UPDATED",
        validation_step: "RECEIVING_AUTHORITY",
      });
      throw new DomainError(
        "CONFLICT",
        paymentProblemMessage("SETTLEMENT_UPDATED"),
      );
    }
    if (
      !(await persistence.paymentAccess.activeOperator(
        organizationId,
        actorMemberId,
      ))
    )
      throw new DomainError(
        "INVALID_INPUT",
        "Your payment access changed. Ask an administrator to review it.",
      );
    const { context, settlement, router } = result;
    if (!context.payment || !settlement.destination_ciphertext)
      return block(expectedPaymentId, "TREASURY_BLOCKED");
    const secret =
      await persistence.treasury.routineSignerSecret(organizationId);
    if (!secret) return block(expectedPaymentId, "TREASURY_BLOCKED");
    const destination = unseal(
      settlement.destination_ciphertext,
      versionContext(
        context.payeeWorkspace.id,
        context.identity.id,
        context.generation.id,
        settlement.settlement_epoch,
      ),
    );
    const authorizationPrivateKey = encodeRoutineAuthorizationKey(
      unsealRoutineKey(
        organizationId,
        secret,
        treasuryConfiguration().signerSecret,
      ),
    );
    const obligation = await persistence.obligations.read(
      organizationId,
      context.payment.obligation_record_id,
    );
    const data = encodeFunctionData({
      abi: basinRouterAbi,
      functionName: "executeObligation",
      args: [
        obligation.obligation_id as Hex,
        {
          version: settlement.descriptor_version,
          chainId: BigInt(settlement.chain_id),
          asset: getAddress(settlement.asset_address),
          destination: getAddress(destination),
          settlementEpoch: BigInt(settlement.settlement_epoch),
          validFrom: BigInt(Math.floor(settlement.valid_from.getTime() / 1000)),
        },
        BigInt(context.payment.amount_base_units),
        context.payment.payment_id as Hex,
        {
          identityLabel: context.identity.label,
          organizationLabel:
            context.relationship.relationship_name!.split(".")[1]!,
          relationshipRegistry: getAddress(
            context.generation.relationship_registry_address,
          ),
          resolver: getAddress(context.root.resolver_proxy_address),
          identityEpoch: BigInt(context.root.identity_epoch),
        },
      ],
    });
    try {
      await persistence.paymentExecutions.update(
        operation.id,
        {
          status: "SUBMITTING",
          validation_step: "PAYMENT_ACCESS",
          execution_path: "ROUTINE_SIGNER",
          submission_block_number: result.observedBlock.toString(),
        },
        ["READY"],
      );
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "CONFLICT")
        throw error;
      const resumed = await persistence.paymentExecutions.read(
        organizationId,
        expectedPaymentId,
      );
      if (
        [
          "SUBMITTING",
          "SUBMITTED",
          "UNKNOWN_EXTERNAL_STATE",
          "CONFIRMED",
        ].includes(resumed.status)
      )
        return { operation: paymentExecutionDto(resumed) };
      throw error;
    }
    try {
      await persistence.payments.beginExecution(
        organizationId,
        attestExecution({
          payment_id: context.payment.id,
          execution_path: "ROUTINE_SIGNER",
        }),
      );
    } catch (error) {
      await persistence.paymentExecutions.update(
        operation.id,
        { status: "READY", execution_path: null },
        ["SUBMITTING"],
      );
      throw error;
    }
    try {
      const sent = await createPrivyTreasuryAdapter().sendRoutineTransaction!({
        walletId: context.treasury!.privy_wallet_id!,
        to: router.address,
        data,
        idempotencyKey: operation.idempotency_key,
        authorizationPrivateKey,
      });
      const next = await persistence.paymentExecutions.update(operation.id, {
        status: "SUBMITTED",
        validation_step: "SETTLEMENT_CONFIRMATION",
        execution_path: "ROUTINE_SIGNER",
        transaction_hash: sent.hash.toLowerCase(),
        privy_transaction_id: sent.transactionId,
        submitted_at: new Date(),
      });
      return { operation: paymentExecutionDto(next) };
    } catch (error) {
      const providerCode =
        error instanceof TreasuryProviderError ? error.code : undefined;
      const uncertain =
        !providerCode ||
        [
          "PRIVY_UNAVAILABLE",
          "RATE_LIMITED",
          "UNKNOWN_EXTERNAL_STATE",
        ].includes(providerCode);
      if (providerCode === "AUTHORIZATION_REQUIRED")
        return {
          operation: paymentExecutionDto(
            await persistence.paymentExecutions.update(operation.id, {
              status: "AWAITING_APPROVAL",
              failure_code: "TREASURY_BLOCKED",
            }),
          ),
        };
      if (!uncertain) {
        await persistence.payments.transition(organizationId, {
          payment_id: context.payment.id,
          expected_status: "EXECUTING",
          to_status: "FAILED",
        });
        await persistence.expectedPayments.projectAttention({
          organization_id: organizationId,
          expected_payment_id: expectedPaymentId,
          reason:
            providerCode === "INSUFFICIENT_FUNDS"
              ? "INSUFFICIENT_FUNDS"
              : "TREASURY_BLOCKED",
        });
      }
      const failureCode: PaymentProblemCode = uncertain
        ? "PAYMENT_UNCONFIRMED"
        : providerCode === "INSUFFICIENT_FUNDS"
          ? "INSUFFICIENT_FUNDS"
          : "TREASURY_BLOCKED";
      const next = await persistence.paymentExecutions.update(operation.id, {
        status: uncertain ? "UNKNOWN_EXTERNAL_STATE" : "FAILED",
        failure_code: failureCode,
      });
      if (uncertain) return { operation: paymentExecutionDto(next) };
      throw new DomainError("CONFLICT", paymentProblemMessage(failureCode));
    }
  }
  async function reconcile(expectedPaymentId: bigint) {
    let operation = await persistence.paymentExecutions.read(
      organizationId,
      expectedPaymentId,
    );
    // Reconciliation is only meaningful while an external submission may
    // still settle. Failed and blocked operations have no external state to
    // discover; the operator must start a fresh review instead. In
    // particular, do not let a failed PAYMENT_ACCESS attempt fall through to
    // the RPC/Privy recovery paths, which only accept in-flight statuses.
    if (["BLOCKED", "FAILED", "CONFIRMED"].includes(operation.status))
      return { operation: paymentExecutionDto(operation) };
    const client = createPublicClient({
      chain: sepolia,
      transport: http(getEnsServerEnvironment().rpcUrl, {
        timeout: 8_000,
        retryCount: 1,
      }),
    });
    if (!operation.transaction_hash) {
      const context = await persistence.paymentExecutions.context(
        organizationId,
        expectedPaymentId,
      );
      if (!context.payment || !context.treasury?.wallet_address)
        return { operation: paymentExecutionDto(operation) };

      if (operation.privy_transaction_id) {
        try {
          const provider = await createPrivyTreasuryAdapter().getTransaction?.(
            operation.privy_transaction_id,
          );
          if (provider?.hash) {
            operation = await persistence.paymentExecutions.update(
              operation.id,
              {
                status: "SUBMITTED",
                validation_step: "SETTLEMENT_CONFIRMATION",
                transaction_hash: provider.hash,
                submitted_at: operation.submitted_at ?? new Date(),
                failure_code: null,
              },
              ["SUBMITTING", "SUBMITTED", "UNKNOWN_EXTERNAL_STATE"],
            );
          } else if (
            provider &&
            [
              "execution_reverted",
              "failed",
              "replaced",
              "provider_error",
            ].includes(provider.status)
          ) {
            if (context.payment.status === "EXECUTING")
              await persistence.payments.transition(organizationId, {
                payment_id: context.payment.id,
                expected_status: "EXECUTING",
                to_status: "FAILED",
              });
            await persistence.expectedPayments.projectAttention({
              organization_id: organizationId,
              expected_payment_id: expectedPaymentId,
              reason: "PAYMENT_FAILED",
            });
            operation = await persistence.paymentExecutions.update(
              operation.id,
              {
                status: "FAILED",
                failure_code: "PAYMENT_FAILED",
                completed_at: new Date(),
              },
              ["SUBMITTING", "SUBMITTED", "UNKNOWN_EXTERNAL_STATE"],
            );
            return { operation: paymentExecutionDto(operation) };
          }
        } catch {
          // Sepolia evidence below remains authoritative when Privy is unavailable.
        }
      }

      if (!operation.transaction_hash) {
        const head = await client.getBlockNumber({ cacheTime: 0 });
        const fallbackFrom = head > 20_000n ? head - 20_000n : 0n;
        const fromBlock = operation.submission_block_number
          ? BigInt(operation.submission_block_number)
          : fallbackFrom;
        const executions = await client.getLogs({
          address: (await verifiedBasinRouter()).address,
          event: obligationExecutedEvent,
          args: { paymentId: context.payment.payment_id as Hex },
          fromBlock,
          toBlock: head,
        });
        if (executions.length > 1)
          throw new DomainError(
            "UNAVAILABLE",
            "We couldn't verify settlement yet. Check the payment status again.",
          );
        if (executions.length === 1 && executions[0].transactionHash) {
          operation = await persistence.paymentExecutions.update(
            operation.id,
            {
              status: "SUBMITTED",
              validation_step: "SETTLEMENT_CONFIRMATION",
              transaction_hash: executions[0].transactionHash.toLowerCase(),
              submitted_at: operation.submitted_at ?? new Date(),
              failure_code: null,
            },
            ["SUBMITTING", "SUBMITTED", "UNKNOWN_EXTERNAL_STATE"],
          );
        } else if (
          Date.now() - operation.updated_at.getTime() >=
          UNKNOWN_PAYMENT_SUBMISSION_GRACE_MS
        ) {
          const [router, obligation] = await Promise.all([
            verifiedBasinRouter(),
            persistence.obligations.read(
              organizationId,
              context.payment.obligation_record_id,
            ),
          ]);
          const [consumed, onchainObligation] = await Promise.all([
            client.readContract({
              address: router.address,
              abi: basinRouterAbi,
              functionName: "consumedPaymentIds",
              args: [context.payment.payment_id as Hex],
              blockNumber: head,
            }),
            client.readContract({
              address: router.address,
              abi: basinRouterAbi,
              functionName: "getObligation",
              args: [obligation.obligation_id as Hex],
              blockNumber: head,
            }),
          ]);
          if (
            hasConclusiveNonSubmissionEvidence({
              paymentIdConsumed: consumed,
              obligationExists: onchainObligation.exists,
              obligationCancelled: onchainObligation.cancelled,
              obligationRemainingAmount: onchainObligation.remainingAmount,
              paymentAmount: BigInt(context.payment.amount_base_units),
            })
          ) {
            if (context.payment.status === "EXECUTING")
              await persistence.payments.transition(organizationId, {
                payment_id: context.payment.id,
                expected_status: "EXECUTING",
                to_status: "FAILED",
              });
            await persistence.expectedPayments.projectAttention({
              organization_id: organizationId,
              expected_payment_id: expectedPaymentId,
              reason: "PAYMENT_FAILED",
            });
            operation = await persistence.paymentExecutions.update(
              operation.id,
              {
                status: "FAILED",
                failure_code: "PAYMENT_FAILED",
                completed_at: new Date(),
              },
              ["SUBMITTING", "SUBMITTED", "UNKNOWN_EXTERNAL_STATE"],
            );
            return { operation: paymentExecutionDto(operation) };
          }
        }
      }
    }
    if (!operation.transaction_hash)
      return { operation: paymentExecutionDto(operation) };
    const receipt = await client
      .getTransactionReceipt({ hash: operation.transaction_hash as Hex })
      .catch(() => undefined);
    if (!receipt) return { operation: paymentExecutionDto(operation) };
    if (receipt.status !== "success") {
      const context = await persistence.paymentExecutions.context(
        organizationId,
        expectedPaymentId,
      );
      if (context.payment?.status === "EXECUTING")
        await persistence.payments.transition(organizationId, {
          payment_id: context.payment.id,
          expected_status: "EXECUTING",
          to_status: "FAILED",
        });
      await persistence.expectedPayments.projectAttention({
        organization_id: organizationId,
        expected_payment_id: expectedPaymentId,
        reason: "PAYMENT_FAILED",
      });
      const next = await persistence.paymentExecutions.update(operation.id, {
        status: "FAILED",
        failure_code: "PAYMENT_FAILED",
        completed_at: new Date(),
      });
      return { operation: paymentExecutionDto(next) };
    }
    if (
      (await client.getBlockNumber({ cacheTime: 0 })) <
      receipt.blockNumber + 1n
    )
      return { operation: paymentExecutionDto(operation) };
    if (!operation.settlement_version_id)
      throw new DomainError(
        "CONFLICT",
        "This payment changed. Refresh and review it again.",
      );
    const [context, transaction, router, settlement] = await Promise.all([
      persistence.paymentExecutions.context(organizationId, expectedPaymentId),
      client.getTransaction({ hash: operation.transaction_hash as Hex }),
      verifiedBasinRouter(),
      persistence.paymentExecutions.settlementById(
        operation.settlement_version_id,
      ),
    ]);
    if (!context.payment)
      throw new DomainError(
        "CONFLICT",
        "This payment changed. Refresh and review it again.",
      );
    if (!transaction.to || !sameAddress(transaction.to, router.address))
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify settlement yet. Check the payment status again.",
      );
    const routerLogs = parseEventLogs({
      abi: basinRouterAbi,
      logs: receipt.logs,
      eventName: "ObligationExecuted",
      strict: true,
    }).filter(
      (log) =>
        sameAddress(log.address, router.address) &&
        log.args.paymentId === context.payment!.payment_id &&
        !!log.args.organization &&
        sameAddress(log.args.organization, context.treasury!.wallet_address!) &&
        log.args.amount === BigInt(context.payment!.amount_base_units) &&
        !!log.args.asset &&
        sameAddress(log.args.asset, router.asset),
    );
    if (routerLogs.length !== 1)
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify settlement yet. Check the payment status again.",
      );
    const event = routerLogs[0].args;
    const obligation = await persistence.obligations.read(
      organizationId,
      context.payment.obligation_record_id,
    );
    const onchainObligation = await client.readContract({
      address: router.address,
      abi: basinRouterAbi,
      functionName: "getObligation",
      args: [obligation.obligation_id as Hex],
      blockNumber: receipt.blockNumber,
    });
    const transferLogs = parseEventLogs({
      abi: transferAbi,
      logs: receipt.logs,
      eventName: "Transfer",
      strict: true,
    }).filter(
      (log) =>
        sameAddress(log.address, router.asset) &&
        !!log.args.from &&
        sameAddress(log.args.from, context.treasury!.wallet_address!) &&
        !!log.args.to &&
        sameAddress(log.args.to, event.destination!) &&
        log.args.value === BigInt(context.payment!.amount_base_units),
    );
    if (
      transferLogs.length !== 1 ||
      event.obligationId !== obligation.obligation_id ||
      event.relationshipNamehash !== context.generation.relationship_namehash ||
      event.relationshipTokenId !==
        BigInt(context.generation.relationship_token_id) ||
      event.payeeId !== context.root.payee_id ||
      event.settlementEpoch !== BigInt(settlement.settlement_epoch) ||
      event.settlementCommitment !== settlement.commitment ||
      event.metadataHash !== obligation.metadata_hash ||
      !onchainObligation.exists ||
      onchainObligation.remainingAmount !== event.remainingAmount
    )
      throw new DomainError(
        "UNAVAILABLE",
        "We couldn't verify settlement yet. Check the payment status again.",
      );
    const settledAt = new Date(
      Number(
        (await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp,
      ) * 1000,
    );
    const receiptRecord = await persistence.receipts.finalizeFromRouter(
      organizationId,
      attestSettlement({
        payment_id: context.payment.id,
        snapshot: {
          payment_id: context.payment.id,
          approved_payee_generation_id: context.generation.id,
          approved_security_root_id: context.root.id,
          settlement_version_id: settlement.id,
          relationship_name: context.relationship.relationship_name!,
          relationship_token_id: context.generation.relationship_token_id,
          relationship_expiry: context.generation.expires_at,
          relationship_status: "ACTIVE",
          global_payee_name: context.identity.ens_name,
          payee_id: context.root.payee_id,
          identity_controller: context.root.identity_controller,
          identity_epoch: context.root.identity_epoch,
          relationship_registry_address:
            context.root.relationship_registry_address,
          resolver_proxy_address: context.root.resolver_proxy_address,
          resolver_implementation_address:
            context.root.resolver_implementation_address,
          resolver_implementation_code_hash:
            context.root.resolver_implementation_code_hash,
          resolver_permission_profile_hash:
            context.root.resolver_permission_profile_hash,
          registry_permission_profile_hash:
            context.root.registry_permission_profile_hash,
          security_root_commitment: context.root.security_root_commitment,
          settlement_epoch: settlement.settlement_epoch,
          settlement_commitment: settlement.commitment,
          obligation_protocol_id: obligation.obligation_id,
          obligation_metadata_hash: obligation.metadata_hash,
          obligation_max_amount_base_units: obligation.max_amount_base_units,
          obligation_remaining_before_base_units:
            obligation.remaining_amount_base_units,
          obligation_remaining_after_base_units:
            event.remainingAmount!.toString(),
          obligation_valid_until: obligation.valid_until,
          organization_wallet_address: context.treasury!.wallet_address!,
          router_address: router.address,
          router_version: router.version,
          execution_path: "ROUTINE_SIGNER",
          captured_at: settledAt,
        },
        transaction_hash: receipt.transactionHash,
        block_number: receipt.blockNumber.toString(),
        settled_at: settledAt,
        chain_id: 11_155_111,
        payer_organization_name: context.organizationWorkspace.display_name,
        payee_display_name: context.payeeWorkspace.display_name,
        asset_symbol: "USDC",
      }),
    );
    await persistence.expectedPayments.satisfy(
      organizationId,
      expectedPaymentId,
    );
    const next = await persistence.paymentExecutions.update(operation.id, {
      status: "CONFIRMED",
      validation_step: "SETTLEMENT_CONFIRMATION",
      failure_code: null,
      completed_at: new Date(),
    });
    return {
      operation: paymentExecutionDto(next, receiptRecord.id.toString()),
    };
  }
  return { prepare, submit, reconcile };
}
