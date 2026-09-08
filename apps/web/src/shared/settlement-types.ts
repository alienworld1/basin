export type ReceivingOperationDto = {
  id: string;
  relationshipId: string;
  status:
    | "PREPARED"
    | "SUBMITTED"
    | "VERIFYING"
    | "CONFIRMED"
    | "FAILED"
    | "UNKNOWN"
    | "NEEDS_REVIEW";
  transactionHash: string | null;
  epoch: string;
  commitment: string;
  blockNumber: string | null;
  blockHash: string | null;
  verifiedAt: string | null;
  message: string;
};
export type ReceivingVersionDto = {
  destination: string | null;
  epoch: string;
  commitment: string;
  transactionHash: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  verifiedAt: string | null;
};
export type ReceivingStatusDto = {
  status:
    "EMPTY" | "SAVED" | "VERIFIED" | "VERIFYING" | "NEEDS_REVIEW" | "DISABLED";
  trust:
    | "PREFERENCE_ONLY"
    | "SETTLEMENT_ONLY"
    | "REAPPROVAL_REQUIRED"
    | "RELATIONSHIP_INACTIVE"
    | "UNVERIFIED"
    | "NEEDS_REVIEW";
  observedAt: string;
  blockNumber: string | null;
  message: string;
  canEdit: boolean;
  asset: {
    address: string;
    symbol: string;
    chainId: "11155111";
    network: "Ethereum Sepolia";
  };
  preference: { destination: string; revision: string } | null;
  relationships: { id: string; name: string | null; status: string }[];
  relationshipId: string | null;
  current: ReceivingVersionDto | null;
  history: ReceivingVersionDto[];
  pending: ReceivingOperationDto | null;
  prepared: { destination: string; idempotencyKey: string } | null;
  technical: {
    relationshipTokenId: string;
    identityEpoch: string;
    resolver: string;
    profile: string;
    approvalVerified: boolean;
  } | null;
};
export type PreparedReceivingDto = {
  operationId: string;
  expiresAt: string;
  oldDestination: string | null;
  destination: string;
  epoch: string;
  relationshipName: string;
  transaction: {
    to: `0x${string}`;
    from: `0x${string}`;
    data: `0x${string}`;
    value: "0x0";
    chainId: 11155111;
  };
};
