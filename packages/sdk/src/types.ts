import type {
  Address,
  Hash,
  Hex,
  PublicClient,
  TypedDataDefinition,
} from "viem";
import type { BasinDeployment } from "./deployment";

/** Protected receiving details supplied only when preparing or verifying a payment. */
export type SettlementDescriptorV1 = Readonly<{
  version: 1;
  chainId: bigint;
  asset: Address;
  destination: Address;
  settlementEpoch: bigint;
  validFrom: bigint;
}>;

export type BasinClientConfig = Readonly<{
  publicClient: PublicClient;
  deployment?: BasinDeployment;
  requestTimeoutMs?: number;
}>;
export type Observation = Readonly<{ blockNumber: bigint; blockHash: Hash }>;
export type PermissionProfile = Readonly<{
  verified: boolean;
  reason?: "UNAVAILABLE" | "MISMATCH";
  securityRootCommitment?: Hex;
}>;
export type IdentityInspection = Observation &
  Readonly<{
    name: string;
    node: Hex;
    exists: boolean;
    status: "ACTIVE" | "NOT_FOUND" | "REAPPROVAL_REQUIRED";
    recordVersion?: 1;
    payeeId?: Hex;
    identityEpoch?: bigint;
    controller?: Address;
    registry: Address;
    resolver?: Address;
  }>;
export type ActivationEvidence = Readonly<{
  securityRootCommitment: Hex;
  payeeId: Hex;
  expiresAt: bigint;
  nonce: bigint;
}>;
export type ApprovedPayeeInspection = Observation &
  Readonly<{
    organizationName: string;
    identityName: string;
    relationshipName: string;
    relationshipNode: Hex;
    relationshipTokenId?: bigint;
    expiresAt?: bigint;
    status:
      "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED" | "REAPPROVAL_REQUIRED";
    active: boolean;
    activation: ActivationEvidence | null;
    permissionProfile: PermissionProfile;
    registry?: Address;
    resolver?: Address;
  }>;
export type SettlementInspection = Observation &
  Readonly<{
    relationshipName: string;
    relationshipTokenId?: bigint;
    recordVersion?: 1;
    settlementEpoch?: bigint;
    commitment?: Hex;
    available: boolean;
    permissionProfile: PermissionProfile;
  }>;
export type ObligationInspection = Observation &
  Readonly<{
    obligationId: Hex;
    organization?: Address;
    relationshipNode?: Hex;
    relationshipTokenId?: bigint;
    payeeId?: Hex;
    securityRootCommitment?: Hex;
    maxAmount?: bigint;
    remainingAmount?: bigint;
    validUntil?: bigint;
    metadataHash?: Hex;
    status: "NOT_FOUND" | "ACTIVE" | "CONSUMED" | "CANCELLED" | "EXPIRED";
  }>;
export type PreparedCall = Readonly<{
  to: Address;
  data: Hex;
  value: 0n;
  chainId: bigint;
}>;
export type PreparedPayment = Readonly<{
  protocolVersion: "1";
  chainId: bigint;
  requiredAuthority: "PAYMENT_OPERATOR";
  calls: readonly [PreparedCall];
  typedData: null;
  review: Readonly<{
    obligation: ObligationInspection;
    payee: ApprovedPayeeInspection;
    settlement: SettlementInspection;
  }>;
  expiresAt: bigint;
}>;
/** Immutable payment-time facts. The protected descriptor is accepted only to validate its commitment and is never returned. */
export type ReceiptEvidence = Readonly<{
  transactionHash: Hash;
  paymentId: Hex;
  obligationId: Hex;
  organization: Address;
  relationshipNode: Hex;
  relationshipTokenId: bigint;
  payeeId: Hex;
  settlementEpoch: bigint;
  settlementCommitment: Hex;
  amount: bigint;
  asset: Address;
  metadataHash: Hex;
  paymentTimeAuthority: Readonly<{
    securityRootCommitment: Hex;
    descriptor: SettlementDescriptorV1;
  }>;
}>;
export type ReceiptVerification = Readonly<{
  verificationStatus: "VERIFIED" | "INVALID" | "EVIDENCE_UNAVAILABLE";
  checks: readonly Readonly<{
    field: string;
    status: "MATCH" | "MISMATCH" | "UNAVAILABLE";
  }>[];
  event?: import("./events").BasinEvent;
}>;
export type ApprovalPreparation = Readonly<{
  protocolVersion: "1";
  stages: readonly Readonly<{
    requiredAuthority: "ORGANIZATION_ADMIN" | "PAYEE";
    calls: readonly PreparedCall[];
    typedData: TypedDataDefinition | null;
  }>[];
}>;
