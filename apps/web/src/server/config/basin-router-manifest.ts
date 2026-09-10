import { basinRouterAbi } from "@basin/contracts";
import type { ReviewedRouterAbi } from "../treasury/policy";

/**
 * Set this to the reviewed, checked-in Sepolia deployment manifest before
 * enabling transaction execution. Treasury setup remains CONTROL_READY until
 * the manifest is configured.
 */
export const basinRouterManifest: null | {
  address: `0x${string}`;
  version: string;
  routinePerTransactionLimitBaseUnits: string;
  assetAddress: `0x${string}`;
  verifierAddress: `0x${string}`;
  runtimeCodeHash: `0x${string}`;
  abi: ReviewedRouterAbi;
} = {
  address: "0x38be3A868778DF3fC6E37c25EBc4cf29f81077b2",
  version: "1",
  routinePerTransactionLimitBaseUnits: "10000000",
  assetAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  verifierAddress: "0xb6b77926889b70b5a761cb3d82a28bec8e21624e",
  runtimeCodeHash:
    "0xd99c2104f630d8b5a8888b2de96b3fdad149d8d705b66698aa66e3470cd221f0",
  abi: basinRouterAbi as ReviewedRouterAbi,
};
