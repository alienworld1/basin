import type { ExpectedPaymentDetailDto } from "../../shared/expected-payment-types";

export function PaymentReceiptHandoff({
  detail,
}: {
  detail: ExpectedPaymentDetailDto;
}) {
  return (
    <section className="space-y-6" aria-labelledby="receipt-handoff-heading">
      <div>
        <p className="text-sm text-state-success">Payment settled</p>
        <h2
          id="receipt-handoff-heading"
          className="mt-2 text-2xl font-semibold"
        >
          {detail.organizationName} paid {detail.payeeName}.
        </h2>
      </div>
      <div className="border-y border-line py-5">
        <p className="text-2xl font-semibold tabular-nums">
          {detail.amount}{" "}
          <span className="text-base text-ink-secondary">USDC</span>
        </p>
        <p className="mt-3 text-sm text-ink-secondary">{detail.purpose}</p>
        {detail.reference ? (
          <p className="mt-1 text-sm text-ink-secondary">{detail.reference}</p>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-ink-secondary">
        Basin verified the approved payee, receiving authority, and settlement
        before creating this receipt.
      </p>
      {detail.receiptId ? (
        <p className="font-mono text-xs text-ink-tertiary">
          Receipt {detail.receiptId}
        </p>
      ) : null}
    </section>
  );
}
