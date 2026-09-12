import { ENSV2_SEPOLIA_DEPLOYMENT } from "@basin/ens";
import type { Address } from "viem";

/** The only production deployment supported by this SDK release. */
export const BASIN_SEPOLIA_V1 = {
  protocolVersion: "1",
  chainId: 11155111n,
  router: "0x38be3a868778df3fc6e37c25ebc4cf29f81077b2",
  activation: "0xC6a2FabD29a80b04b16bd72eFa7c3016213147b1",
  asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  basinRegistry: "0x2baf700279609FF4aF2ff473E290DDB219284332",
  ens: ENSV2_SEPOLIA_DEPLOYMENT,
} as const satisfies {
  protocolVersion: "1";
  chainId: bigint;
  router: Address;
  activation: Address;
  asset: Address;
  basinRegistry: Address;
  ens: typeof ENSV2_SEPOLIA_DEPLOYMENT;
};
export type BasinDeployment = typeof BASIN_SEPOLIA_V1;
