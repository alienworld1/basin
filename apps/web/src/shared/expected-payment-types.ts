export type ExpectedPaymentStatus =
  "EXPECTED" | "READY" | "PROCESSING" | "SATISFIED" | "ATTENTION" | "CANCELLED";

export type EligiblePayeeDto = {
  id: string;
  displayName: string;
  identity: string;
  relationshipName?: string;
};

export type ExpectedPaymentRowDto = {
  id: string;
  counterpartyName: string;
  counterpartyIdentity?: string;
  relationshipName?: string;
  amount: string;
  amountBaseUnits: string;
  purpose: string;
  reference?: string;
  status: ExpectedPaymentStatus;
  statusLabel: string;
  attentionReason?: string;
  createdAt: string;
  receiptAvailable: boolean;
};

export type ExpectedPaymentListDto = {
  viewer: "ORGANIZATION" | "RECIPIENT";
  canCreate: boolean;
  hasEligiblePayee: boolean;
  eligiblePayees: EligiblePayeeDto[];
  rows: ExpectedPaymentRowDto[];
  nextCursor?: string;
};

export type ExpectedPaymentDetailDto = ExpectedPaymentRowDto & {
  organizationId: string;
  organizationName: string;
  payeeName: string;
  payeeIdentity: string;
  generationLabel: string;
  authorityDescription: string;
  canCancel: boolean;
  canAuthorize: boolean;
  obligationId?: string;
  paymentId?: string;
  receiptId?: string;
  authorization?: {
    status: "PREPARED" | "AWAITING_APPROVAL" | "SUBMITTED" | "UNKNOWN_EXTERNAL_STATE" | "CONFIRMED" | "FAILED";
    message: string;
  };
};

export type CreateExpectedPaymentResultDto = {
  detail: ExpectedPaymentDetailDto;
  created: boolean;
};
