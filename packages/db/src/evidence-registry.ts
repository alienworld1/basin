import { DomainError } from "@basin/domain";
// No application constructor exists yet. Modules 4/5/7/9 must register evidence only after
// their real protocol verification. Test producers live outside package exports.
export const evidenceKinds = new WeakMap<object, string>();
export function requireEvidence(value: object, kind: string) {
  if (!value || evidenceKinds.get(value) !== kind)
    throw new DomainError("INVALID_INPUT", "We couldn't verify this evidence.");
}
