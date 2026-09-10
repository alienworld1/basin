"use client";

import { useAuthorizationSignature } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ApprovedPayeeDetailDto,
  ApprovedPayeeListDto,
  PreparedRelationshipDto,
  RelationshipTechnicalDetails,
  ResolvedPayeeDto,
} from "../../shared/approved-payee-types";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";
import { Sheet } from "../sheet";
import type { WorkspaceSummary } from "../shell-types";
import { ApprovalReview } from "./approval-review";
import { ReapprovalReview } from "./reapproval-review";
import { RelationshipDetail } from "./relationship-detail";
import { RelationshipList } from "./relationship-list";
import { useRelationshipWallet } from "./use-relationship-wallet";

const defaultExpiry = () => {
  const value = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  value.setSeconds(0, 0);
  return value.toISOString().slice(0, 16);
};

export function ApprovedPayees({
  workspace,
  requestedRelationshipId,
  onTechnicalDetailsChange,
  onPendingChange,
  onSessionEnded,
  onCreateExpectedPayment,
}: {
  workspace: WorkspaceSummary;
  requestedRelationshipId?: string;
  onTechnicalDetailsChange: (details: RelationshipTechnicalDetails) => void;
  onPendingChange: (pending: boolean) => void;
  onSessionEnded: () => void;
  onCreateExpectedPayment?: (approvedPayeeId: string) => void;
}) {
  const auth = useBasinAuth();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const router = useRouter();
  const wallet = useRelationshipWallet();
  const [list, setList] = useState<ApprovedPayeeListDto>();
  const [detail, setDetail] = useState<ApprovedPayeeDetailDto>();
  const [resolved, setResolved] = useState<ResolvedPayeeDto>();
  const [identity, setIdentity] = useState("");
  const [organizationLabel, setOrganizationLabel] = useState(() =>
    workspace.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  );
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [sheet, setSheet] = useState<
    "approval" | "detail" | "setup" | "reapprove" | "revoke" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const trigger = useRef<HTMLButtonElement>(null);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  const request = useCallback(
    async <T,>(path: string, options?: RequestInit) => {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        path,
        options,
      );
      if (!response || response.status === 401) {
        onSessionEnded();
        throw new Error("Your session ended. Sign in again.");
      }
      const body = await response.json();
      if (!response.ok) {
        const firstField =
          body.fieldErrors &&
          Object.values(body.fieldErrors).flat().find(Boolean);
        throw new Error(
          typeof firstField === "string"
            ? firstField
            : (body.error ?? "We couldn't complete this request."),
        );
      }
      return body as T;
    },
    [auth.getAccessToken, onSessionEnded],
  );

  const loadList = useCallback(async () => {
    const current = ++listSequence.current;
    setLoading(true);
    try {
      const result = await request<ApprovedPayeeListDto>(
        `/api/approved-payees?workspaceId=${workspace.id}`,
      );
      if (current !== listSequence.current) return;
      setList(result);
      setError(undefined);
    } catch (caught) {
      if (current === listSequence.current) setError((caught as Error).message);
    } finally {
      if (current === listSequence.current) setLoading(false);
    }
  }, [request, workspace.id]);

  const loadDetail = useCallback(
    async (id: string) => {
      const current = ++detailSequence.current;
      setLoading(true);
      try {
        const result = await request<ApprovedPayeeDetailDto>(
          `/api/approved-payees/${id}?workspaceId=${workspace.id}`,
        );
        if (current !== detailSequence.current) return;
        setDetail(result);
        onTechnicalDetailsChange(result.technical);
        setSheet("detail");
        setError(undefined);
      } catch (caught) {
        if (current === detailSequence.current)
          setError((caught as Error).message);
      } finally {
        if (current === detailSequence.current) setLoading(false);
      }
    },
    [onTechnicalDetailsChange, request, workspace.id],
  );

  useEffect(() => {
    void Promise.resolve().then(loadList);
    return () => {
      listSequence.current += 1;
      detailSequence.current += 1;
      onTechnicalDetailsChange(undefined);
    };
  }, [loadList, onTechnicalDetailsChange]);

  useEffect(() => {
    if (!requestedRelationshipId) return;
    if (/^\d+$/.test(requestedRelationshipId))
      void Promise.resolve().then(() => loadDetail(requestedRelationshipId));
    else
      void Promise.resolve().then(() =>
        setError("We couldn't find that relationship."),
      );
  }, [loadDetail, requestedRelationshipId]);

  useEffect(() => {
    const pending = Boolean(
      detail?.operation &&
      !["CONFIRMED", "FAILED"].includes(detail.operation.status),
    );
    onPendingChange(pending);
  }, [detail?.operation, onPendingChange]);

  useEffect(() => {
    if (
      sheet !== "detail" ||
      !detail?.operation ||
      ["CONFIRMED", "FAILED", "NEEDS_ATTENTION"].includes(
        detail.operation.status,
      ) ||
      document.visibilityState !== "visible"
    )
      return;
    const timeout = window.setTimeout(() => void loadDetail(detail.id), 4_000);
    return () => window.clearTimeout(timeout);
  }, [detail, loadDetail, sheet]);

  const openDetail = (id: string) => {
    trigger.current =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    router.push(`/app?workspace=${workspace.id}&relationship=${id}`);
    void loadDetail(id);
  };

  const closeSheet = () => {
    setSheet(null);
    setResolved(undefined);
    setDetail(undefined);
    onTechnicalDetailsChange(undefined);
    if (requestedRelationshipId) router.push(`/app?workspace=${workspace.id}`);
  };

  const findPayee = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const value = await request<ResolvedPayeeDto>(
        "/api/approved-payees/resolve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, identity }),
        },
      );
      setResolved(value);
      setIdentity(value.canonicalName);
      setExpiry(value.maximumExpiry.slice(0, 16));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const authorizeOrganizationOperation = async (operationId: string) => {
    let authorized = await request<PreparedRelationshipDto>(
      "/api/approved-payees/authorize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, operationId }),
      },
    );
    let authorizationCount = 0;
    while (authorized.walletAuthorization) {
      if (authorizationCount >= 3) {
        throw new Error(
          "The organization wallet requested too many authorization steps. Check its current state before retrying.",
        );
      }
      authorizationCount += 1;
      const walletAuthorization = authorized.walletAuthorization;
      const { signature } = await generateAuthorizationSignature(
        walletAuthorization.request,
      );
      authorized = await request<PreparedRelationshipDto>(
        "/api/approved-payees/authorize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            operationId,
            walletAuthorizationSignature: signature,
            walletAuthorizationExpiry: walletAuthorization.requestExpiry,
          }),
        },
      );
    }
    return authorized;
  };

  const approve = async () => {
    if (!resolved) return;
    setBusy(true);
    try {
      const prepared = await request<PreparedRelationshipDto>(
        "/api/approved-payees/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            action: "PROPOSE",
            identityId: resolved.identityId,
            expiresAt: new Date(expiry).toISOString(),
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const authorized = await authorizeOrganizationOperation(
        prepared.operation.id,
      );
      if (authorized.operation.status !== "CONFIRMED") {
        setError(authorized.operation.message);
        return;
      }
      setSheet(null);
      await loadList();
      if (prepared.relationshipId) openDetail(prepared.relationshipId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!detail) return;
    setBusy(true);
    setError(undefined);
    try {
      const prepared = await request<PreparedRelationshipDto>(
        `/api/approved-payees/${detail.id}/accept/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const signature = await wallet.sign(prepared);
      const authorized = await request<PreparedRelationshipDto>(
        "/api/approved-payees/authorize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            operationId: prepared.operation.id,
            signature,
          }),
        },
      );
      const { hash } = await wallet.submit(authorized);
      await request("/api/approved-payees/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          operationId: prepared.operation.id,
          transactionHash: hash,
        }),
      });
      await loadDetail(detail.id);
      await loadList();
    } catch (caught) {
      setError(
        (caught as Error).message.includes("rejected")
          ? "Authorization was cancelled. No new action was submitted."
          : (caught as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const prepared = await request<PreparedRelationshipDto>(
        "/api/approved-payees/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            action: "REVOKE",
            relationshipId: detail.id,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const authorized = await authorizeOrganizationOperation(
        prepared.operation.id,
      );
      if (authorized.operation.status !== "CONFIRMED") {
        setError(authorized.operation.message);
        return;
      }
      await loadDetail(detail.id);
      setSheet("detail");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reapprove = async () => {
    if (!detail) return;
    setBusy(true);
    setError(undefined);
    try {
      const payee = await request<ResolvedPayeeDto>(
        "/api/approved-payees/resolve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            identity: detail.payeeName,
          }),
        },
      );
      const prepared = await request<PreparedRelationshipDto>(
        "/api/approved-payees/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            action: "PROPOSE",
            identityId: payee.identityId,
            expiresAt: new Date(expiry).toISOString(),
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const authorized = await authorizeOrganizationOperation(
        prepared.operation.id,
      );
      if (authorized.operation.status !== "CONFIRMED") {
        setError(authorized.operation.message);
        return;
      }
      setSheet(null);
      await loadList();
      if (prepared.relationshipId) await loadDetail(prepared.relationshipId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const checkStatus = async () => {
    if (!detail?.operation) {
      if (detail) await loadDetail(detail.id);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await request("/api/approved-payees/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          operationId: detail.operation.id,
        }),
      });
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setup = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const prepared = await request<PreparedRelationshipDto>(
        "/api/approved-payees/setup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            organizationLabel,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const authorized = await authorizeOrganizationOperation(
        prepared.operation.id,
      );
      if (authorized.operation.status !== "CONFIRMED") {
        setError(authorized.operation.message);
        return;
      }
      setSheet(null);
      await loadList();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const organization = workspace.type === "organization";
  return (
    <section
      className="mt-10 max-w-2xl border-t border-line pt-8"
      aria-labelledby="approved-payees-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="approved-payees-heading" className="text-lg font-semibold">
            {organization ? "Approved Payees" : "Payment relationships"}
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">
            {organization
              ? "Approve who your organization can pay. Each payee controls their own receiving account."
              : "Review approvals addressed to your Basin identity."}
          </p>
        </div>
        {list?.canApprove && list.setup.ready ? (
          <Button
            ref={trigger}
            onClick={() => {
              setResolved(undefined);
              setError(undefined);
              setSheet("approval");
            }}
          >
            Approve payee
          </Button>
        ) : null}
      </div>
      {loading && !list ? (
        <p className="mt-6 text-sm text-ink-secondary" role="status">
          Checking relationships and authority…
        </p>
      ) : null}
      {list && !list.setup.ready ? (
        <div className="mt-6 border-l-2 border-line-strong pl-4">
          <p className="text-sm text-ink-secondary">{list.setup.message}</p>
          {list.setup.canSetup ? (
            <Button
              ref={trigger}
              className="mt-4"
              onClick={() => setSheet("setup")}
            >
              Set up organization identity
            </Button>
          ) : null}
        </div>
      ) : null}
      {list?.rows.length ? (
        <RelationshipList rows={list.rows} onSelect={openDetail} />
      ) : list && list.setup.ready ? (
        <div className="mt-7">
          <p className="font-medium">
            {organization
              ? "No approved payees yet."
              : "No payment relationships yet."}
          </p>
          <p className="mt-2 text-sm text-ink-secondary">
            {organization
              ? list.canApprove
                ? "Approve a Basin identity to start a payment relationship."
                : "An administrator can approve payees for this organization."
              : "Organizations can send approval requests to your Basin identity."}
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="mt-5" role="alert">
          <p className="text-sm text-state-danger">{error}</p>
          <Button className="mt-3" onClick={() => void loadList()}>
            Try again
          </Button>
        </div>
      ) : null}

      <Sheet
        isOpen={sheet === "approval"}
        title="Approve payee"
        onClose={closeSheet}
        returnFocusRef={trigger}
      >
        {!resolved ? (
          <div className="space-y-5">
            <div>
              <label
                htmlFor="payee-identity"
                className="block text-sm font-medium"
              >
                Basin identity
              </label>
              <input
                id="payee-identity"
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                aria-describedby={error ? "payee-error" : undefined}
                className="focus-ring mt-2 min-h-11 w-full rounded-sm border border-line bg-surface px-3"
                placeholder="name.basin.eth"
              />
            </div>
            <Button
              disabled={busy || !identity.trim()}
              onClick={() => void findPayee()}
            >
              {busy ? "Finding payee…" : "Find payee"}
            </Button>
            {error ? (
              <p
                id="payee-error"
                role="alert"
                className="text-sm text-state-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <ApprovalReview
            organizationName={workspace.name}
            payee={resolved}
            expiry={expiry}
            busy={busy}
            onExpiryChange={setExpiry}
            onApprove={() => void approve()}
          />
        )}
      </Sheet>
      <Sheet
        isOpen={sheet === "setup"}
        title="Set up organization identity"
        onClose={closeSheet}
        returnFocusRef={trigger}
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-ink-secondary">
            Basin will create the organization namespace and isolated
            relationship registry under the verified organization wallet. Your
            personal wallet and payment operator do not receive this authority.
          </p>
          <div>
            <label
              htmlFor="organization-identity-label"
              className="block text-sm font-medium"
            >
              Organization identity
            </label>
            <div className="mt-2 flex min-h-11 items-center rounded-sm border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-focus">
              <input
                id="organization-identity-label"
                value={organizationLabel}
                onChange={(event) => setOrganizationLabel(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                aria-describedby={
                  error ? "organization-label-error" : undefined
                }
              />
              <span className="text-sm text-ink-tertiary">.basin.eth</span>
            </div>
          </div>
          <Button
            disabled={busy || !organizationLabel.trim()}
            onClick={() => void setup()}
          >
            {busy ? "Preparing authorization…" : "Authorize setup"}
          </Button>
          {error ? (
            <p
              id="organization-label-error"
              role="alert"
              className="text-sm text-state-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
      <Sheet
        isOpen={sheet === "detail"}
        title="Payment relationship"
        onClose={closeSheet}
        returnFocusRef={trigger}
      >
        {detail ? (
          <RelationshipDetail
            detail={detail}
            busy={busy}
            onAccept={() => void accept()}
            onSetupReceiving={() => {
              setSheet(null);
              setDetail(undefined);
              onTechnicalDetailsChange(undefined);
              router.push(
                `/app?workspace=${workspace.id}&receiving=${detail.id}`,
              );
            }}
            onReapprove={() => {
              setExpiry(defaultExpiry());
              setError(undefined);
              setSheet("reapprove");
            }}
            onRevoke={() => setSheet("revoke")}
            onCheck={() => void checkStatus()}
            onCreateExpectedPayment={
              detail.eligible && detail.canRevoke && onCreateExpectedPayment
                ? () => {
                    setSheet(null);
                    setDetail(undefined);
                    onTechnicalDetailsChange(undefined);
                    router.push(`/app?workspace=${workspace.id}`);
                    onCreateExpectedPayment(detail.id);
                  }
                : undefined
            }
          />
        ) : (
          <p className="text-sm text-ink-secondary">
            Checking relationship authority…
          </p>
        )}
        {error ? (
          <p role="alert" className="mt-6 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
      </Sheet>
      <Sheet
        isOpen={sheet === "reapprove"}
        title="Re-establish approval"
        onClose={() => setSheet("detail")}
        returnFocusRef={trigger}
      >
        {detail ? (
          <ReapprovalReview
            detail={detail}
            expiry={expiry}
            busy={busy}
            onExpiryChange={setExpiry}
            onReapprove={() => void reapprove()}
          />
        ) : null}
        {error ? (
          <p role="alert" className="mt-6 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
      </Sheet>
      <Sheet
        isOpen={sheet === "revoke"}
        title="Revoke payee"
        onClose={() => setSheet("detail")}
        returnFocusRef={trigger}
      >
        {detail ? (
          <div className="space-y-6">
            <p className="font-medium">Revoke {detail.payeeName}?</p>
            <p className="text-sm leading-relaxed text-ink-secondary">
              This ends {detail.organizationName}&apos;s approval. It won&apos;t
              change {detail.payeeName}&apos;s identity or receiving account.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy} onClick={() => void revoke()}>
                {busy ? "Preparing revocation…" : "Revoke payee"}
              </Button>
              <Button disabled={busy} onClick={() => setSheet("detail")}>
                Keep approval
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-state-danger">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </section>
  );
}
