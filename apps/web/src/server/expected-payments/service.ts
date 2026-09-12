import "server-only";

import {
  DomainError,
  formatUsdcBaseUnits,
  parseUsdcAmount,
} from "@basin/domain";
import type { createPersistence } from "@basin/db";

import type {
  CreateExpectedPaymentResultDto,
  EligiblePayeeDto,
  ExpectedPaymentDetailDto,
  ExpectedPaymentListDto,
  ExpectedPaymentRowDto,
} from "../../shared/expected-payment-types";
import { createApprovedPayeeService } from "../approved-payees/service";
import { paymentExecutionDto } from "../payments/service";
import { expectedPaymentAssetConfiguration } from "./config";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;
type ReadRow = Awaited<
  ReturnType<Persistence["expectedPayments"]["listForOrganization"]>
>[number];

const statusLabels = {
  EXPECTED: "Expected",
  READY: "Ready",
  PROCESSING: "Processing",
  SATISFIED: "Satisfied",
  ATTENTION: "Needs attention",
  CANCELLED: "Cancelled",
} as const;

const reasonLabels = {
  RELATIONSHIP_CHANGED:
    "This payee relationship changed. Review it before payment.",
  RELATIONSHIP_INACTIVE: "This payee is no longer approved for payment.",
  AUTHORIZATION_UNAVAILABLE:
    "We couldn't verify this payee relationship right now.",
  OBLIGATION_UNAVAILABLE: "Payment authorization needs to be reviewed.",
  PAYMENT_FAILED: "The payment needs attention before it can continue.",
  SETTLEMENT_UPDATED:
    "The payee updated their receiving details. Review the latest payment.",
  SETTLEMENT_UNAVAILABLE:
    "The payee's latest receiving details still need to sync.",
  REAPPROVAL_REQUIRED:
    "This payee's security authority changed. An administrator needs to review the approval.",
  TREASURY_BLOCKED:
    "Your organization's payment controls need an administrator's attention.",
  INSUFFICIENT_FUNDS:
    "Your organization doesn't have enough available USDC for this payment.",
  PAYMENT_UNCONFIRMED:
    "We couldn't confirm the payment yet. Check its status before trying again.",
} as const;

function relationshipProblem(row: ReadRow) {
  if (row.relationship.status === "REVOKED" || row.relationship.revoked_at)
    return `Payment blocked — ${row.organizationWorkspace.display_name} no longer approves ${row.payeeWorkspace.display_name}.`;
  if (
    row.relationship.status === "EXPIRED" ||
    (row.relationship.expires_at && row.relationship.expires_at <= new Date()) ||
    row.generation.expires_at <= new Date()
  )
    return "Payment blocked — this approval expired.";
  if (row.relationship.status === "REAPPROVAL_REQUIRED")
    return "Approval required again — protected identity or relationship authority changed.";
  return "This payee relationship changed. Review it before payment.";
}

const retryablePaymentReasons = new Set([
  "SETTLEMENT_UPDATED",
  "SETTLEMENT_UNAVAILABLE",
  "AUTHORIZATION_UNAVAILABLE",
  "TREASURY_BLOCKED",
  "INSUFFICIENT_FUNDS",
]);

function projectedState(row: ReadRow) {
  if (row.expectedPayment.status === "CANCELLED") {
    return { status: "CANCELLED" as const };
  }
  if (
    row.relationship.status !== "ACTIVE" ||
    row.relationship.revoked_at ||
    (row.relationship.expires_at && row.relationship.expires_at <= new Date())
  ) {
    return {
      status: "ATTENTION" as const,
      reason: relationshipProblem(row),
    };
  }
  if (row.generation.ended_at || row.generation.expires_at <= new Date()) {
    return {
      status: "ATTENTION" as const,
      reason: relationshipProblem(row),
    };
  }
  return {
    status: row.expectedPayment.status,
    reason: row.expectedPayment.status_reason_code
      ? reasonLabels[row.expectedPayment.status_reason_code]
      : undefined,
  };
}

