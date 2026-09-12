"use client";

import { animated, useReducedMotion, useSpring } from "@react-spring/web";
import { useAuthorizationSignature } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceSummary } from "../shell-types";
import type {
  TreasuryStatusResponse,
  TreasuryTechnicalDetails,
} from "../../shared/treasury-types";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";
import { TreasurySetupReview } from "./treasury-setup-review";
import { TreasuryWalletSummary } from "./treasury-wallet-summary";

const setupKey = (workspaceId: string) => `basin:treasury-setup:${workspaceId}`;

export function TreasuryControls({
  workspace,
  onTechnicalDetailsChange,
  onPendingChange,
  onSessionEnded,
  onAccessChanged,
}: {
  workspace: WorkspaceSummary;
  onTechnicalDetailsChange: (details?: TreasuryTechnicalDetails) => void;
  onPendingChange: (pending: boolean) => void;
  onSessionEnded: () => void;
  onAccessChanged: () => Promise<void>;
}) {
  const auth = useBasinAuth();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const [result, setResult] = useState<TreasuryStatusResponse>();
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<"account" | "payments">(
    "account",
  );
  const [requestError, setRequestError] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({
    onTechnicalDetailsChange,
    onPendingChange,
    onSessionEnded,
    onAccessChanged,
  });
  const reducedMotion = useReducedMotion();
  const reveal = useSpring({
    opacity: result ? 1 : 0,
    transform: result ? "translate3d(0,0,0)" : "translate3d(0,8px,0)",
    immediate: Boolean(reducedMotion),
    config: { tension: 260, friction: 32, clamp: true },
  });

  useEffect(() => {
    callbacksRef.current = {
      onTechnicalDetailsChange,
      onPendingChange,
      onSessionEnded,
      onAccessChanged,
    };
  }, [
    onAccessChanged,
    onPendingChange,
    onSessionEnded,
    onTechnicalDetailsChange,
  ]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (signal.aborted) return;
      setLoading(true);
      setRequestError(undefined);
      try {
        const response = await authenticatedRequest(
          auth.getAccessToken,
          `/api/treasury/status?workspace=${encodeURIComponent(workspace.id)}`,
          { signal },
        );
        if (signal.aborted) return;
        if (!response) throw new Error();
        if (response.status === 401)
          return callbacksRef.current.onSessionEnded();
        if (response.status === 403) {
          await callbacksRef.current.onAccessChanged();
          return;
        }
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error);
        }
        const next = (await response.json()) as TreasuryStatusResponse;
        if (signal.aborted) return;
        setResult(next);
        callbacksRef.current.onTechnicalDetailsChange(next.technical);
        callbacksRef.current.onPendingChange(
          next.summary.operation?.approvalPending ?? false,
        );
      } catch {
        if (signal.aborted) return;
        setRequestError(
          "We couldn't verify treasury controls right now. Try again shortly.",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [auth.getAccessToken, workspace.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => {
      controller.abort();
      callbacksRef.current.onTechnicalDetailsChange(undefined);
      callbacksRef.current.onPendingChange(false);
    };
  }, [load]);

  const mutate = async (
    kind: "setup" | "reconcile",
    authorization?: { signature: string; requestExpiry: number },
  ) => {
    setMutating(true);
    setRequestError(undefined);
    let key = sessionStorage.getItem(setupKey(workspace.id));
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem(setupKey(workspace.id), key);
    }
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        `/api/treasury/${kind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            idempotencyKey: key,
            ...(authorization
              ? {
                  walletAuthorizationSignature: authorization.signature,
                  walletAuthorizationExpiry: authorization.requestExpiry,
                }
              : {}),
          }),
        },
      );
      if (!response) throw new Error();
      if (response.status === 401) return onSessionEnded();
      if (response.status === 403) return onAccessChanged();
      const body = (await response.json()) as TreasuryStatusResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setResult(body);
      onTechnicalDetailsChange(body.technical);
      onPendingChange(body.summary.operation?.approvalPending ?? false);
      if (body.walletAuthorization) {
        const { signature } = await generateAuthorizationSignature(
          body.walletAuthorization.request,
        );
        await mutate("setup", {
          signature,
          requestExpiry: body.walletAuthorization.requestExpiry,
        });
        return;
      }
      if (
        !["FAILED", "PROVISIONING", "AWAITING_APPROVAL"].includes(
          body.summary.status,
        )
      ) {
        sessionStorage.removeItem(setupKey(workspace.id));
      }
      setReviewOpen(false);
      queueMicrotask(() => headingRef.current?.focus());
    } catch (error) {
      setRequestError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't finish treasury setup. Your completed steps are saved.",
      );
    } finally {
      setMutating(false);
    }
  };

  const status = result?.summary.status;
  const isAdmin = workspace.role === "ADMIN";
  let title = "Set up treasury controls";
  let helper =
    "Create an organization account for Basin payments. Administrators control settings; payment operators receive limited access.";
  if (status === "CONTROL_READY") {
    title = "Organization account ready";
    helper = isAdmin
      ? "Enable protected payments to allow only approved Basin payments through the reviewed Router."
      : "An organization administrator needs to enable protected payments before payment operators can continue.";
  } else if (status === "READY") {
    title = "Treasury controls ready";
    helper =
      "Payment operators can execute only approved Basin payments within the configured limit.";
  } else if (status === "PROVISIONING") {
    title = "Preparing organization account…";
    helper =
      "Completed setup steps are saved as the organization account is verified.";
  } else if (status === "AWAITING_APPROVAL") {
    title = "Organization approval required";
    helper =
      "An organization administrator must approve this treasury change before setup can continue.";
  } else if (status === "NEEDS_ATTENTION") {
    title = "Treasury controls need attention";
    helper =
      "Payments are paused until the organization settings are verified.";
  } else if (status === "FAILED") {
    title = "We couldn't finish treasury setup";
    helper = "Your completed steps are saved.";
  }

  return (
    <section
      className="mt-12 border-t border-line pt-8"
      aria-labelledby="treasury-heading"
    >
      <h2
        id="treasury-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold"
      >
        Treasury controls
      </h2>
      {loading && !result ? (
        <p
          className="mt-6 text-sm text-ink-secondary"
          role="status"
          aria-live="polite"
        >
          Checking treasury controls…
        </p>
      ) : (
        <animated.div
          style={reveal}
          className="mt-6 grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        >
          <div>
            <p
              className={`text-sm font-medium ${status === "READY" || status === "CONTROL_READY" ? "text-state-success" : status === "NEEDS_ATTENTION" || status === "FAILED" ? "text-state-danger" : "text-ink"}`}
              role="status"
              aria-live="polite"
            >
              {title}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-secondary">
              {helper}
            </p>
            <p className="mt-4 text-sm text-ink-tertiary">Ethereum Sepolia</p>
          </div>
          <div className="border-l border-line pl-5">
            <p className="text-sm font-medium">
              Your role: {isAdmin ? "Administrator" : "Payment operator"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              {isAdmin
                ? "You control treasury settings. Payment operators receive limited access and cannot change these controls."
                : "You can execute approved Basin payments. You cannot change treasury controls or pay arbitrary addresses."}
            </p>
          </div>
        </animated.div>
      )}
      {result?.summary.account ? (
        <TreasuryWalletSummary account={result.summary.account} />
      ) : null}
      {requestError ? (
        <p className="mt-5 text-sm text-state-danger" role="alert">
          {requestError}
        </p>
      ) : null}
      {!loading && isAdmin ? (
        <div className="mt-6">
          {status === "NOT_STARTED" || !status ? (
            <Button
              ref={triggerRef}
              onClick={() => {
                setReviewMode("account");
                setReviewOpen(true);
              }}
              disabled={mutating}
            >
              Review setup
            </Button>
          ) : status === "FAILED" ? (
            <Button onClick={() => void mutate("setup")} disabled={mutating}>
              {mutating ? "Resuming setup…" : "Resume setup"}
            </Button>
          ) : status === "CONTROL_READY" && result?.summary.routerConfigured ? (
            <Button
              onClick={() => {
                setReviewMode("payments");
                setReviewOpen(true);
              }}
              disabled={mutating}
            >
              {mutating
                ? "Enabling protected payments…"
                : "Enable protected payments"}
            </Button>
          ) : status === "PROVISIONING" &&
            result?.summary.operation?.step === "POLICY_VERIFIED" ? (
            <Button
              onClick={() => {
                setReviewMode("payments");
                setReviewOpen(true);
              }}
              disabled={mutating}
            >
              {mutating
                ? "Requesting approval…"
                : "Retry protected-payment approval"}
            </Button>
          ) : status === "NEEDS_ATTENTION" ? (
            <Button
              onClick={() => void mutate("reconcile")}
              disabled={mutating}
            >
              {mutating ? "Checking controls…" : "Check controls"}
            </Button>
          ) : status === "AWAITING_APPROVAL" ? (
            <Button
              onClick={() => void mutate("reconcile")}
              disabled={mutating}
            >
              {mutating ? "Checking approval…" : "Check approval"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <TreasurySetupReview
        isOpen={reviewOpen}
        mode={reviewMode}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => void mutate("setup")}
        preparing={mutating}
        triggerRef={triggerRef}
        routineLimit={result?.summary.routineLimit}
      />
    </section>
  );
}
