import { DomainError } from "@basin/domain";
import type {
  InitialIdentityEvidenceInput,
  VerifiedInitialIdentity,
} from "./evidence";
// Evidence constructors are added narrowly by the component that performs the real protocol check.
export const evidenceKinds = new WeakMap<object, string>();
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
