import "server-only";
import {
  ENSV2_SEPOLIA_DEPLOYMENT,
  receivingAddress,
  SettlementError,
} from "@basin/ens";
import { getEnsServerEnvironment } from "../config/environment";
import { protectionKey } from "./protection";
export function receivingConfiguration() {
  try {
    const ens = getEnsServerEnvironment();
    const asset = receivingAddress(process.env.SETTLEMENT_ASSET_ADDRESS ?? "");
    const symbol = process.env.SETTLEMENT_ASSET_SYMBOL?.trim();
    if (!symbol || !/^[A-Za-z0-9 .-]{1,24}$/.test(symbol)) throw new Error();
    const secret = protectionKey();
    const forbidden = [
      ens.basinRegistryAddress,
      ...Object.values(ENSV2_SEPOLIA_DEPLOYMENT)
        .map(String)
        .filter((value) => value.startsWith("0x")),
    ];
    return {
      ens: {
        rpcUrl: ens.rpcUrl,
        basinRegistryAddress: ens.basinRegistryAddress,
      },
      asset,
      symbol,
      secret,
      forbidden,
    };
  } catch {
    throw new SettlementError(
      "UNVERIFIED",
      "Receiving setup is unavailable right now. Check again shortly.",
    );
  }
}
