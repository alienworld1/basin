export type TreasuryStatus =
  | "NOT_STARTED"
  | "PROVISIONING"
  | "CONTROL_READY"
  | "AWAITING_APPROVAL"
  | "READY"
  | "NEEDS_ATTENTION"
  | "FAILED";

export type TreasurySummary = {
  workspaceId: string;
  organizationName: string;
  role: "ADMIN" | "PAYMENT_OPERATOR";
  status: TreasuryStatus;
  network: "Ethereum Sepolia";
  routerConfigured: boolean;
  routineLimit?: string;
  lastVerifiedAt?: string;
  errorCode?: string;
  account?: {
    address: string;
    ethBalanceWei?: string;
    balanceCheckedAt?: string;
  };
  operation?: {
    id: string;
    step: string;
    status: string;
    approvalPending: boolean;
  };
};

export type TreasuryTechnicalDetails = {
  walletAddress?: string;
  privyOrganizationId?: string;
  privyWalletId?: string;
  ownerQuorumId?: string;
  ownerQuorumThreshold?: number;
  routineSignerId?: string;
  routinePolicyId?: string;
  routinePolicyFingerprint?: string;
  routerAddress?: string;
  routerVersion?: string;
  routineLimit?: string;
  lastVerifiedAt?: string;
};

export type TreasuryStatusResponse = {
  summary: TreasurySummary;
  technical: TreasuryTechnicalDetails;
  walletAuthorization?: {
    request: {
      version: 1;
      method: "POST" | "PATCH";
      url: string;
      body: unknown;
      headers: {
        "privy-app-id": string;
        "privy-idempotency-key"?: string;
        "privy-request-expiry"?: string;
      };
    };
    requestExpiry: number;
  };
};
