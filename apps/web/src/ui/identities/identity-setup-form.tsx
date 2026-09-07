"use client";

import { Button } from "../button";

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking"; name: string }
  | { status: "available"; name: string }
  | { status: "unavailable"; name: string }
  | { status: "error"; message: string; name?: string };

type IdentitySetupFormProps = {
  label: string;
  availability: AvailabilityState;
  onLabelChange: (label: string) => void;
  onBlur: () => void;
  onReview: () => void;
};

export function IdentitySetupForm({
  label,
  availability,
  onLabelChange,
  onBlur,
  onReview,
}: IdentitySetupFormProps) {
  const available = availability.status === "available";
  return (
    <section aria-labelledby="identity-setup-title">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">
        Personal identity
      </p>
      <h1
        id="identity-setup-title"
        className="text-title font-semibold tracking-[-0.03em]"
      >
        Choose your Basin identity
      </h1>
      <p className="mt-5 max-w-lg text-ink-secondary">
        This is the identity organizations will use to find you.
      </p>

      <div className="mt-10 max-w-xl">
        <label htmlFor="basin-identity" className="text-sm font-medium">
          Basin identity
        </label>
        <div className="mt-2 flex min-h-14 items-center rounded-sm border border-line-strong bg-surface-strong focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <input
            id="basin-identity"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            onBlur={onBlur}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="identity-availability"
            aria-invalid={availability.status === "error"}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-semibold outline-none"
          />
          <span className="shrink-0 border-l border-line px-4 py-3 text-lg font-semibold text-ink-secondary">
            .basin.eth
          </span>
        </div>
        <div
          id="identity-availability"
          className="mt-3 min-h-10 text-sm"
          aria-live="polite"
        >
          {availability.status === "checking" ? (
            <p className="text-ink-secondary">Checking availability…</p>
          ) : availability.status === "available" ? (
            <p className="text-state-success">
              Available ·{" "}
              <span className="font-medium">{availability.name}</span>
            </p>
          ) : availability.status === "unavailable" ? (
            <p className="text-state-danger">
              Already claimed · {availability.name}
            </p>
          ) : availability.status === "error" ? (
            <div role="alert">
              <p className="text-state-danger">{availability.message}</p>
            </div>
          ) : (
            <p className="text-ink-tertiary">
              Enter one name. The suffix stays fixed.
            </p>
          )}
        </div>
        <Button className="mt-4" disabled={!available} onClick={onReview}>
          Review identity
        </Button>
      </div>
    </section>
  );
}

export type { AvailabilityState };
