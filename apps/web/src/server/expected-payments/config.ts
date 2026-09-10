import "server-only";

import { address, DomainError } from "@basin/domain";

export function expectedPaymentAssetConfiguration() {
  const parsedAddress = address.safeParse(process.env.SETTLEMENT_ASSET_ADDRESS);
  if (
    !parsedAddress.success ||
    process.env.SETTLEMENT_ASSET_SYMBOL?.trim().toUpperCase() !== "USDC"
  ) {
    throw new DomainError(
      "UNAVAILABLE",
      "Expected payments are unavailable while the supported asset is being configured.",
    );
  }
  return {
    symbol: "USDC" as const,
    decimals: 6 as const,
    address: parsedAddress.data,
  };
}
