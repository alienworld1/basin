"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type {
  InvitationAcceptance,
  InvitationReview as InvitationReviewResult,
} from "../../shared/payment-access-types";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";

const terminalCopy = {
  EXPIRED: {
    title: "This invitation has expired.",
    helper: "Ask an organization administrator for a new link.",
  },
  REVOKED: {
    title: "This invitation is no longer active.",
    helper:
      "Ask an organization administrator if you still need payment access.",
  },
  UNAVAILABLE: {
    title: "This invitation isn't available.",
    helper:
      "Check the link or ask an organization administrator for a new one.",
  },
} as const;

export function InvitationReview() {
  const auth = useBasinAuth();
  const router = useRouter();
  const params = useParams<{ secret: string }>();
  const secret = params.secret;
  const [review, setReview] = useState<InvitationReviewResult>();
  const [acceptance, setAcceptance] = useState<InvitationAcceptance>();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!auth.ready || !secret) return;
      setLoading(true);
      setError(undefined);
      try {
        const path = `/api/payment-operator-invitations/${encodeURIComponent(secret)}`;
        const response = auth.authenticated
          ? await authenticatedRequest(auth.getAccessToken, path, { signal })
          : await fetch(path, { cache: "no-store", signal });
        if (signal?.aborted) return;
        if (!response) throw new Error("Your session ended. Sign in again.");
        if (response.status === 401) {
          setReview({ state: "VALID", authenticated: false });
          return;
        }
        const body = (await response.json()) as InvitationReviewResult & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error);
        setReview(body);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : "We couldn't review this invitation. Try again.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [auth.authenticated, auth.getAccessToken, auth.ready, secret],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const accept = async () => {
    if (!review?.authenticated || review.state !== "VALID") return;
    const normalized = displayName.trim();
    if (review.needsDisplayName && (!normalized || normalized.length > 120)) {
      setError("Enter your name using 1 to 120 characters.");
      return;
    }
    setAccepting(true);
    setError(undefined);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        `/api/payment-operator-invitations/${encodeURIComponent(secret)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            review.needsDisplayName ? { displayName: normalized } : {},
          ),
        },
      );
      if (!response || response.status === 401) {
        setReview({ state: "VALID", authenticated: false });
        setError("Your session ended. Sign in again to continue.");
        return;
      }
      const body = (await response.json()) as InvitationAcceptance & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      if (body.state === "NAME_REQUIRED") {
        setReview({ ...review, needsDisplayName: true });
        return;
      }
      if (!("organizationName" in body)) {
        setReview({ state: body.state, authenticated: true });
        return;
      }
      setAcceptance(body);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "We couldn't add payment access. Try again.",
      );
    } finally {
      setAccepting(false);
    }
  };

  if (!auth.ready || loading) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-20"
      >
        <p role="status" className="text-sm text-ink-secondary">
          Reviewing invitation…
        </p>
      </main>
    );
  }

  if (acceptance && "organizationName" in acceptance) {
    const already = acceptance.state !== "ACCEPTED";
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-20"
      >
        <section className="w-full border-t border-line-strong pt-8">
          <p className="mb-3 text-sm font-medium text-state-success">
            {already ? "Access already active" : "Payment access added"}
          </p>
          <h1 className="text-title font-semibold tracking-[-0.03em]">
            {already
              ? "You already have payment access"
              : `Welcome to ${acceptance.organizationName}`}
          </h1>
          <p className="mt-5 text-ink-secondary">
            You can now prepare and execute approved Basin payments for this
            organization.
          </p>
          <Button
            className="mt-7"
            onClick={() =>
              router.push(`/app?workspace=${acceptance.workspaceId}`)
            }
          >
            Open {acceptance.organizationName}
          </Button>
        </section>
      </main>
    );
  }

  if (
    review?.state === "EXPIRED" ||
    review?.state === "REVOKED" ||
    review?.state === "UNAVAILABLE"
  ) {
    const state = review.state;
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-20"
      >
        <section className="w-full border-t border-line-strong pt-8">
          <p className="mb-3 text-sm font-medium text-ink-tertiary">
            Payment access
          </p>
          <h1 className="text-title font-semibold tracking-[-0.03em]">
            {terminalCopy[state].title}
          </h1>
          <p className="mt-5 text-ink-secondary">
            {terminalCopy[state].helper}
          </p>
        </section>
      </main>
    );
  }

  if (!review?.authenticated) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-20"
      >
        <section className="w-full border-t border-line-strong pt-8">
          <p className="mb-3 text-sm font-medium text-ink-tertiary">
            Payment access invitation
          </p>
          <h1 className="text-title font-semibold tracking-[-0.03em]">
            Sign in to review invitation
          </h1>
          <p className="mt-5 max-w-lg text-ink-secondary">
            Sign in with your own Basin account to see the organization and
            review the access being offered.
          </p>
          <Button
            className="mt-7"
            onClick={auth.login}
            disabled={!auth.configured}
          >
            Sign in to review invitation
          </Button>
          {auth.loginError || error ? (
            <p role="alert" className="mt-4 text-sm text-state-danger">
              {error ?? "We couldn't sign you in. Try again."}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  if (
    review.state === "ALREADY_MEMBER" ||
    review.state === "ALREADY_ACCEPTED"
  ) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-20"
      >
        <section className="w-full border-t border-line-strong pt-8">
          <p className="mb-3 text-sm font-medium text-state-success">
            Access already active
          </p>
          <h1 className="text-title font-semibold tracking-[-0.03em]">
            You already have access to {review.organizationName}
          </h1>
          <Button
            className="mt-7"
            onClick={() => router.push(`/app?workspace=${review.workspaceId}`)}
          >
            Open organization
          </Button>
        </section>
      </main>
    );
  }

  if (review.state !== "VALID") return null;

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-2xl items-center px-6 py-20"
    >
      <section className="w-full border-t border-line-strong pt-8">
        <p className="mb-3 text-sm font-medium text-ink-tertiary">
          Payment access invitation
        </p>
        <h1 className="text-title font-semibold tracking-[-0.03em]">
          Join {review.organizationName} as a payment operator
        </h1>
        <div className="mt-8 border-l-2 border-accent-verdant pl-5">
          <p className="text-sm leading-relaxed">
            You can prepare and execute approved Basin payments.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
            You cannot approve payees or change treasury controls.
          </p>
          <p className="mt-3 text-xs text-ink-tertiary">
            Invitation expires {new Date(review.expiresAt).toLocaleString()}.
          </p>
        </div>
        {review.needsDisplayName ? (
          <div className="mt-7">
            <label htmlFor="display-name" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="display-name"
              required
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="focus-ring mt-3 min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm"
            />
            <p className="mt-2 text-xs text-ink-tertiary">
              Shown to organization administrators. This is not identity
              verification.
            </p>
          </div>
        ) : null}
        <Button
          className="mt-8"
          onClick={() => void accept()}
          disabled={accepting}
        >
          {accepting ? "Adding payment access…" : "Accept payment access"}
        </Button>
        {accepting ? (
          <p role="status" className="mt-3 text-sm text-ink-secondary">
            Adding this organization to your account…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
