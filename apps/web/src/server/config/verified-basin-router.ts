import "server-only";

import { getAddress, keccak256, type Address } from "viem";

import { basinRouterAbi } from "@basin/contracts";
import { DomainError } from "@basin/domain";

import { getEnsServerEnvironment } from "./environment";
import { basinRouterManifest } from "./basin-router-manifest";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

/**
 * Checks public deployment facts before a payment flow prepares any authority.
 * It deliberately has no fallback address: a stale or replaced deployment is
 * unavailable until its checked-in manifest is reviewed.
 */
export async function verifiedBasinRouter() {
  const manifest = basinRouterManifest;
  if (!manifest) {
    throw new DomainError(
      "UNAVAILABLE",
      "Payment authorization is temporarily unavailable.",
    );
  }
  const environment = getEnsServerEnvironment();
  const client = createPublicClient({
    chain: sepolia,
    transport: http(environment.rpcUrl, { timeout: 8_000, retryCount: 1 }),
  });
  try {
    const address = getAddress(manifest.address);
    const [chainId, code, asset, verifier, version] = await Promise.all([
      client.getChainId(),
      client.getCode({ address }),
      client.readContract({ address, abi: basinRouterAbi, functionName: "asset" }),
      client.readContract({ address, abi: basinRouterAbi, functionName: "ensVerifier" }),
      client.readContract({ address, abi: basinRouterAbi, functionName: "VERSION" }),
    ]);
    if (
      chainId !== 11155111 ||
      !code ||
      keccak256(code) !== manifest.runtimeCodeHash ||
      getAddress(asset) !== getAddress(manifest.assetAddress) ||
      getAddress(verifier) !== getAddress(manifest.verifierAddress) ||
      version !== manifest.version
    ) {
      throw new Error("router manifest mismatch");
    }
    return { address, asset: getAddress(asset), version } as {
      address: Address;
      asset: Address;
      version: string;
    };
  } catch {
    throw new DomainError(
      "UNAVAILABLE",
      "Payment authorization is temporarily unavailable.",
    );
  }
}
