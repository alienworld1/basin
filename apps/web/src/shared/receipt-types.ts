export type ReceiptVerificationStatus =
  "CHECKING" | "VERIFIED" | "EVIDENCE_UNAVAILABLE" | "MISMATCH" | "UNSUPPORTED";

export type ReceiptDetailDto = {
  id: string;
  paymentId: string;
  payerOrganizationName: string;
  payeeName: string;
  payeeIdentity: string;
  amount: string;
  amountBaseUnits: string;
  assetSymbol: "USDC";
  purpose: string;
  reference?: string;
  settledAt: string;
  relationshipName: string;
  relationshipTokenId: string;
  relationshipExpiry: string;
  relationshipStatusAtPayment: "ACTIVE";
  currentRelationshipStatus?: "REVOKED" | "EXPIRED" | "REAPPROVAL_REQUIRED";
  settlementEpoch: string;
  verification: { status: "CHECKING"; summary: string };
  technical: {
    transactionHash: string;
    routerAddress: string;
    routerVersion: string;
    paymentId: string;
    obligationId: string;
    settlementCommitment: string;
    securityRootCommitment: string;
    relationshipRegistry: string;
    resolverProxy: string;
    resolverImplementation: string;
    identityEpoch: string;
    executionPath: "Privy routine signer" | "Privy intent";
  };
};

export type ReceiptVerificationDto = {
  status: Exclude<ReceiptVerificationStatus, "CHECKING">;
  checkedAt: string;
  network: "Ethereum Sepolia";
  summary: string;
  confirmations?: string;
  blockNumber?: string;
  blockHash?: string;
  eventName?: "ObligationExecuted";
  mismatches?: string[];
};
