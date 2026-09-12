import type { ExpectedPaymentDetailDto } from "../../shared/expected-payment-types";
import { Button } from "../button";
import { formatExpectedAmount } from "./format-expected-amount";
import { ExpectedPaymentRelationshipUpdate } from "./expected-payment-relationship-update";

export function ExpectedPaymentDetail({
  detail,
  busy,
  onCancel,
  onRefreshRelationship,
  onAuthorize,
  onCheckAuthorization,
  onReviewPayment,
  onCheckPayment,
  onViewReceipt,
  onBack,
}: {
  detail: ExpectedPaymentDetailDto;
  busy: boolean;
  onCancel: () => void;
  onRefreshRelationship: () => void;
  onAuthorize: () => void;
  onCheckAuthorization?: () => void;
  onReviewPayment?: () => void;
  onCheckPayment?: () => void;
  onViewReceipt?: () => void;
  onBack: () => void;
}) {
  const cancelled = detail.status === "CANCELLED";
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-ink-tertiary">
          {detail.organizationName} → {detail.payeeName}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tabular-nums">
          {formatExpectedAmount(detail.amount)}{" "}
          <span className="text-lg text-ink-secondary">USDC</span>
        </h2>
      </div>
      <div className="border-y border-line py-5">
        <p
          className={`font-medium ${detail.status === "ATTENTION" ? "text-state-danger" : cancelled ? "text-ink-tertiary" : "text-ink"}`}
        >
          {detail.statusLabel}
        </p>
        {detail.attentionReason ? (
          <p className="mt-2 text-sm text-state-danger">
            {detail.attentionReason}
          </p>
        ) : null}
        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="text-ink-tertiary">Payee</dt>
            <dd className="mt-1 font-medium">{detail.payeeName}</dd>
            <dd className="mt-1 wrap-anywhere text-ink-secondary">
              {detail.payeeIdentity}
            </dd>
          </div>
          {detail.relationshipName ? (
            <div>
              <dt className="text-ink-tertiary">Relationship</dt>
              <dd className="mt-1 wrap-anywhere">{detail.relationshipName}</dd>
              <dd className="mt-1 text-xs text-ink-tertiary">
                {detail.generationLabel}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-ink-tertiary">Purpose</dt>
            <dd className="mt-1 wrap-break-word">{detail.purpose}</dd>
          </div>
          {detail.reference ? (
            <div>
              <dt className="text-ink-tertiary">Reference</dt>
              <dd className="mt-1 wrap-anywhere">{detail.reference}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-ink-tertiary">Recorded</dt>
            <dd className="mt-1">
              {new Date(detail.createdAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-sm leading-relaxed text-ink-secondary">
        {detail.authorityDescription}
      </p>
      {detail.relationshipUpdate ? (
        <ExpectedPaymentRelationshipUpdate
          payeeName={detail.payeeName}
          previousGenerationLabel={
            detail.relationshipUpdate.previousGenerationLabel
          }
          currentGenerationLabel={
            detail.relationshipUpdate.currentGenerationLabel
          }
          canAdopt={detail.relationshipUpdate.canAdopt}
          busy={busy}
          onAdopt={onRefreshRelationship}
        />
      ) : null}
      {detail.canCancel ? (
        <Button disabled={busy} onClick={onCancel}>
          {busy ? "Cancelling…" : "Cancel expected payment"}
        </Button>
      ) : null}
      {detail.canAuthorize ? (
        <Button disabled={busy} onClick={onAuthorize}>
          {busy ? "Authorizing payment…" : "Authorize payment"}
        </Button>
      ) : null}
      {detail.paymentAction?.canReview && onReviewPayment ? (
        <Button disabled={busy} onClick={onReviewPayment}>
          Review payment
        </Button>
      ) : null}
      {detail.paymentAction?.message ? (
        <div className="space-y-3"><p className="text-sm text-ink-secondary">{detail.paymentAction.message}</p>{detail.paymentAction.status === "PROCESSING" && onCheckPayment ? <Button disabled={busy} onClick={onCheckPayment}>Check payment status</Button> : null}</div>
      ) : null}
      {detail.status === "SATISFIED" && detail.receiptId && onViewReceipt ? <Button onClick={onViewReceipt}>View receipt</Button> : null}
      {detail.authorization &&
      ["SUBMITTED", "UNKNOWN_EXTERNAL_STATE"].includes(
        detail.authorization.status,
      ) &&
      onCheckAuthorization ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">
            {detail.authorization.message}
          </p>
          <Button disabled={busy} onClick={onCheckAuthorization}>
            Check authorization status
          </Button>
        </div>
      ) : null}
      {cancelled ? (
        <Button onClick={onBack}>Back to expected payments</Button>
      ) : null}
    </div>
  );
}
