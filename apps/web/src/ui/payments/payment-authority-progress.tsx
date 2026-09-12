import { animated, useReducedMotion, useSpring } from "@react-spring/web";

import type {
  PaymentExecutionDto,
  PaymentValidationStep,
} from "../../shared/payment-types";
import { Button } from "../button";

const steps: Array<{ id: PaymentValidationStep; label: string }> = [
  { id: "APPROVED_PAYEE", label: "Approved payee" },
  { id: "RECEIVING_AUTHORITY", label: "Receiving authority" },
  { id: "PAYMENT_ACCESS", label: "Payment access" },
  { id: "SETTLEMENT_CONFIRMATION", label: "Settlement confirmation" },
];

export function PaymentAuthorityProgress({
  execution,
  busy,
  onCheck,
}: {
  execution: PaymentExecutionDto;
  busy: boolean;
  onCheck: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const spring = useSpring({
    opacity: 1,
    from: { opacity: 0 },
    immediate: Boolean(reducedMotion),
    config: { tension: 220, friction: 28 },
  });
  const current = execution.step
    ? steps.findIndex((step) => step.id === execution.step)
    : 0;
  const submitted = execution.status === "SUBMITTED";
  const unresolved = execution.status === "UNKNOWN_EXTERNAL_STATE";
  const awaitingApproval = execution.status === "AWAITING_APPROVAL";
  return (
    <animated.section
      style={spring}
      className="space-y-7"
      aria-labelledby="payment-progress-heading"
      aria-busy={
        !unresolved && !awaitingApproval && execution.status !== "PREPARED"
      }
    >
      <div>
        <p className="text-sm text-ink-tertiary">Payment in progress</p>
        <h2
          id="payment-progress-heading"
          className="mt-2 text-2xl font-semibold"
        >
          {unresolved
            ? "Payment status needs a check"
            : submitted
              ? "Confirming settlement"
              : awaitingApproval
                ? "Waiting for treasury approval"
                : "Checking payment authority"}
        </h2>
      </div>
      <ol className="border-y border-line py-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex min-h-12 items-center justify-between gap-4 border-b border-line/70 py-3 last:border-0 ${index === current ? "text-ink" : "text-ink-tertiary"}`}
          >
            <span>{step.label}</span>
            <span className="text-sm">
              {index < current
                ? "Checked"
                : index === current
                  ? unresolved
                    ? "Needs check"
                    : "Checking"
                  : "Waiting"}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm leading-relaxed text-ink-secondary">
        {awaitingApproval
          ? "The scoped payment request is waiting for approval. Basin won't switch to another signer."
          : (execution.problem?.message ??
            (submitted
              ? "Payment submitted. We're confirming the verified settlement."
              : "Basin is checking the payer, payee, and payment access before settlement."))}
      </p>
      {submitted || unresolved ? (
        <Button disabled={busy} onClick={onCheck}>
          {busy ? "Checking status…" : "Check payment status"}
        </Button>
      ) : null}
    </animated.section>
  );
}
