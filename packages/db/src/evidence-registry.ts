import { DomainError } from "@basin/domain";
import type {
  InitialIdentityEvidenceInput,
  VerifiedInitialIdentity,
} from "./evidence";
// Evidence constructors are added narrowly by the component that performs the real protocol check.
// Keep the registry stable across Next.js server-module reloads. A module-local
// WeakMap can be duplicated by the development bundler, causing evidence tagged
// by the verifier-facing import to be rejected by a repository loaded earlier.
const evidenceRegistryKey = Symbol.for("@basin/db/evidence-registry");
const evidenceScope = globalThis as typeof globalThis & {
  [evidenceRegistryKey]?: WeakMap<object, string>;
};
export const evidenceKinds = (evidenceScope[evidenceRegistryKey] ??=
  new WeakMap<object, string>());
export function requireEvidence(value: object, kind: string) {
  if (!value || evidenceKinds.get(value) !== kind)
    throw new DomainError("INVALID_INPUT", "We couldn't verify this evidence.");
}

export function attestInitialIdentity(value: InitialIdentityEvidenceInput) {
  evidenceKinds.set(value, "initialIdentity");
  return value as VerifiedInitialIdentity;
}

export function attestSettlementVersion(
  value: import("zod").z.input<
    typeof import("./inputs").settlementVersionInput
  >,
) {
  evidenceKinds.set(value, "settlementVersion");
  return value as import("./evidence").VerifiedSettlementVersion;
}

export function attestGeneration(
  value: import("zod").z.input<
    typeof import("./inputs").approvedPayeeGenerationInput
  > & { relationship_name: string },
) {
  evidenceKinds.set(value, "generation");
  return value as import("./evidence").VerifiedGeneration;
}

export function attestActivation(
  value: import("zod").z.input<
    typeof import("./inputs").approvedSecurityRootInput
  >,
) {
  evidenceKinds.set(value, "activation");
  return value as import("./evidence").VerifiedActivation;
}

export function attestRelationshipEnd(
  value: {
    approved_payee_id: bigint;
    generation_id: bigint;
    status: "REVOKED" | "EXPIRED" | "REAPPROVAL_REQUIRED";
    occurred_at: Date;
    cause?: string;
  },
) {
  evidenceKinds.set(value, "relationshipEnd");
  return value as import("./evidence").VerifiedRelationshipEnd;
}

export function attestObligation(
  value: import("zod").z.input<typeof import("./inputs").obligationInput>,
) {
  evidenceKinds.set(value, "obligation");
  return value as import("./evidence").VerifiedObligation;
}

export function attestExecution(value: { payment_id: bigint; execution_path: "ROUTINE_SIGNER" | "PRIVY_INTENT" }) {
  evidenceKinds.set(value, "execution");
  return value as import("./evidence").VerifiedExecution;
}

export function attestSettlement(value: {
  payment_id: bigint;
  snapshot: Record<string, unknown>;
  transaction_hash: string;
  block_number: string;
  settled_at: Date;
  chain_id: number;
  payer_organization_name: string;
  payee_display_name: string;
  asset_symbol: string;
}) {
  evidenceKinds.set(value as object, "settlement");
  return value as unknown as import("./evidence").VerifiedSettlement;
}
