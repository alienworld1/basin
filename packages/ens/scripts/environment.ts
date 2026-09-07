import { getAddress } from "viem";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

export function readLiveEnvironment() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  const registry = process.env.ENSV2_BASIN_REGISTRY_ADDRESS?.trim();
  if (!rpcUrl || !registry) {
    throw new Error(
      "Set SEPOLIA_RPC_URL and ENSV2_BASIN_REGISTRY_ADDRESS before running this check.",
    );
  }
  return { rpcUrl, basinRegistryAddress: getAddress(registry) };
}
