"use client";

import { useEffect, useRef } from "react";

import { Button } from "../button";

type IdentityClaimReviewProps = {
  name: string;
  canClaim: boolean;
  walletMessage?: string;
  onBack: () => void;
  onClaim: () => void;
};

export function IdentityClaimReview({
  name,
  canClaim,
  walletMessage,
  onBack,
  onClaim,
}: IdentityClaimReviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section aria-labelledby="identity-review-title">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">
        Review identity
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        id="identity-review-title"
        className="wrap-break-word border-l-4 border-accent-verdant pl-5 text-title font-semibold tracking-[-0.03em] outline-none"
      >
        {name}
      </h1>
      <p className="mt-6 text-lg font-medium">
        This will be your public Basin identity.
      </p>
      <div className="mt-5 max-w-lg space-y-2 text-ink-secondary">
        <p>Your Basin account will control this identity.</p>
        <p>Receiving details are added separately.</p>
      </div>
      {walletMessage ? (
        <p className="mt-5 text-sm text-state-warning">{walletMessage}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={onClaim} disabled={!canClaim}>
          Claim {name}
        </Button>
        <Button onClick={onBack}>Back</Button>
      </div>
    </section>
  );
}
