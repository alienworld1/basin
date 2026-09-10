import { formatEther } from "viem";

import type { TreasurySummary } from "../../shared/treasury-types";

function displayEthBalance(balanceWei: string) {
  const [whole, fraction = ""] = formatEther(BigInt(balanceWei)).split(".");
  const visibleFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return visibleFraction ? `${whole}.${visibleFraction}` : whole;
}

export function TreasuryWalletSummary({
  account,
}: {
  account: NonNullable<TreasurySummary["account"]>;
}) {
  return (
    <div className="mt-6 border-y border-line py-5 sm:flex sm:items-end sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">Organization wallet</p>
        <p className="mt-1 text-xs text-ink-tertiary">Ethereum Sepolia</p>
        <p className="mt-3 break-all font-mono text-xs leading-relaxed text-ink-secondary">
          {account.address}
        </p>
      </div>
      <div className="mt-5 shrink-0 sm:mt-0 sm:text-right">
        <p className="text-xs font-medium text-ink-tertiary">Gas balance</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
          {account.ethBalanceWei
            ? displayEthBalance(account.ethBalanceWei)
            : "Unavailable"}
          {account.ethBalanceWei ? (
            <span className="ml-1 text-sm font-medium text-ink-secondary">
              ETH
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
