"use client";

import { useRouter } from "next/navigation";
import { useAuthorizationSignature } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CreateExpectedPaymentResultDto,
  ExpectedPaymentDetailDto,
  ExpectedPaymentListDto,
} from "../../shared/expected-payment-types";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";
import { Sheet } from "../sheet";
import type { WorkspaceSummary } from "../shell-types";
import { CreateExpectedPaymentForm } from "./create-expected-payment-form";
import { ExpectedPaymentDetail } from "./expected-payment-detail";
import { ExpectedPaymentList } from "./expected-payment-list";
import { ExpectedPaymentSkeleton } from "./expected-payment-skeleton";
import { formatExpectedAmount } from "./format-expected-amount";

export function ExpectedPayments({
  workspace,
  requestedExpectedPaymentId,
  requestedApprovedPayeeId,
  onCreateRequestConsumed,
  onSessionEnded,
}: {
  workspace: WorkspaceSummary;
  requestedExpectedPaymentId?: string;
  requestedApprovedPayeeId?: string;
  onCreateRequestConsumed: () => void;
  onSessionEnded: () => void;
}) {
  const auth = useBasinAuth();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const router = useRouter();
  const [list, setList] = useState<ExpectedPaymentListDto>();
  const [detail, setDetail] = useState<ExpectedPaymentDetailDto>();
  const [sheet, setSheet] = useState<"create" | "detail" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const listRef = useRef<ExpectedPaymentListDto | undefined>(undefined);
  const createKey = useRef(crypto.randomUUID());
  const cancelKey = useRef(crypto.randomUUID());
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

  const loadList = useCallback(
    async (append = false) => {
      const current = ++listSequence.current;
      if (!append) setLoading(true);
      try {
        const cursor = append ? listRef.current?.nextCursor : undefined;
        const result = await request<ExpectedPaymentListDto>(
          `/api/expected-payments?workspaceId=${workspace.id}${cursor ? `&cursor=${cursor}` : ""}`,
        );
        if (current !== listSequence.current) return;
        setList((previous) => {
          const next =
            append && previous
              ? { ...result, rows: [...previous.rows, ...result.rows] }
              : result;
          listRef.current = next;
          return next;
        });
        setError(undefined);
      } catch (caught) {
        if (current === listSequence.current)
          setError((caught as Error).message);
      } finally {
        if (current === listSequence.current) setLoading(false);
      }
    },
    [request, workspace.id],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      const current = ++detailSequence.current;
      setLoading(true);
      try {
        const result = await request<ExpectedPaymentDetailDto>(
          `/api/expected-payments/${id}?workspaceId=${workspace.id}`,
        );
        if (current !== detailSequence.current) return;
        setDetail(result);
        setSheet("detail");
        setError(undefined);
      } catch (caught) {
        if (current === detailSequence.current)
          setError((caught as Error).message);
      } finally {
        if (current === detailSequence.current) setLoading(false);
      }
    },
    [request, workspace.id],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadList());
    return () => {
      listSequence.current += 1;
      detailSequence.current += 1;
    };
  }, [loadList]);

  useEffect(() => {
    if (!requestedExpectedPaymentId) return;
    if (/^[1-9]\d*$/.test(requestedExpectedPaymentId)) {
      void Promise.resolve().then(() => loadDetail(requestedExpectedPaymentId));
    } else {
      void Promise.resolve().then(() =>
        setError("We couldn't find that expected payment."),
      );
    }
  }, [loadDetail, requestedExpectedPaymentId]);

  useEffect(() => {
    if (!requestedApprovedPayeeId || !list?.canCreate || !list.hasEligiblePayee)
      return;
    void Promise.resolve().then(() => {
      createKey.current = crypto.randomUUID();
      setAttempt((value) => value + 1);
      setUncertain(false);
      setError(undefined);
      setSheet("create");
      onCreateRequestConsumed();
    });
  }, [
    list?.canCreate,
    list?.hasEligiblePayee,
    onCreateRequestConsumed,
    requestedApprovedPayeeId,
  ]);

  const openCreate = () => {
    createKey.current = crypto.randomUUID();
    setAttempt((value) => value + 1);
    setUncertain(false);
    setError(undefined);
    setSheet("create");
  };

  const openDetail = (id: string) => {
    trigger.current =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    router.push(`/app?workspace=${workspace.id}&expectedPayment=${id}`);
    void loadDetail(id);
  };

  const closeSheet = () => {
    setSheet(null);
    setDetail(undefined);
    setError(undefined);
    if (requestedExpectedPaymentId)
      router.push(`/app?workspace=${workspace.id}`);
  };

  const create = async (values: {
    approvedPayeeId: string;
    amount: string;
    purpose: string;
    reference?: string;
  }) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await request<CreateExpectedPaymentResultDto>(
        "/api/expected-payments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            ...values,
            idempotencyKey: createKey.current,
          }),
        },
      );
      setAnnouncement("Expected payment created.");
      createKey.current = crypto.randomUUID();
      setDetail(result.detail);
      setSheet("detail");
      await loadList();
      router.push(
        `/app?workspace=${workspace.id}&expectedPayment=${result.detail.id}`,
      );
    } catch (caught) {
      const message = (caught as Error).message;
      if (message === "Failed to fetch" || message.includes("network")) {
        setUncertain(true);
        setError(
          "We couldn't confirm whether this expected payment was created. Refresh before trying again.",
        );
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (
      !detail ||
      !window.confirm(
        "Cancel this expected payment? This removes it from future payment work. It won't affect the payee relationship.",
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await request<ExpectedPaymentDetailDto>(
        `/api/expected-payments/${detail.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            idempotencyKey: cancelKey.current,
          }),
        },
      );
      setDetail(updated);
      setAnnouncement("Expected payment cancelled.");
      await loadList();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const authorize = async () => {
    if (!detail) return;
    const idempotencyKey = crypto.randomUUID();
    setBusy(true);
    setError(undefined);
    try {
      const prepared = await request<{ review: { payee: string; amount: string; purpose: string } }>(
        `/api/expected-payments/${detail.id}/authorize/prepare`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, idempotencyKey }) },
      );
      if (!window.confirm(`${workspace.name} authorizes ${formatExpectedAmount(prepared.review.amount)} USDC for ${prepared.review.payee} for ${prepared.review.purpose}. Receiving details stay under the payee's control.`)) return;
      let submitted = await request<{ operation: { status: string }; walletAuthorization?: { request: Parameters<typeof generateAuthorizationSignature>[0]; requestExpiry: number } }>(
        `/api/expected-payments/${detail.id}/authorize`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, idempotencyKey }) },
      );
      let attempts = 0;
      while (submitted.walletAuthorization && attempts++ < 3) {
        const { signature } = await generateAuthorizationSignature(submitted.walletAuthorization.request);
        submitted = await request(
          `/api/expected-payments/${detail.id}/authorize`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id, idempotencyKey, walletAuthorizationSignature: signature, walletAuthorizationExpiry: submitted.walletAuthorization.requestExpiry }) },
        );
      }
      await request(`/api/expected-payments/${detail.id}/authorize/reconcile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id }) });
      await loadDetail(detail.id);
      await loadList();
      setAnnouncement("Payment authorized.");
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  };

  const checkAuthorization = async () => {
    if (!detail) return;
    setBusy(true);
    setError(undefined);
    try {
      await request(
        `/api/expected-payments/${detail.id}/authorize/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id }),
        },
      );
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const organization = workspace.type === "organization";
  return (
    <section
      className="mt-10 max-w-3xl border-t border-line pt-8"
      aria-labelledby="expected-payments-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="expected-payments-heading" className="text-lg font-semibold">
            {organization ? "Expected payments" : "Incoming"}
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">
            {organization
              ? "Record what your organization intends to pay for approved work."
              : "Read-only payment intent from organizations that approved your Basin identity."}
          </p>
        </div>
        {(list?.canCreate && list.hasEligiblePayee) ||
        (!list && organization && workspace.role === "ADMIN") ? (
          <Button ref={trigger} disabled={!list} onClick={openCreate}>
            Create expected payment
          </Button>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {loading && !list ? <ExpectedPaymentSkeleton /> : null}
      {error && !sheet ? (
        <div className="mt-6" role="alert">
          <p className="text-sm text-state-danger">
            We couldn&apos;t load expected payments. Try again.
          </p>
          <Button className="mt-3" onClick={() => void loadList()}>
            Try again
          </Button>
        </div>
      ) : null}
      {list?.rows.length ? (
        <ExpectedPaymentList rows={list.rows} onSelect={openDetail} />
      ) : list ? (
        <div className="mt-7">
          <p className="font-medium">
            {organization
              ? list.hasEligiblePayee
                ? "No expected payments yet."
                : "Approve a payee before creating an expected payment."
              : "No incoming payments yet."}
          </p>
          <p className="mt-2 text-sm text-ink-secondary">
            {organization
              ? list.hasEligiblePayee
                ? "Create one for an approved payee when you know who should be paid, how much, and why."
                : "Active approved payees will become available here."
              : "Expected payments from organizations will appear here."}
          </p>
          {organization && !list.hasEligiblePayee ? (
            <a
              href="#approved-payees-heading"
              className="focus-ring mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
            >
              Go to Approved Payees
            </a>
          ) : null}
        </div>
      ) : null}
      {list?.nextCursor ? (
        <Button
          className="mt-5"
          disabled={loading}
          onClick={() => void loadList(true)}
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <Sheet
        isOpen={sheet === "create"}
        title="Create expected payment"
        onClose={closeSheet}
        returnFocusRef={trigger}
      >
        {list ? (
          <CreateExpectedPaymentForm
            key={attempt}
            organizationName={workspace.name}
            payees={list.eligiblePayees}
            initialPayeeId={requestedApprovedPayeeId}
            busy={busy}
            serverError={error}
            uncertain={uncertain}
            onSubmit={(values) => void create(values)}
          />
        ) : (
          <p className="text-sm text-ink-secondary">
            Checking approved payees…
          </p>
        )}
      </Sheet>
      <Sheet
        isOpen={sheet === "detail"}
        title="Expected payment"
        onClose={closeSheet}
        returnFocusRef={trigger}
      >
        {detail ? (
          <ExpectedPaymentDetail
            detail={detail}
            busy={busy}
            onCancel={() => void cancel()}
            onAuthorize={() => void authorize()}
            onCheckAuthorization={() => void checkAuthorization()}
            onBack={closeSheet}
          />
        ) : (
          <p className="text-sm text-ink-secondary">
            Loading expected payment…
          </p>
        )}
        {error ? (
          <p role="alert" className="mt-6 text-sm text-state-danger">
            {error}
          </p>
        ) : null}
      </Sheet>
    </section>
  );
}
