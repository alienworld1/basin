import type { ReceivingVersionDto } from "../../shared/settlement-types";
export function ReceivingHistory({
  versions,
}: {
  versions: ReceivingVersionDto[];
}) {
  if (!versions.length) return null;
  return (
    <details className="mt-8 border-t border-line pt-4">
      <summary className="focus-ring min-h-11 cursor-pointer text-sm font-medium">
        Receiving history
      </summary>
      <ol className="divide-y divide-line">
        {versions.map((version) => (
          <li key={version.commitment} className="space-y-2 py-4 text-sm">
            <p className="font-medium">Receiving version {version.epoch}</p>
            <p className="wrap-anywhere font-mono">
              {version.destination ?? "Receiving account unavailable"}
            </p>
            {version.verifiedAt ? (
              <p className="text-ink-secondary">
                Confirmed {new Date(version.verifiedAt).toLocaleString()}
              </p>
            ) : null}
            {version.transactionHash ? (
              <a
                className="focus-ring inline-flex min-h-11 items-center underline"
                href={`https://sepolia.etherscan.io/tx/${version.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
