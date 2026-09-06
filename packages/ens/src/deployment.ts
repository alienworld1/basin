import type { Address } from "viem";
import { BASIN_NAMESPACE } from "./names";

export const ENSV2_SEPOLIA_DEPLOYMENT = {
  chainId: 11155111,
  deployedAt: "2026-06-29T05:35:12.452Z",
  sourceCommit: "48b3e2d39513b9dd32ef1850877a29009bc807b9",
  rootRegistry: "0x11b5bfbe9078d826b1edbdd1cfc12f5828d9f50c",
  ethRegistry: "0x67b728a792e789a8978b30cf1b3b641f19354b43",
  verifiableFactory: "0x118bc31a50d559f7015a8da26d54b3b030cdb70f",
  permissionedResolverImplementation:
    "0x7e4b2d59938930168024201752ee5503df402303",
  userRegistryImplementation: "0x840fa461059862ea466a711e8c98c8de732061c0",
  namespace: BASIN_NAMESPACE,
} as const satisfies Record<string, string | number | Address>;

export type EnsDeploymentConfig = {
  rpcUrl: string;
  basinRegistryAddress: Address;
  registrarPrivateKey?: `0x${string}`;
};
