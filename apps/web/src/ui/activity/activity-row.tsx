import { Button } from "../button";
import type { ActivityRowDto } from "../../shared/activity-types";

export function ActivityRow({
  row,
  onViewReceipt,
  onViewExpectedPayment,
}: {
  row: ActivityRowDto;
  onViewReceipt: (receiptId: string) => void;
  onViewExpectedPayment: (expectedPaymentId: string) => void;
}) {
  return (
    <li className="grid gap-3 border-b border-line py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-medium wrap-break-word">
          {row.direction === "OUTGOING" ? "Paid" : "Received"} ·{" "}
          {row.counterpartyName}
        </p>
        <p className="mt-1 wrap-break-word text-sm text-ink-secondary">
          {row.purpose}
          {row.reference ? ` · ${row.reference}` : ""}
        </p>
        <p className="mt-1 text-xs text-ink-tertiary">
          {new Date(row.occurredAt).toLocaleString()}
        </p>
      </div>
      <div className="text-left sm:text-right">
        <p className="font-medium tabular-nums">{row.amount} USDC</p>
        <p
          className={`mt-1 text-sm ${row.status === "ATTENTION" || row.status === "FAILED" ? "text-state-danger" : "text-ink-secondary"}`}
        >
          {row.statusLabel}
        </p>
        {row.safeReason ? (
          <p className="mt-1 text-xs text-ink-secondary">{row.safeReason}</p>
        ) : null}
      </div>
      {row.receiptId ? (
        <Button
          className="w-full sm:w-auto"
          onClick={() => onViewReceipt(row.receiptId!)}
        >
          View receipt
        </Button>
      ) : row.expectedPaymentId ? (
        <button
          type="button"
          className="focus-ring min-h-11 text-sm font-medium underline underline-offset-4"
          onClick={() => onViewExpectedPayment(row.expectedPaymentId!)}
        >
          View expected payment
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
    </li>
  );
}
