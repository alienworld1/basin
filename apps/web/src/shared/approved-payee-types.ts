export type RelationshipStatus =
  "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED" | "REAPPROVAL_REQUIRED";

export type RelationshipOperationDto = {
  id: string;
  kind: "SETUP_NAMESPACE" | "PROPOSE" | "ACCEPT" | "REVOKE";
  status:
    | "PREPARED"
    | "AWAITING_AUTHORIZATION"
    | "SUBMITTED"
    | "CONFIRMED"
    | "FAILED"
    | "NEEDS_ATTENTION";
  step: string;
  message: string;
  updatedAt: string;
};

export type ApprovedPayeeRowDto = {
  id: string;
  payeeName: string;
  payeeDisplayName?: string;
  organizationName: string;
  organizationIdentity?: string;
  relationshipName?: string;
  status: RelationshipStatus;
  statusLabel: string;
  expiresAt?: string;
  receivingStatus: "READY" | "SETUP_NEEDED" | "UNAVAILABLE";
};

export type ApprovedPayeeListDto = {
  viewer: "ORGANIZATION" | "RECIPIENT";
  canApprove: boolean;
  setup: {
    ready: boolean;
    canSetup: boolean;
    message: string;
    operation?: RelationshipOperationDto;
  };
  rows: ApprovedPayeeRowDto[];
  nextCursor?: string;
};

export type RelationshipHistoryDto = {
  id: string;
  type: string;
  occurredAt: string;
  generationId?: string;
  transactionHash?: string;
};

export type ApprovedPayeeDetailDto = ApprovedPayeeRowDto & {
  organizationId: string;
  payeeId: string;
  identityController: string;
  identityEpoch: string;
  verification: "verified" | "unavailable" | "changed";
  eligible: boolean;
  blockingReasons: string[];
  canAccept: boolean;
  canSetupReceiving: boolean;
  canRevoke: boolean;
  canReapprove: boolean;
  operation?: RelationshipOperationDto;
  history: RelationshipHistoryDto[];
  technical?: {
    network: "Ethereum Sepolia";
    registryAddress?: string;
    relationshipTokenId?: string;
    generationId?: string;
    resolverAddress?: string;
    resolverImplementationAddress?: string;
    resolverImplementationCodeHash?: string;
    resolverPermissionProfileHash?: string;
    registryPermissionProfileHash?: string;
    securityRootCommitment?: string;
    activationTransactionHash?: string;
    activationBlockNumber?: string;
    lastVerifiedAt?: string;
  };
};

export type ResolvedPayeeDto = {
  identityId: string;
  canonicalName: string;
  displayName?: string;
  status: "ACTIVE";
  controller: string;
  identityEpoch: string;
  existingRelationshipId?: string;
  maximumExpiry: string;
  reviewExpiresAt: string;
};

export type PreparedRelationshipDto = {
  operation: RelationshipOperationDto;
  relationshipId?: string;
  walletAuthorization?: {
    requestExpiry: number;
    request: {
      version: 1;
      method: "POST";
      url: string;
      body: Record<string, unknown>;
      headers: {
        "privy-app-id": string;
        "privy-idempotency-key": string;
        "privy-request-expiry": string;
      };
    };
  };
  authorization?: {
    type: "CONTROLLER_SIGNATURE";
    controller: string;
    domain: {
      name: "BasinRouter";
      version: "1";
      chainId: 11155111;
      verifyingContract: string;
    };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: "AcceptApprovedPayee";
    message: Record<string, string | bigint>;
  };
  transaction?: {
    to: string;
    data: string;
    chainId: 11155111;
    from: string;
  };
};

export type RelationshipTechnicalDetails = ApprovedPayeeDetailDto["technical"];
