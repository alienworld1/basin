import type { Address } from "viem";
import { BASIN_NAMESPACE } from "./names";

export const ENSV2_SEPOLIA_DEPLOYMENT = {
  chainId: 11155111,
  deployedAt: "2026-06-29T05:35:12.452Z",
  sourceCommit: "48b3e2d39513b9dd32ef1850877a29009bc807b9",
  rootRegistry: "0x8115186e8f2e0b0281e86ab91f0f48ba90364354",
  ethRegistry: "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2",
  verifiableFactory: "0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef",
  permissionedResolverImplementation:
    "0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e",
  userRegistryImplementation: "0x624a25d67b59d587752ebec8dded8827dae52050",
  namespace: BASIN_NAMESPACE,
} as const satisfies Record<string, string | number | Address>;

export type EnsDeploymentConfig = {
  rpcUrl: string;
  basinRegistryAddress: Address;
  registrarPrivateKey?: `0x${string}`;
};
