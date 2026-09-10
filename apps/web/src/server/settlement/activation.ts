import "server-only";

import { basinRouterActivationAbi } from "@basin/contracts";
import { SettlementError } from "@basin/ens";
import { createPublicClient, http, namehash } from "viem";
import { sepolia } from "viem/chains";

import { approvedPayeeConfiguration } from "../approved-payees/config";
import type { ActivationReader } from "./service";

const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

/**
 * Reads the Router's current accepted root instead of trusting the database
 * projection when an active relationship changes its receiving account.
 */
export function createRouterActivationReader(): ActivationReader {
  const config = approvedPayeeConfiguration();
  const activation = config.activation;
  if (!activation) {
    return async () => {
      throw new SettlementError("UNVERIFIED");
    };
  }
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.ens.rpcUrl, { timeout: 8_000, retryCount: 1 }),
  });
  return async (context, observed) => {
    const root = context.root;
    if (!root || !context.relationship.relationship_name)
      throw new SettlementError("UNVERIFIED");
    try {
      const head = await client.getBlockNumber({ cacheTime: 0 });
      const accepted = await client.readContract({
        address: activation.address,
        abi: basinRouterActivationAbi,
        functionName: "acceptedRoot",
        args: [
          root.organization_wallet_address as `0x${string}`,
          namehash(context.relationship.relationship_name),
          observed.tokenId,
        ],
        blockNumber: head,
      });
      const expiry = BigInt(
        Math.floor(root.accepted_relationship_expiry.getTime() / 1000),
      );
      const active =
        root.acceptance_chain_id === 11155111 &&
        same(root.acceptance_verifying_contract, activation.address) &&
        same(accepted[0], root.security_root_commitment) &&
        same(accepted[1], root.payee_id) &&
        accepted[2] === expiry &&
        accepted[3] === BigInt(root.acceptance_nonce) &&
        observed.timestamp < accepted[2];
      return { commitment: accepted[0], active };
    } catch (error) {
      if (error instanceof SettlementError) throw error;
      throw new SettlementError("UNVERIFIED");
    }
  };
}
