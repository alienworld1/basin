import "server-only";

import { getAddress, type Address } from "viem";

import { getEnsServerEnvironment } from "../config/environment";
import { basinRouterManifest } from "../config/basin-router-manifest";

/**
 * Relationship acceptance and payment authorization must use the same reviewed
 * Router deployment. Keeping this derived from the manifest prevents an
 * approval from becoming unusable when only one of the two configurations is
 * updated.
 */
export function approvalRouterConfiguration():
  | { address: Address; version: string }
  | undefined {
  if (!basinRouterManifest) return undefined;
  return {
    address: getAddress(basinRouterManifest.address),
    version: basinRouterManifest.version,
  };
}

export function approvedPayeeConfiguration() {
  const ens = getEnsServerEnvironment();
  return {
    ens,
    activation: approvalRouterConfiguration(),
  };
}
