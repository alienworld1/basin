import "server-only";

import { createPublicClient, getAddress, http } from "viem";
import { sepolia } from "viem/chains";

export type TreasuryBalance = {
  ethBalanceWei: string;
  checkedAt: Date;
};

export async function readTreasuryBalance(
  walletAddress: string,
): Promise<TreasuryBalance | undefined> {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (
    !rpcUrl ||
    !URL.canParse(rpcUrl) ||
    !["http:", "https:"].includes(new URL(rpcUrl).protocol)
  )
    return undefined;
  try {
    const balance = await createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }),
    }).getBalance({ address: getAddress(walletAddress) });
    return { ethBalanceWei: balance.toString(), checkedAt: new Date() };
  } catch {
    return undefined;
  }
}