function rowDto(row: ReadRow, recipient: boolean): ExpectedPaymentRowDto {
  const projection = projectedState(row);
  return {
    id: row.expectedPayment.id.toString(),
    counterpartyName: recipient
      ? row.organizationWorkspace.display_name
      : row.payeeWorkspace.display_name,
    counterpartyIdentity: recipient ? undefined : row.identity.ens_name,
    relationshipName: row.relationship.relationship_name ?? undefined,
    amount: formatUsdcBaseUnits(row.expectedPayment.amount_base_units),
    amountBaseUnits: row.expectedPayment.amount_base_units,
    purpose: row.expectedPayment.purpose,
    reference: row.expectedPayment.external_reference ?? undefined,
    status: projection.status,
    statusLabel: statusLabels[projection.status],
    attentionReason:
      row.expectedPayment.status_reason_code === "SETTLEMENT_UPDATED"
        ? `${row.payeeWorkspace.display_name} updated where they receive. Review the payment again.`
        : projection.reason,
    createdAt: row.expectedPayment.created_at.toISOString(),
    receiptAvailable: Boolean(row.receiptId),
  };
}

function detailDto(row: ReadRow, access: Access): ExpectedPaymentDetailDto {
  const recipient = access.workspace.type === "PERSONAL";
  const base = rowDto(row, recipient);
  return {
    ...base,
    organizationId: row.organization.id.toString(),
    organizationName: row.organizationWorkspace.display_name,
    payeeName: row.payeeWorkspace.display_name,
    payeeIdentity: row.identity.ens_name,
    generationLabel: `Generation ${row.generation.generation_number}`,
    authorityDescription:
      "Receiving details are controlled by the payee and aren't entered here.",
    canCancel:
      !recipient &&
      access.memberRole === "ADMIN" &&
      row.expectedPayment.status === "EXPECTED" &&
      !row.expectedPayment.obligation_record_id &&
      !row.expectedPayment.payment_record_id,
    canAuthorize:
      !recipient &&
      access.memberRole === "ADMIN" &&
      row.expectedPayment.status === "EXPECTED" &&
      !row.expectedPayment.obligation_record_id &&
      !row.expectedPayment.payment_record_id,
    obligationId: row.expectedPayment.obligation_record_id?.toString(),
    paymentId: row.expectedPayment.payment_record_id?.toString(),
    receiptId: row.receiptId?.toString(),
    paymentAction: !recipient
      ? {
          status:
            base.status === "READY" ||
            base.status === "PROCESSING" ||
            base.status === "ATTENTION" ||
            base.status === "SATISFIED"
              ? base.status
              : "ATTENTION",
          canReview:
            access.memberRole === "PAYMENT_OPERATOR" &&
            (base.status === "READY" ||
              (base.status === "ATTENTION" &&
                Boolean(
                  row.expectedPayment.status_reason_code &&
                  retryablePaymentReasons.has(
                    row.expectedPayment.status_reason_code,
                  ),
                ))),
          ...(access.memberRole === "ADMIN" && base.status === "READY"
            ? { message: "A payment operator can complete this payment." }
            : {}),
          ...(base.status === "PROCESSING"
            ? {
                message:
                  "This payment is being confirmed. Check its status for the latest result.",
              }
            : base.status === "ATTENTION"
              ? {
                  message:
                    base.attentionReason ??
                    "This payment needs attention before it can continue.",
                }
              : {}),
        }
      : undefined,
  };
}

function authorizationMessage(
  status: NonNullable<ExpectedPaymentDetailDto["authorization"]>["status"],
) {
  return {
    PREPARED: "Payment authorization is ready to submit.",
    AWAITING_APPROVAL: "Waiting for organization wallet approval.",
    SUBMITTED: "Payment authorization is being confirmed.",
    UNKNOWN_EXTERNAL_STATE:
      "We couldn't confirm the authorization yet. Check its status.",
    CONFIRMED: "Payment authorization is confirmed.",
    FAILED:
      "Payment authorization failed. Create a new expected payment before trying again.",
  }[status];
}

