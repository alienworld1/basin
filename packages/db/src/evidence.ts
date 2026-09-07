import "server-only";
import type { z } from "zod";
import type * as input from "./inputs";

declare const verified: unique symbol;
export type Verified<Kind extends string, Value> = Readonly<Value> & {
  readonly [verified]: Kind;
};
export type VerifiedIdentity = Verified<
  "identity",
  z.input<typeof input.basinIdentityInput>
>;
export type VerifiedIdentityAuthority = Verified<
  "identityAuthority",
  z.input<typeof input.identityAuthorityVersionInput>
>;
export type InitialIdentityEvidenceInput = {
  identity: z.input<typeof input.basinIdentityInput>;
  authority: Omit<
    z.input<typeof input.identityAuthorityVersionInput>,
    "basin_identity_id"
  >;
};
export type VerifiedInitialIdentity = Verified<
  "initialIdentity",
  InitialIdentityEvidenceInput
>;
export type VerifiedGeneration = Verified<
  "generation",
  z.input<typeof input.approvedPayeeGenerationInput> & {
    relationship_name: string;
  }
>;
export type VerifiedActivation = Verified<
  "activation",
  z.input<typeof input.approvedSecurityRootInput>
>;
export type VerifiedSettlementVersion = Verified<
  "settlementVersion",
  z.input<typeof input.settlementVersionInput>
>;
export type VerifiedRelationshipEnd = Verified<
  "relationshipEnd",
  {
    approved_payee_id: bigint;
    generation_id: bigint;
    status: "REVOKED" | "EXPIRED" | "REAPPROVAL_REQUIRED";
    occurred_at: Date;
    cause?: string;
  }
>;
export type VerifiedObligation = Verified<
  "obligation",
  z.input<typeof input.obligationInput>
>;
export type VerifiedObligationProjection = Verified<
  "obligationProjection",
  {
    obligation_record_id: bigint;
    status: "ACTIVE" | "CONSUMED" | "CANCELLED" | "EXPIRED";
    remaining_amount_base_units: string;
    creation_transaction_hash?: string;
    creation_block_number?: string;
    creation_log_index?: number;
  }
>;
export type VerifiedExecution = Verified<
  "execution",
  { payment_id: bigint; execution_path: "ROUTINE_SIGNER" | "PRIVY_INTENT" }
>;
export type VerifiedSettlement = Verified<
  "settlement",
  {
    payment_id: bigint;
    snapshot: z.input<typeof input.paymentAuthoritySnapshotInput>;
    transaction_hash: string;
    block_number: string;
    settled_at: Date;
    chain_id: number;
    payer_organization_name: string;
    payee_display_name: string;
    asset_symbol: string;
  }
>;
