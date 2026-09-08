import { getAddress } from "viem";
import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(fileURLToPath(new URL("../../../", import.meta.url)), true);

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
