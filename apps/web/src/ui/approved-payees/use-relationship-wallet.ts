"use client";

import { useSendTransaction, useWallets } from "@privy-io/react-auth";

import type { PreparedRelationshipDto } from "../../shared/approved-payee-types";

export function useRelationshipWallet() {
  const { wallets, ready } = useWallets();
  const { sendTransaction } = useSendTransaction();

  return {
    async sign(prepared: PreparedRelationshipDto) {
      const request = prepared.authorization;
      if (!request) throw new Error("The acceptance details are unavailable.");
      const wallet = wallets.find(
        (item) =>
          item.address.toLowerCase() === request.controller.toLowerCase() &&
          item.connectorType === "embedded" &&
          item.walletClientType === "privy",
      );
      if (!ready || !wallet) {
        throw new Error(
          "Sign in with the account that controls this identity to accept.",
        );
      }
      const provider = await wallet.getEthereumProvider();
      const payload = {
        domain: request.domain,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ...request.types,
        },
        primaryType: request.primaryType,
        message: request.message,
      };
      return (await provider.request({
        method: "eth_signTypedData_v4",
        params: [wallet.address, JSON.stringify(payload)],
      })) as `0x${string}`;
    },
    async submit(prepared: PreparedRelationshipDto) {
      if (!prepared.transaction)
        throw new Error("The activation transaction is unavailable.");
      return sendTransaction(
        {
          to: prepared.transaction.to,
          data: prepared.transaction.data,
          value: 0,
          chainId: 11155111,
        },
        { address: prepared.transaction.from },
      );
    },
  };
}
