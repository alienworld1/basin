"use client";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import type { PreparedReceivingDto } from "../../shared/settlement-types";
export class ReceivingWalletError extends Error {
  constructor(
    public readonly code: "REJECTED" | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}
export function useReceivingWallet() {
  const { wallets, ready } = useWallets();
  const { sendTransaction } = useSendTransaction();
  return async (prepared: PreparedReceivingDto) => {
    const wallet = wallets.find(
      (item) =>
        item.address.toLowerCase() === prepared.transaction.from.toLowerCase(),
    );
    if (!ready || !wallet)
      throw new ReceivingWalletError(
        "UNKNOWN",
        "Reconnect the account that controls this identity.",
      );
    try {
      if (wallet.chainId !== "eip155:11155111")
        await wallet.switchChain(11155111);
      const provider = await wallet.getEthereumProvider();
      if ((await provider.request({ method: "eth_chainId" })) !== "0xaa36a7")
        throw new ReceivingWalletError(
          "UNKNOWN",
          "Switch to Ethereum Sepolia to confirm this change.",
        );
      return await sendTransaction(
        {
          to: prepared.transaction.to,
          data: prepared.transaction.data,
          value: 0,
          chainId: 11155111,
        },
        { address: wallet.address },
      );
    } catch (error) {
      if (error instanceof ReceivingWalletError) throw error;
      let source = error;
      for (let i = 0; i < 8 && source && typeof source === "object"; i++) {
        if ("code" in source && source.code === 4001)
          throw new ReceivingWalletError(
            "REJECTED",
            "You cancelled wallet confirmation.",
          );
        if (
          "message" in source &&
          typeof source.message === "string" &&
          /insufficient funds/i.test(source.message)
        )
          throw new ReceivingWalletError(
            "UNKNOWN",
            "Your controller account needs Sepolia ETH to confirm this change.",
          );
        source = "cause" in source ? source.cause : null;
      }
      throw new ReceivingWalletError(
        "UNKNOWN",
        "We couldn't confirm the wallet result. Check again before trying another change.",
      );
    }
  };
}
