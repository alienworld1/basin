import { evidenceKinds } from "../src/evidence-registry";
import type { Verified } from "../src/evidence";

// Relative test import only; no package export, route, or environment flag can mint proof.
export function fixtureEvidence<K extends string, T extends object>(
  kind: K,
  value: T,
): Verified<K, T> {
  const copy = structuredClone(value);
  evidenceKinds.set(copy, kind);
  return Object.freeze(copy) as Verified<K, T>;
}
