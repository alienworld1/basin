"use client";

import { Button } from "../button";

type IdentityProgressProps = {
  name: string;
  phase: "SUBMITTING" | "CONFIRMING" | "VERIFYING" | "CHECKING";
  message?: string;
  onCheckAgain?: () => void;
};

const phaseCopy = {
  SUBMITTING: "Submitting identity…",
  CONFIRMING: "Waiting for Sepolia…",
  VERIFYING: "Verifying identity…",
  CHECKING: "Checking your identity…",
} as const;

export function IdentityProgress({
  name,
  phase,
  message,
  onCheckAgain,
}: IdentityProgressProps) {
  return (
    <section aria-labelledby="identity-progress-title">
      <p
        className="mb-3 text-sm font-medium text-state-warning"
        role="status"
        aria-live="polite"
      >
        {phaseCopy[phase]}
      </p>
      <h1
        id="identity-progress-title"
        className="wrap-break-word border-l-4 border-accent-gold pl-5 text-title font-semibold tracking-[-0.03em]"
      >
        {name}
      </h1>
      <p className="mt-6 max-w-lg text-ink-secondary">
        {message ??
          (phase === "VERIFYING"
            ? "Basin is checking the confirmed protocol state before activating your identity."
            : "Your request can continue onchain if you leave this workspace.")}
      </p>
      {onCheckAgain ? (
        <Button className="mt-6" onClick={onCheckAgain}>
          Check again
        </Button>
      ) : null}
    </section>
  );
}
