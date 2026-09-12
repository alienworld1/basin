import "server-only";

import { createPublicClient, getAddress, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

export type TreasuryBalance = {
  ethBalanceWei: string;
  usdcBalanceBaseUnits?: string;
  routerAllowanceBaseUnits?: string;
  checkedAt: Date;
};

const erc20ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

function treasuryClient(rpcUrl: string) {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }),
  });
}

export async function readTreasuryBalance(
  walletAddress: string,
  token?: { assetAddress: string; routerAddress: string },
): Promise<TreasuryBalance | undefined> {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (
    !rpcUrl ||
    !URL.canParse(rpcUrl) ||
    !["http:", "https:"].includes(new URL(rpcUrl).protocol)
  )
    return undefined;
  try {
    const client = treasuryClient(rpcUrl);
    const wallet = getAddress(walletAddress);
    const [balance, usdcBalance, routerAllowance] = await Promise.all([
      client.getBalance({ address: wallet }),
      token
        ? client.readContract({
            address: getAddress(token.assetAddress),
            abi: erc20ReadAbi,
            functionName: "balanceOf",
            args: [wallet],
          })
        : undefined,
      token
        ? client.readContract({
            address: getAddress(token.assetAddress),
            abi: erc20ReadAbi,
            functionName: "allowance",
            args: [wallet, getAddress(token.routerAddress)],
          })
        : undefined,
    ]);
    return {
      ethBalanceWei: balance.toString(),
      ...(usdcBalance !== undefined
        ? { usdcBalanceBaseUnits: usdcBalance.toString() }
        : {}),
      ...(routerAllowance !== undefined
        ? { routerAllowanceBaseUnits: routerAllowance.toString() }
        : {}),
      checkedAt: new Date(),
    };
  } catch {
    return undefined;
  }
}

export async function confirmTreasuryAllowance(
  transactionHash: string,
  walletAddress: string,
  token: { assetAddress: string; routerAddress: string },
  minimum: string,
) {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl || !URL.canParse(rpcUrl)) return false;
  try {
    const receipt = await treasuryClient(rpcUrl).waitForTransactionReceipt({
      hash: transactionHash as Hex,
      confirmations: 2,
      timeout: 60_000,
    });
    if (receipt.status !== "success") return false;
    const balance = await readTreasuryBalance(walletAddress, token);
    return (
      balance?.routerAllowanceBaseUnits !== undefined &&
      BigInt(balance.routerAllowanceBaseUnits) >= BigInt(minimum)
    );
  } catch {
    return false;
  }
}
