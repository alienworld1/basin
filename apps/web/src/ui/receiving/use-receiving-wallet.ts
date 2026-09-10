"use client";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import type { PreparedReceivingDto } from "../../shared/settlement-types";
export class ReceivingWalletError extends Error {
  constructor(
    public readonly code: "REJECTED" | "NOT_SUBMITTED" | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}
export function useReceivingWallet() {
  const { wallets, ready } = useWallets();
  const { sendTransaction } = useSendTransaction();
  return async (prepared: PreparedReceivingDto) => {
    if (!ready)
      throw new ReceivingWalletError(
        "NOT_SUBMITTED",
        "Your Basin account is still loading. Try again in a moment.",
      );
    const wallet = wallets.find(
      (item) =>
        item.address.toLowerCase() ===
          prepared.transaction.from.toLowerCase() &&
        item.connectorType === "embedded" &&
        item.walletClientType === "privy",
    );
    if (!wallet)
      throw new ReceivingWalletError(
        "NOT_SUBMITTED",
        `The Privy controller for this identity (${prepared.transaction.from}) is not available in this browser session. Refresh the page and try again.`,
      );
    try {
      // Privy's embedded-wallet API applies chainId itself. A manual wallet switch
      // creates a connector-style failure even though Basin has no external wallet.
      return await sendTransaction(
        {
          to: prepared.transaction.to,
          data: prepared.transaction.data,
          value: 0n,
          chainId: 11155111,
        },
        // Required when a Privy user has more than one embedded wallet.
        { address: wallet.address },
      );
    } catch (error) {
      if (error instanceof ReceivingWalletError) throw error;
      let source = error;
      for (let i = 0; i < 8 && source && typeof source === "object"; i++) {
        if ("code" in source && source.code === 4001)
          throw new ReceivingWalletError(
            "REJECTED",
            "You cancelled the change. Nothing was submitted.",
          );
        if (
          "message" in source &&
          typeof source.message === "string" &&
          /insufficient funds/i.test(source.message)
        )
          throw new ReceivingWalletError(
            "NOT_SUBMITTED",
            `Your Basin account ${wallet.address} needs Sepolia ETH for network fees. Nothing was submitted.`,
          );
        source = "cause" in source ? source.cause : null;
      }
      throw new ReceivingWalletError(
        "UNKNOWN",
        "Privy didn't return a transaction result. Check the status before trying again.",
      );
    }
  };
}
