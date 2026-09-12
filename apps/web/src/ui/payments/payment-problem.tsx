import type { PaymentExecutionDto } from "../../shared/payment-types";
import { Button } from "../button";

export function PaymentProblem({
  execution,
  busy,
  onReviewAgain,
  onCheck,
  onBack,
}: {
  execution: PaymentExecutionDto;
  busy: boolean;
  onReviewAgain: () => void;
  onCheck: () => void;
  onBack: () => void;
}) {
  const action = execution.problem?.action;
  return (
    <section className="space-y-7" aria-labelledby="payment-problem-heading">
      <div>
        <p className="text-sm font-medium text-state-danger">
          Payment needs attention
        </p>
        <h2
          id="payment-problem-heading"
          className="mt-2 text-2xl font-semibold"
        >
          This payment didn&apos;t continue
        </h2>
      </div>
      <p
        role="alert"
        className="border-y border-line py-5 text-sm leading-relaxed text-ink-secondary"
      >
        {execution.problem?.message ??
          "Review the current payment state before continuing."}
      </p>
      <div className="flex flex-wrap gap-3">
        {action === "REVIEW_AGAIN" ? (
          <Button disabled={busy} onClick={onReviewAgain}>
            {busy ? "Reviewing…" : "Review payment again"}
          </Button>
        ) : null}
        {action === "CHECK_STATUS" ? (
          <Button disabled={busy} onClick={onCheck}>
            {busy ? "Checking…" : "Check payment status"}
          </Button>
        ) : null}
        {action === "OPEN_PAYEE" ? (
          <a
            href="#approved-payees-heading"
            onClick={onBack}
            className="focus-ring inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm font-medium"
          >
            Review approved payee
          </a>
        ) : null}
        {action === "CONTACT_ADMIN" ? (
          <p className="text-sm text-ink-secondary">
            Ask an organization administrator to review the payment controls.
          </p>
        ) : null}
        <Button disabled={busy} onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  );
}
