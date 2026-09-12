import { animated, useReducedMotion, useSpring } from "@react-spring/web";

import type { PaymentReviewDto } from "../../shared/payment-types";
import { Button } from "../button";

export function PaymentReview({
  review,
  busy,
  expired,
  onPay,
  onRefresh,
  onBack,
}: {
  review: PaymentReviewDto;
  busy: boolean;
  expired: boolean;
  onPay: () => void;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [style] = useSpring(
    () => ({
      from: { opacity: 0, transform: "translateY(8px)" },
      to: { opacity: 1, transform: "translateY(0px)" },
      immediate: Boolean(reducedMotion),
      config: { tension: 210, friction: 26 },
    }),
    [reducedMotion],
  );
  return (
    <animated.section
      style={style}
      className="space-y-7"
      aria-labelledby="payment-review-heading"
    >
      <div>
        <p className="text-sm text-ink-tertiary">
          {review.organizationName} → {review.payeeName}
        </p>
        <h2 id="payment-review-heading" className="mt-2 text-2xl font-semibold">
          Review payment
        </h2>
      </div>
      {review.settlementUpdated ? (
        <div className="border-l-2 border-state-success pl-4 text-sm leading-relaxed text-ink-secondary">
          <p className="font-medium text-ink">
            {review.payeeName} updated their receiving details.
          </p>
          <p className="mt-1">
            Your organization&apos;s approval is unchanged. Basin will use the
            receiving authority verified for this review.
          </p>
        </div>
      ) : null}
      <div className="border-y border-line py-5">
        <p className="text-3xl font-semibold tabular-nums">
          {review.amount}{" "}
          <span className="text-lg text-ink-secondary">USDC</span>
        </p>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-ink-tertiary">Approved payee</dt>
            <dd className="mt-1 font-medium">{review.payeeName}</dd>
            <dd className="mt-1 text-ink-secondary">{review.payeeIdentity}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Purpose</dt>
            <dd className="mt-1">{review.purpose}</dd>
          </div>
          {review.reference ? (
            <div>
              <dt className="text-ink-tertiary">Reference</dt>
              <dd className="mt-1">{review.reference}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-ink-secondary">
        <p>
          {review.organizationName} controls whether this payee is approved.
        </p>
        <p>{review.payeeName} controls where they receive.</p>
        <p>Your payment access cannot change either decision.</p>
      </div>
      <p className="text-sm font-medium">
        {review.organizationName} will pay {review.payeeName} {review.amount}{" "}
        USDC for {review.purpose}.
      </p>
      {expired ? (
        <p className="text-sm leading-relaxed text-ink-secondary">
          This review expired before the payment was submitted. Refresh it to
          verify the latest receiving authority and payment access.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {expired ? (
          <Button disabled={busy} onClick={onRefresh}>
            {busy ? "Refreshing review…" : "Refresh payment review"}
          </Button>
        ) : (
          <Button disabled={busy} onClick={onPay}>
            {busy ? "Submitting payment…" : "Pay approved payee"}
          </Button>
        )}
        <Button disabled={busy} onClick={onBack}>
          Back
        </Button>
      </div>
    </animated.section>
  );
}
