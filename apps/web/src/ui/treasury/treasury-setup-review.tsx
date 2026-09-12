"use client";

import { useRef } from "react";
import { Button } from "../button";
import { Sheet } from "../sheet";

export function TreasurySetupReview({
  isOpen,
  mode,
  onClose,
  onConfirm,
  preparing,
  triggerRef,
  routineLimit,
}: {
  isOpen: boolean;
  mode: "account" | "payments";
  onClose: () => void;
  onConfirm: () => void;
  preparing: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  routineLimit?: string;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  return (
    <Sheet
      isOpen={isOpen}
      title={
        mode === "account"
          ? "Review treasury setup"
          : "Enable protected payments"
      }
      onClose={onClose}
      returnFocusRef={triggerRef}
    >
      <div ref={headingRef} className="space-y-8">
        <p className="text-sm leading-relaxed text-ink-secondary">
          {mode === "account"
            ? "Basin will prepare an organization account with separate control for treasury settings and routine payments."
            : "Basin will add a narrowly scoped payment rule to your existing organization account. It permits only approved Basin payments through the reviewed Router."}
        </p>
        <div className="border-y border-line py-6">
          <p className="text-sm font-semibold">
            Organization administrators control treasury settings.
          </p>
          <p className="mt-5 text-sm font-semibold">
            Payment operators can execute approved Basin payments.
          </p>
          <p className="mt-5 text-sm font-semibold">
            Receiving details remain controlled by each payee.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-ink-tertiary">Network</dt>
          <dd className="text-right font-medium">Ethereum Sepolia</dd>
          <dt className="text-ink-tertiary">Payment execution</dt>
          <dd className="text-right">
            {routineLimit
              ? "Basin payments only"
              : "Enabled when Basin payments are deployed"}
          </dd>
          {routineLimit ? (
            <>
              <dt className="text-ink-tertiary">Routine limit</dt>
              <dd className="text-right font-mono text-xs">
                {routineLimit} USDC base units
              </dd>
            </>
          ) : null}
        </dl>
        <p className="text-sm leading-relaxed text-ink-secondary">
          {routineLimit
            ? "Routine payment access is limited to the reviewed Basin payment action. Your approval also lets that Router pull USDC only when an approved obligation is executed."
            : "The organization account can be prepared now. Payment controls finish when Basin payments are enabled."}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            className="border-transparent bg-transparent"
            onClick={onClose}
            disabled={preparing}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={preparing}>
            {preparing
              ? mode === "account"
                ? "Preparing organization account…"
                : "Enabling protected payments…"
              : mode === "account"
                ? "Set up organization account"
                : "Approve protected payments"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
