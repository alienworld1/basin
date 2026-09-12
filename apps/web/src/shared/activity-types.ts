export type ActivityStatus = "PROCESSING" | "ATTENTION" | "FAILED" | "SETTLED";

export type ActivityRowDto = {
  id: string;
  direction: "OUTGOING" | "INCOMING";
  counterpartyName: string;
  counterpartyIdentity?: string;
  relationshipName?: string;
  amount: string;
  amountBaseUnits: string;
  assetSymbol: "USDC";
  purpose: string;
  reference?: string;
  status: ActivityStatus;
  statusLabel: string;
  occurredAt: string;
  receiptId?: string;
  expectedPaymentId?: string;
  safeReason?: string;
};

export type ActivityListDto = {
  viewer: "ORGANIZATION" | "RECIPIENT";
  rows: ActivityRowDto[];
  nextCursor?: string;
  canReconcile: boolean;
};
