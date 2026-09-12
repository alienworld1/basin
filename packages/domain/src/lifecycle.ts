export const workspaceTypes = ["PERSONAL", "ORGANIZATION"] as const;
export const memberRoles = ["ADMIN", "PAYMENT_OPERATOR"] as const;
export const memberStatuses = ["ACTIVE", "REMOVED", "LEFT"] as const;
export const invitationStatuses = [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
] as const;
export const accessEventTypes = [
  "INVITED",
  "INVITATION_REVOKED",
  "INVITATION_EXPIRED",
  "JOINED",
  "REINSTATED",
  "REMOVED",
  "LEFT",
] as const;
export const invitationOperationTypes = [
  "CREATE_INVITATION",
  "REPLACE_INVITATION",
] as const;
export const identityStatuses = [
  "PENDING",
  "ACTIVE",
  "FAILED",
  "REAPPROVAL_REQUIRED",
] as const;
export const payeeStatuses = [
  "PENDING",
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
  "REAPPROVAL_REQUIRED",
] as const;
export const obligationStatuses = [
  "PENDING",
  "ACTIVE",
  "CONSUMED",
  "CANCELLED",
  "EXPIRED",
] as const;
export const expectedPaymentStatuses = [
  "EXPECTED",
  "READY",
  "PROCESSING",
  "SATISFIED",
  "ATTENTION",
  "CANCELLED",
] as const;
export const expectedPaymentReasonCodes = [
  "RELATIONSHIP_CHANGED",
  "SETTLEMENT_UPDATED",
  "SETTLEMENT_UNAVAILABLE",
  "REAPPROVAL_REQUIRED",
  "RELATIONSHIP_INACTIVE",
  "AUTHORIZATION_UNAVAILABLE",
  "OBLIGATION_UNAVAILABLE",
  "TREASURY_BLOCKED",
  "INSUFFICIENT_FUNDS",
  "PAYMENT_UNCONFIRMED",
  "PAYMENT_FAILED",
] as const;
export const paymentStatuses = [
  "DRAFT",
  "VALIDATING_AUTHORITY",
  "BLOCKED",
  "READY",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "FAILED",
  "SETTLED",
] as const;
export const eventTypes = [
  "CREATED",
  "AUTHORITY_VALIDATION_STARTED",
  "BLOCKED",
  "AUTHORITY_VALIDATED",
  "APPROVAL_REQUESTED",
  "EXECUTION_STARTED",
  "EXECUTION_FAILED",
  "SETTLEMENT_CONFIRMED",
] as const;
export const endReasons = [
  "REVOKED",
  "EXPIRED",
  "REPLACED",
  "SECURITY_ROOT_CHANGED",
] as const;
export const executionPaths = ["ROUTINE_SIGNER", "PRIVY_INTENT"] as const;
export const idempotencyStatuses = [
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED_RETRYABLE",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export type PayeeStatus = (typeof payeeStatuses)[number];
export type ObligationStatus = (typeof obligationStatuses)[number];
export type ExpectedPaymentStatus = (typeof expectedPaymentStatuses)[number];
export type ExpectedPaymentReasonCode =
  (typeof expectedPaymentReasonCodes)[number];
export type ErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "BLOCKED"
  | "UNAVAILABLE";
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message = "We couldn't complete this request.",
  ) {
    super(message);
    this.name = "DomainError";
  }
}
const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  DRAFT: ["VALIDATING_AUTHORITY"],
  VALIDATING_AUTHORITY: ["READY", "BLOCKED"],
  READY: ["EXECUTING", "AWAITING_APPROVAL", "VALIDATING_AUTHORITY", "BLOCKED"],
  AWAITING_APPROVAL: ["VALIDATING_AUTHORITY", "EXECUTING"],
  EXECUTING: ["SETTLED", "FAILED"],
  BLOCKED: ["VALIDATING_AUTHORITY"],
  FAILED: ["VALIDATING_AUTHORITY"],
  SETTLED: [],
};
export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
) {
  if (!paymentTransitions[from].includes(to))
    throw new DomainError(
      "INVALID_TRANSITION",
      "This payment has changed. Refresh and try again.",
    );
}
export const eventForStatus = {
  DRAFT: "CREATED",
  VALIDATING_AUTHORITY: "AUTHORITY_VALIDATION_STARTED",
  BLOCKED: "BLOCKED",
  READY: "AUTHORITY_VALIDATED",
  AWAITING_APPROVAL: "APPROVAL_REQUESTED",
  EXECUTING: "EXECUTION_STARTED",
  FAILED: "EXECUTION_FAILED",
  SETTLED: "SETTLEMENT_CONFIRMED",
} as const;
export function assertObligationTransition(
  from: ObligationStatus,
  to: ObligationStatus,
  previous: string,
  remaining: string,
) {
  const allowed =
    from === "PENDING"
      ? ["ACTIVE"]
      : from === "ACTIVE"
        ? ["ACTIVE", "CONSUMED", "CANCELLED", "EXPIRED"]
        : [];
  if (!allowed.includes(to) || BigInt(remaining) > BigInt(previous))
    throw new DomainError("INVALID_TRANSITION");
}
export function assertPayeeTransition(from: PayeeStatus, to: PayeeStatus) {
  const allowed =
    from === "PENDING"
      ? ["ACTIVE", "REVOKED"]
      : from === "ACTIVE"
        ? ["EXPIRED", "REVOKED", "REAPPROVAL_REQUIRED"]
        : [];
  if (!allowed.includes(to)) throw new DomainError("INVALID_TRANSITION");
}

const expectedPaymentTransitions: Record<
  ExpectedPaymentStatus,
  readonly ExpectedPaymentStatus[]
> = {
  EXPECTED: ["READY", "ATTENTION", "CANCELLED"],
  READY: ["PROCESSING", "ATTENTION"],
  PROCESSING: ["SATISFIED", "ATTENTION"],
  ATTENTION: ["READY", "PROCESSING"],
  SATISFIED: [],
  CANCELLED: [],
};

export function assertExpectedPaymentTransition(
  from: ExpectedPaymentStatus,
  to: ExpectedPaymentStatus,
) {
  if (!expectedPaymentTransitions[from].includes(to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "This expected payment has changed. Refresh and review it.",
    );
  }
}
