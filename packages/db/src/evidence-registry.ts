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
  value: import("./evidence").VerifiedRelationshipEnd extends infer T
    ? Omit<T & object, never>
    : never,
) {
  evidenceKinds.set(value, "relationshipEnd");
  return value as import("./evidence").VerifiedRelationshipEnd;
}
