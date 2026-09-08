/**
 * Set this to the reviewed, checked-in Sepolia deployment manifest before
 * enabling transaction execution. Treasury setup remains CONTROL_READY until
 * the manifest is configured.
 */
export const basinRouterManifest: null | {
  address: `0x${string}`;
  version: string;
  routinePerTransactionLimitBaseUnits: string;
  abi: ReviewedRouterAbi;
} = null;
import type { ReviewedRouterAbi } from "../treasury/policy";
