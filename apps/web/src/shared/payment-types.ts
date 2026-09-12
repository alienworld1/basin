export const paymentExecutionStatuses = [
  "PREPARED",
  "VALIDATING",
  "READY",
  "AWAITING_APPROVAL",
  "SUBMITTING",
  "SUBMITTED",
  "UNKNOWN_EXTERNAL_STATE",
  "BLOCKED",
  "CONFIRMED",
  "FAILED",
] as const;

export type PaymentExecutionStatus = (typeof paymentExecutionStatuses)[number];

export const paymentValidationSteps = [
  "APPROVED_PAYEE",
  "RECEIVING_AUTHORITY",
  "PAYMENT_ACCESS",
  "SETTLEMENT_CONFIRMATION",
] as const;

export type PaymentValidationStep = (typeof paymentValidationSteps)[number];

export const paymentProblemCodes = [
  "SETTLEMENT_UPDATED",
  "SETTLEMENT_UNAVAILABLE",
  "REAPPROVAL_REQUIRED",
  "RELATIONSHIP_INACTIVE",
  "OBLIGATION_UNAVAILABLE",
  "TREASURY_BLOCKED",
  "INSUFFICIENT_FUNDS",
  "AUTHORITY_UNAVAILABLE",
  "PAYMENT_UNCONFIRMED",
  "PAYMENT_FAILED",
] as const;

export type PaymentProblemCode = (typeof paymentProblemCodes)[number];

export type PaymentReviewDto = {
  organizationName: string;
  payeeName: string;
  payeeIdentity: string;
  amount: string;
  assetSymbol: "USDC";
  purpose: string;
  reference?: string;
  settlementEpoch: string;
  settlementUpdated: boolean;
};

export type PaymentExecutionDto = {
  id: string;
  status: PaymentExecutionStatus;
  step?: PaymentValidationStep;
  reviewExpiresAt?: string;
  review?: PaymentReviewDto;
  problem?: {
    code: PaymentProblemCode;
    message: string;
    action: "REVIEW_AGAIN" | "CHECK_STATUS" | "OPEN_PAYEE" | "CONTACT_ADMIN";
  };
  receiptId?: string;
};
