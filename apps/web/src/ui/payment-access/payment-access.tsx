"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  InvitationLinkResult,
  PaymentAccessOverview,
} from "../../shared/payment-access-types";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";
import { Sheet } from "../sheet";
import type { WorkspaceSummary } from "../shell-types";

function newIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function invitationStatus(expiresAt: string, status: "PENDING" | "EXPIRED") {
  if (status === "EXPIRED") return "Expired";
  return new Date(expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000
    ? "Expires soon"
    : "Pending";
}

const eventLabels: Record<
  PaymentAccessOverview["activity"][number]["type"],
  string
> = {
  INVITED: "Invitation created",
  INVITATION_REVOKED: "Invitation revoked",
  INVITATION_EXPIRED: "Invitation expired",
  JOINED: "Payment access added",
  REINSTATED: "Payment access restored",
  REMOVED: "Payment access removed",
  LEFT: "Operator left organization",
};

export function PaymentAccess({
  workspace,
  onSessionEnded,
  onAccessChanged,
}: {
  workspace: WorkspaceSummary;
  onSessionEnded: () => void;
  onAccessChanged: () => Promise<void>;
}) {
  const auth = useBasinAuth();
  const [overview, setOverview] = useState<PaymentAccessOverview>();
  const [loading, setLoading] = useState(workspace.role === "ADMIN");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [sheet, setSheet] = useState<"invite" | "remove" | "leave" | null>(
    null,
  );
  const [inviteeLabel, setInviteeLabel] = useState("");
  const [invitationResult, setInvitationResult] =
    useState<InvitationLinkResult>();
  const [copied, setCopied] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [removeTarget, setRemoveTarget] =
    useState<PaymentAccessOverview["operators"][number]>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const invitationKeyRef = useRef<string | undefined>(undefined);
  const callbacksRef = useRef({ onSessionEnded, onAccessChanged });

  useEffect(() => {
    callbacksRef.current = { onSessionEnded, onAccessChanged };
  }, [onAccessChanged, onSessionEnded]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (workspace.role !== "ADMIN") return;
      setLoading(true);
      setError(undefined);
      try {
        const response = await authenticatedRequest(
          auth.getAccessToken,
          `/api/organizations/payment-access?workspace=${encodeURIComponent(workspace.id)}`,
          { signal },
        );
        if (signal?.aborted) return;
        if (!response || response.status === 401) {
          callbacksRef.current.onSessionEnded();
          return;
        }
        if (response.status === 403) {
          await callbacksRef.current.onAccessChanged();
          return;
        }
        const body = (await response.json()) as PaymentAccessOverview & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error);
        setOverview(body);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : "We couldn't load payment access. Try again.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [auth.getAccessToken, workspace.id, workspace.role],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const closeSheet = () => {
    setSheet(null);
    setInvitationResult(undefined);
    setInviteeLabel("");
    setCopied(false);
    setRemoveTarget(undefined);
    invitationKeyRef.current = undefined;
  };

  const createInvitation = async () => {
    const normalized = inviteeLabel.trim();
    if (!normalized || normalized.length > 120) {
      setError("Enter a name between 1 and 120 characters.");
      return;
    }
    setMutating(true);
    setError(undefined);
    invitationKeyRef.current ??= newIdempotencyKey();
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        "/api/organizations/payment-access/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            inviteeLabel: normalized,
            idempotencyKey: invitationKeyRef.current,
          }),
        },
      );
      if (!response || response.status === 401) return onSessionEnded();
      const body = (await response.json()) as InvitationLinkResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setInvitationResult(body);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "We couldn't create the invitation. Try again.",
      );
    } finally {
      setMutating(false);
    }
  };

  const revoke = async (id: string) => {
    setMutating(true);
    setError(undefined);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        `/api/organizations/payment-access/invitations/${id}/revoke`,
        { method: "POST" },
      );
      if (!response || response.status === 401) return onSessionEnded();
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      setNotice("Invitation revoked");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "We couldn't revoke the invitation. Try again.",
      );
    } finally {
      setMutating(false);
    }
  };

  const replace = async (id: string) => {
    setMutating(true);
    setError(undefined);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        `/api/organizations/payment-access/invitations/${id}/replace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }),
        },
      );
      if (!response || response.status === 401) return onSessionEnded();
      const body = (await response.json()) as InvitationLinkResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setInvitationResult(body);
      setSheet("invite");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "We couldn't replace the invitation. Try again.",
      );
    } finally {
      setMutating(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setMutating(true);
    setError(undefined);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        `/api/organizations/payment-access/operators/${removeTarget.id}/remove`,
        { method: "POST" },
      );
      if (!response || response.status === 401) return onSessionEnded();
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      closeSheet();
      setNotice("Payment access removed");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "We couldn't remove payment access. Try again.",
      );
    } finally {
      setMutating(false);
    }
  };

  const leave = async () => {
    setMutating(true);
    setError(undefined);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        "/api/organizations/payment-access/leave",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id }),
        },
      );
      if (!response || response.status === 401) return onSessionEnded();
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      closeSheet();
      await onAccessChanged();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "We couldn't remove your access. Try again.",
      );
    } finally {
      setMutating(false);
    }
  };

  if (workspace.role === "PAYMENT_OPERATOR") {
    return (
      <section
        className="mt-12 border-t border-line pt-8"
        aria-labelledby="payment-access-heading"
      >
        <h2 id="payment-access-heading" className="text-lg font-semibold">
          Payment access
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="text-sm font-medium">Your access</p>
            <p className="mt-3 text-sm text-ink-secondary">{workspace.name}</p>
            <p className="mt-1 text-sm font-medium text-state-success">
              Payment operator
            </p>
          </div>
          <div className="border-l border-line pl-5">
            <p className="text-sm leading-relaxed text-ink-secondary">
              You can prepare and execute approved Basin payments. You cannot
              approve payees or change treasury controls.
            </p>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setSheet("leave")}
              className="focus-ring mt-5 min-h-11 rounded-sm px-1 text-sm font-medium text-state-danger"
            >
              Leave organization
            </button>
          </div>
        </div>
        {error && sheet === null ? (
          <p role="alert" className="mt-5 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
        <Sheet
          isOpen={sheet === "leave"}
          title="Leave organization"
          onClose={closeSheet}
          returnFocusRef={triggerRef}
        >
          <p className="text-sm leading-relaxed text-ink-secondary">
            You will lose access to {workspace.name}. Payments already submitted
            will remain in its history.
          </p>
          <Button
            className="mt-8 border-state-danger text-state-danger"
            onClick={() => void leave()}
            disabled={mutating}
          >
            {mutating ? "Leaving organization…" : "Leave organization"}
          </Button>
          {mutating ? (
            <p className="mt-3 text-sm text-ink-secondary" role="status">
              Removing your access…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-state-danger">
              {error}
            </p>
          ) : null}
        </Sheet>
      </section>
    );
  }

  return (
    <section
      className="mt-12 border-t border-line pt-8"
      aria-labelledby="payment-access-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 id="payment-access-heading" className="text-lg font-semibold">
            Payment access
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">
            Payment operators can prepare and execute approved Basin payments.
            They cannot add payees or change treasury controls.
          </p>
        </div>
        <Button ref={triggerRef} onClick={() => setSheet("invite")}>
          Invite payment operator
        </Button>
      </div>

      {loading && !overview ? (
        <p className="mt-6 text-sm text-ink-secondary" role="status">
          Loading payment access…
        </p>
      ) : null}
      {error && sheet === null ? (
        <p role="alert" className="mt-5 text-sm text-state-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mt-5 text-sm font-medium text-state-success"
        >
          {notice}
        </p>
      ) : null}

      {overview ? (
        <div className="mt-8 grid gap-10">
          {overview.operators.length === 0 &&
          overview.invitations.length === 0 ? (
            <div className="border-l-2 border-accent-verdant pl-5">
              <h3 className="text-base font-semibold">
                Invite a payment operator
              </h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
                Create a secure seven-day link and share it with the person who
                should operate approved payments.
              </p>
            </div>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold">Active payment operators</h3>
            {overview.operators.length ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {overview.operators.map((operator) => (
                  <li
                    key={operator.id}
                    className="flex min-h-16 items-center justify-between gap-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {operator.displayName}
                      </p>
                      <p className="mt-1 text-xs text-ink-tertiary">
                        Payment operator
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={mutating}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setRemoveTarget(operator);
                        setSheet("remove");
                      }}
                      className="focus-ring min-h-11 rounded-sm px-2 text-sm font-medium text-state-danger disabled:text-ink-tertiary"
                    >
                      Remove access
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-secondary">
                No payment operators have joined yet.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold">Pending invitations</h3>
            {overview.invitations.length ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {overview.invitations.map((invitation) => {
                  const status = invitationStatus(
                    invitation.expiresAt,
                    invitation.status,
                  );
                  return (
                    <li
                      key={invitation.id}
                      className="flex min-h-20 flex-wrap items-center justify-between gap-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {invitation.inviteeLabel}
                        </p>
                        <p
                          className={`mt-1 text-xs ${status === "Pending" ? "text-ink-tertiary" : "text-state-warning"}`}
                        >
                          {status}
                        </p>
                        <p className="mt-1 text-xs text-ink-tertiary">
                          {status === "Expired"
                            ? "This invitation can no longer be used."
                            : "Waiting for someone to accept this link."}
                        </p>
                      </div>
                      {status === "Pending" ? (
                        <button
                          type="button"
                          disabled={mutating}
                          onClick={() => void revoke(invitation.id)}
                          className="focus-ring min-h-11 rounded-sm px-2 text-sm font-medium text-state-danger disabled:text-ink-tertiary"
                        >
                          Revoke invitation
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={mutating}
                          onClick={(event) => {
                            triggerRef.current = event.currentTarget;
                            void replace(invitation.id);
                          }}
                          className="focus-ring min-h-11 rounded-sm px-2 text-sm font-medium disabled:text-ink-tertiary"
                        >
                          {status === "Expires soon"
                            ? "Replace invitation"
                            : "Create replacement"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-secondary">
                No invitations are waiting.
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-tertiary">
              Names identify links in this list; they do not verify a person or
              bind the invitation to an account.
            </p>
          </div>

          {overview.activity.length ? (
            <div>
              <h3 className="text-sm font-semibold">Recent access activity</h3>
              <ul className="mt-3 space-y-2">
                {overview.activity.map((event) => (
                  <li
                    key={event.id}
                    className="flex justify-between gap-4 text-xs text-ink-tertiary"
                  >
                    <span>
                      {eventLabels[event.type]} · {event.label}
                    </span>
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <Sheet
        isOpen={sheet === "invite"}
        title={
          invitationResult ? "Invitation ready" : "Invite payment operator"
        }
        onClose={closeSheet}
        returnFocusRef={triggerRef}
      >
        {invitationResult ? (
          <div>
            <p className="text-sm leading-relaxed text-ink-secondary">
              This link expires in 7 days and can be used once. Basin will not
              show it again after you close this sheet.
            </p>
            <div className="mt-6 break-all rounded-sm border border-line bg-surface-muted p-4 font-mono text-xs">
              {invitationResult.invitationUrl}
            </div>
            <Button
              className="mt-5"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    invitationResult.invitationUrl,
                  );
                  setCopied(true);
                } catch {
                  setError(
                    "We couldn't copy the link. Select and copy it manually.",
                  );
                }
              }}
            >
              Copy invitation link
            </Button>
            {copied ? (
              <p role="status" className="mt-4 text-sm text-state-success">
                Link copied. Share it with the person who should operate
                payments for this organization.
              </p>
            ) : null}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createInvitation();
            }}
          >
            <label htmlFor="invitee-label" className="text-sm font-medium">
              Who is this invitation for?
            </label>
            <input
              id="invitee-label"
              name="inviteeLabel"
              required
              maxLength={120}
              value={inviteeLabel}
              onChange={(event) => setInviteeLabel(event.target.value)}
              placeholder="Jordan Lee"
              className="focus-ring mt-3 min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm"
            />
            <div className="mt-8 border-l-2 border-accent-verdant pl-4">
              <p className="text-sm font-medium">{workspace.name}</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-secondary">
                <li>Can prepare and execute approved Basin payments</li>
                <li>Cannot approve payees</li>
                <li>Cannot change treasury controls</li>
                <li>Link expires in 7 days and can be used once</li>
              </ul>
            </div>
            <Button className="mt-8" type="submit" disabled={mutating}>
              {mutating ? "Creating invitation…" : "Create invitation link"}
            </Button>
            {mutating ? (
              <p className="mt-3 text-sm text-ink-secondary" role="status">
                Creating a secure link…
              </p>
            ) : null}
          </form>
        )}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
      </Sheet>

      <Sheet
        isOpen={sheet === "remove"}
        title="Remove payment access"
        onClose={closeSheet}
        returnFocusRef={triggerRef}
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          {removeTarget?.displayName} will immediately lose access to this
          organization and cannot submit new payments.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
          Payments already submitted will continue to their final status.
        </p>
        <Button
          className="mt-8 border-state-danger text-state-danger"
          onClick={() => void remove()}
          disabled={mutating}
        >
          {mutating ? "Removing payment access…" : "Remove payment access"}
        </Button>
        {mutating ? (
          <p className="mt-3 text-sm text-ink-secondary" role="status">
            Removing access…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
      </Sheet>
    </section>
  );
}
