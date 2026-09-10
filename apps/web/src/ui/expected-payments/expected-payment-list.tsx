import type { ExpectedPaymentRowDto } from "../../shared/expected-payment-types";
import { formatExpectedAmount } from "./format-expected-amount";

function statusColor(status: ExpectedPaymentRowDto["status"]) {
  if (status === "READY" || status === "SATISFIED") return "text-state-success";
  if (status === "ATTENTION") return "text-state-danger";
  if (status === "CANCELLED") return "text-ink-tertiary";
  return "text-ink-secondary";
}

export function ExpectedPaymentList({
  rows,
  onSelect,
}: {
  rows: ExpectedPaymentRowDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="mt-5 divide-y divide-line border-y border-line">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className="focus-ring grid min-h-20 w-full min-w-0 gap-x-5 gap-y-2 py-4 text-left md:grid-cols-[minmax(8rem,1.1fr)_auto_minmax(10rem,2fr)_auto] md:items-start"
            onClick={() => onSelect(row.id)}
          >
            <span className="min-w-0">
              <span className="block wrap-anywhere font-medium">
                {row.counterpartyName}
              </span>
              {row.counterpartyIdentity ? (
                <span className="mt-1 block wrap-anywhere text-xs text-ink-tertiary">
                  {row.counterpartyIdentity}
                </span>
              ) : row.relationshipName ? (
                <span className="mt-1 block wrap-anywhere text-xs text-ink-tertiary">
                  {row.relationshipName}
                </span>
              ) : null}
            </span>
            <span className="text-lg font-semibold tabular-nums md:text-right">
              {formatExpectedAmount(row.amount)}{" "}
              <span className="text-sm font-medium text-ink-secondary">
                USDC
              </span>
            </span>
            <span className="min-w-0">
              <span className="block wrap-break-word text-sm">
                {row.purpose}
              </span>
              {row.reference ? (
                <span className="mt-1 block wrap-anywhere text-xs text-ink-tertiary">
                  {row.reference}
                </span>
              ) : null}
            </span>
            <span
              className={`text-sm font-medium md:text-right ${statusColor(row.status)}`}
            >
              {row.statusLabel}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
