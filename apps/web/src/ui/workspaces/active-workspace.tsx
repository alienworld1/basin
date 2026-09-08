"use client";

import { useEffect, useRef, useState } from "react";

import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";
import type { WorkspaceSummary } from "../shell-types";
import type { IdentityTechnicalDetails } from "../../shared/identity-types";
import { PersonalIdentity } from "../identities/personal-identity";
import type { TreasuryTechnicalDetails } from "../../shared/treasury-types";
import { TreasuryControls } from "../treasury/treasury-controls";
import { PaymentAccess } from "../payment-access/payment-access";

export function ActiveWorkspace({
  workspace,
  userId,
  onIdentityDetailsChange,
  onPendingChange,
  onTreasuryDetailsChange,
  onTreasuryPendingChange,
  onSessionEnded,
  onAccessChanged,
}: {
  workspace: WorkspaceSummary;
  userId: string;
  onIdentityDetailsChange: (
    details: IdentityTechnicalDetails | undefined,
  ) => void;
  onPendingChange: (pending: boolean) => void;
  onTreasuryDetailsChange: (
    details: TreasuryTechnicalDetails | undefined,
  ) => void;
  onTreasuryPendingChange: (pending: boolean) => void;
  onSessionEnded: () => void;
  onAccessChanged: () => Promise<void>;
}) {
  const auth = useBasinAuth();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const personalIncomplete =
    workspace.type === "personal" && auth.walletStatus === "MISSING";
  const personalLoading =
    workspace.type === "personal" && auth.walletStatus === "LOADING";

  useEffect(() => {
    headingRef.current?.focus();
  }, [workspace.id]);

  if (
    workspace.type === "personal" &&
    (workspace.identity || (!personalIncomplete && !personalLoading))
  ) {
    return (
      <section className="border-t border-line-strong pt-8">
        <PersonalIdentity
          userId={userId}
          workspace={workspace}
          onIdentityDetailsChange={onIdentityDetailsChange}
          onPendingChange={onPendingChange}
        />
      </section>
    );
  }

  if (workspace.type === "organization") {
    return (
      <section className="border-t border-line-strong pt-8">
        <p className="mb-3 text-sm font-medium text-ink-tertiary">
          Organization workspace
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="wrap-break-word text-title font-semibold tracking-[-0.03em]"
        >
          {workspace.name}
        </h1>
        <TreasuryControls
          workspace={workspace}
          onTechnicalDetailsChange={onTreasuryDetailsChange}
          onPendingChange={onTreasuryPendingChange}
          onSessionEnded={onSessionEnded}
          onAccessChanged={onAccessChanged}
        />
        <PaymentAccess
          workspace={workspace}
          onSessionEnded={onSessionEnded}
          onAccessChanged={onAccessChanged}
        />
      </section>
    );
  }

  return (
    <section className="border-t border-line-strong pt-8">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">
        {workspace.type === "personal"
          ? "Personal workspace"
          : "Organization workspace"}
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="wrap-break-word text-title font-semibold tracking-[-0.03em]"
      >
        {workspace.name}
      </h1>
      <p
        className={`mt-6 text-sm font-medium ${personalIncomplete ? "text-state-warning" : personalLoading ? "text-ink-secondary" : "text-state-success"}`}
        role="status"
        aria-live="polite"
      >
        {personalIncomplete
          ? "Finish personal setup"
          : personalLoading
            ? "Opening your workspace…"
            : "Workspace ready"}
      </p>
      {personalIncomplete ? (
        <div className="mt-5">
          <p className="max-w-lg text-sm leading-relaxed text-ink-secondary">
            Prepare your personal account before continuing to identity setup.
          </p>
          <Button
            className="mt-4"
            disabled={preparing}
            onClick={async () => {
              setPreparing(true);
              setError(false);
              try {
                await auth.prepareWallet();
              } catch {
                setError(true);
              } finally {
                setPreparing(false);
              }
            }}
          >
            {preparing ? "Preparing your account…" : "Finish personal setup"}
          </Button>
          {error ? (
            <p className="mt-3 text-sm text-state-danger" role="alert">
              We couldn&apos;t prepare your personal account. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