function payeeDto(
  item: Awaited<
    ReturnType<Persistence["expectedPayments"]["eligibleRelationships"]>
  >[number],
): EligiblePayeeDto {
  return {
    id: item.relationship.id.toString(),
    displayName: item.payeeWorkspace.display_name,
    identity: item.identity.ens_name,
    relationshipName: item.relationship.relationship_name ?? undefined,
  };
}

export function createExpectedPaymentService(
  persistence: Persistence,
  access: Access,
  actorUserId: bigint,
) {
  const organizationId = access.organizationId;

  async function list(
    cursor?: bigint,
    limit = 25,
  ): Promise<ExpectedPaymentListDto> {
    if (access.workspace.type === "ORGANIZATION" && organizationId) {
      const [rows, eligible] = await Promise.all([
        persistence.expectedPayments.listForOrganization(
          organizationId,
          cursor,
          limit,
        ),
        persistence.expectedPayments.eligibleRelationships(organizationId),
      ]);
      return {
        viewer: "ORGANIZATION",
        canCreate: access.memberRole === "ADMIN",
        hasEligiblePayee: eligible.length > 0,
        eligiblePayees: eligible.map(payeeDto),
        rows: rows.map((row) => rowDto(row, false)),
        ...(rows.length === limit
          ? { nextCursor: rows.at(-1)!.expectedPayment.id.toString() }
          : {}),
      };
    }
    const rows = await persistence.expectedPayments.listForPersonalWorkspace(
      access.workspace.id,
      cursor,
      limit,
    );
    return {
      viewer: "RECIPIENT",
      canCreate: false,
      hasEligiblePayee: false,
      eligiblePayees: [],
      rows: rows.map((row) => rowDto(row, true)),
      ...(rows.length === limit
        ? { nextCursor: rows.at(-1)!.expectedPayment.id.toString() }
        : {}),
    };
  }

  async function detail(id: bigint): Promise<ExpectedPaymentDetailDto> {
    const executionPromise =
      access.workspace.type === "ORGANIZATION" && organizationId
        ? persistence.paymentExecutions.readMaybe(organizationId, id)
        : Promise.resolve(null);
    let row: ReadRow;
    try {
      row =
        access.workspace.type === "ORGANIZATION" && organizationId
          ? await persistence.expectedPayments.detailForOrganization(
              organizationId,
              id,
            )
          : await persistence.expectedPayments.detailForPersonalWorkspace(
              access.workspace.id,
              id,
            );
    } catch {
      throw new DomainError(
        "NOT_FOUND",
        "We couldn't find that expected payment.",
      );
    }
    const result = detailDto(row, access);
    const currentRelationship =
      row.generation.ended_at &&
      access.workspace.type === "ORGANIZATION" &&
      organizationId
        ? (
            await persistence.expectedPayments.eligibleRelationships(
              organizationId,
            )
          ).find((item) => item.relationship.id === row.relationship.id)
        : undefined;
    const relationshipUpdate =
      currentRelationship && currentRelationship.generation.id !== row.generation.id
        ? {
            previousGenerationLabel: `Generation ${row.generation.generation_number}`,
            currentGenerationLabel: `Generation ${currentRelationship.generation.generation_number}`,
            canAdopt:
              access.memberRole === "ADMIN" &&
              row.expectedPayment.status === "EXPECTED" &&
              !row.expectedPayment.obligation_record_id &&
              !row.expectedPayment.payment_record_id,
          }
        : undefined;
    const withRelationship = relationshipUpdate
      ? {
          ...result,
          canAuthorize: false,
          relationshipUpdate,
          paymentAction: result.paymentAction
            ? { status: result.paymentAction.status, canReview: false }
            : undefined,
        }
      : result;
    const execution = await executionPromise;
    const withExecution = execution
      ? {
          ...withRelationship,
          paymentExecution: paymentExecutionDto(
            execution,
            row.receiptId?.toString(),
          ),
          paymentAction: result.paymentAction
            ? { ...result.paymentAction, canReview: false }
            : undefined,
        }
      : withRelationship;
    if (["CANCELLED", "SATISFIED", "PROCESSING"].includes(result.status))
      return withExecution;
    if (execution) return withExecution;
    let authorization: ExpectedPaymentDetailDto["authorization"];
    if (access.workspace.type === "ORGANIZATION" && organizationId) {
      try {
        const operation = await persistence.paymentAuthorizations.read(
          organizationId,
          id,
        );
        authorization = {
          status: operation.status,
          message: authorizationMessage(operation.status),
        };
      } catch {
        // An expected payment has no authorization journal until an admin starts one.
      }
    }
    return {
      ...withExecution,
      authorization,
      canAuthorize:
        withExecution.canAuthorize &&
        (!authorization ||
          ["PREPARED", "FAILED"].includes(authorization.status)),
    };
  }

  async function create(input: {
    approvedPayeeId: bigint;
    amount: string;
    purpose: string;
    reference?: string;
    idempotencyKey: string;
  }): Promise<CreateExpectedPaymentResultDto> {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId ||
      !access.memberId
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only an organization administrator can create expected payments.",
      );
    }
    const purpose = input.purpose.trim();
    const reference = input.reference?.trim() || undefined;
    if (!purpose) {
      throw new DomainError("INVALID_INPUT", "Enter what this payment is for.");
    }
    if (purpose.length > 240) {
      throw new DomainError(
        "INVALID_INPUT",
        "Keep the purpose under 240 characters.",
      );
    }
    if (reference && reference.length > 160) {
      throw new DomainError(
        "INVALID_INPUT",
        "Keep the reference under 160 characters.",
      );
    }
    const amountBaseUnits = parseUsdcAmount(input.amount);
    const relationshipService = createApprovedPayeeService(
      persistence,
      access,
      actorUserId,
    );
    let relationship;
    try {
      relationship = await relationshipService.detail(input.approvedPayeeId);
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw new DomainError(
          "INVALID_INPUT",
          "Select an active approved payee.",
        );
      }
      throw error;
    }
    const generationId = relationship.technical?.generationId;
    if (!relationship.eligible || !generationId) {
      throw new DomainError(
        relationship.verification === "unavailable"
          ? "UNAVAILABLE"
          : "CONFLICT",
        relationship.verification === "unavailable"
          ? "We couldn't verify this relationship. Try again."
          : relationship.verification === "changed"
            ? "This payee relationship changed. Review it before payment."
            : "This payee is no longer approved for payment.",
      );
    }
    const result = await persistence.expectedPayments.create({
      organization_id: organizationId,
      approved_payee_id: input.approvedPayeeId,
      approved_payee_generation_id: BigInt(generationId),
      amount_base_units: amountBaseUnits,
      asset_address: expectedPaymentAssetConfiguration().address,
      purpose,
      external_reference: reference,
      created_by_member_id: access.memberId,
      idempotency_key: input.idempotencyKey,
    });
    return {
      detail: await detail(result.payment.id),
      created: result.created,
    };
  }

  async function cancel(id: bigint, idempotencyKey: string) {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId ||
      !access.memberId
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Only an organization administrator can cancel expected payments.",
      );
    }
    await persistence.expectedPayments.cancel({
      organization_id: organizationId,
      expected_payment_id: id,
      member_id: access.memberId,
      idempotency_key: idempotencyKey,
    });
    return detail(id);
  }

  async function refreshRelationship(id: bigint, idempotencyKey: string) {
    if (
      access.workspace.type !== "ORGANIZATION" ||
      access.memberRole !== "ADMIN" ||
      !organizationId ||
      !access.memberId
    )
      throw new DomainError(
        "INVALID_INPUT",
        "An organization administrator can review this relationship update.",
      );
    await persistence.expectedPayments.refreshRelationship({
      organization_id: organizationId,
      expected_payment_id: id,
      member_id: access.memberId,
      idempotency_key: idempotencyKey,
    });
    return detail(id);
  }

  return { list, detail, create, cancel, refreshRelationship };
}
