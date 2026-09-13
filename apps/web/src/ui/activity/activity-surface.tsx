"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityListDto } from "../../shared/activity-types";
import type {
  ReceiptDetailDto,
  ReceiptVerificationDto,
} from "../../shared/receipt-types";
import { useBasinAuth } from "../auth/auth-provider";
import { authenticatedRequest } from "../auth/authenticated-request";
import { Button } from "../button";
import { ActivityRow } from "./activity-row";
import { ReceiptDocument } from "../receipts/receipt-document";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function abortRequest(controller?: AbortController) {
  if (!controller || controller.signal.aborted) return;
  try {
    controller.abort();
  } catch (error) {
    if (!isAbortError(error)) throw error;
  }
}

export function ActivitySurface({
  workspaceId,
  receiptId,
}: {
  workspaceId: string;
  receiptId?: string;
}) {
  const auth = useBasinAuth();
  const router = useRouter();
  const [list, setList] = useState<ActivityListDto>();
  const [receipt, setReceipt] = useState<ReceiptDetailDto>();
  const [verification, setVerification] = useState<ReceiptVerificationDto>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [checking, setChecking] = useState(false);
  const receiptController = useRef<AbortController | undefined>(undefined);
  const activitySequence = useRef(0);
  const activeWorkspaceId = useRef(workspaceId);
  const request = useCallback(
    (path: string, signal?: AbortSignal) =>
      authenticatedRequest(auth.getAccessToken, path, {
        signal,
      }),
    [auth.getAccessToken],
  );
  const loadActivity = useCallback(async () => {
    const sequence = ++activitySequence.current;
    setLoading(true);
    setError(undefined);
    try {
      const response = await request(`/api/activity?workspaceId=${workspaceId}`);
      if (!response?.ok) throw new Error();
      const result = (await response.json()) as ActivityListDto;
      if (
        activeWorkspaceId.current !== workspaceId ||
        sequence !== activitySequence.current
      )
        return;
      setList(result);
    } catch {
      if (
        activeWorkspaceId.current !== workspaceId ||
        sequence !== activitySequence.current
      )
        return;
      setError("We couldn't load activity. Try again.");
    } finally {
      if (
        activeWorkspaceId.current === workspaceId &&
        sequence === activitySequence.current
      )
        setLoading(false);
    }
  }, [request, workspaceId]);
  const check = useCallback(async () => {
    if (!receiptId) return;
    setChecking(true);
    try {
      const response = await request(
        `/api/receipts/${receiptId}/verification?workspaceId=${workspaceId}`,
        receiptController.current?.signal,
      );
      if (!response?.ok) throw new Error();
      const result = (await response.json()) as ReceiptVerificationDto;
      if (activeWorkspaceId.current !== workspaceId) return;
      setVerification(result);
    } catch {
      if (activeWorkspaceId.current !== workspaceId) return;
      setVerification({
        status: "EVIDENCE_UNAVAILABLE",
        checkedAt: new Date().toISOString(),
        network: "Ethereum Sepolia",
        summary:
          "The receipt is still available. Check the network evidence again.",
      });
    } finally {
      if (activeWorkspaceId.current === workspaceId) setChecking(false);
    }
  }, [receiptId, request, workspaceId]);
  const loadMore = useCallback(async () => {
    if (!list?.nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await request(
        `/api/activity?workspaceId=${workspaceId}&cursor=${list.nextCursor}`,
      );
      if (!response?.ok) throw new Error();
      const next = (await response.json()) as ActivityListDto;
      if (activeWorkspaceId.current !== workspaceId) return;
      setList((current) =>
        current ? { ...next, rows: [...current.rows, ...next.rows] } : next,
      );
    } catch {
      if (activeWorkspaceId.current !== workspaceId) return;
      setError("We couldn't load activity. Try again.");
    } finally {
      if (activeWorkspaceId.current === workspaceId) setLoadingMore(false);
    }
  }, [list, request, workspaceId]);
  const reconcile = useCallback(async () => {
    setReconciling(true);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        "/api/activity/reconcile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      if (!response?.ok) throw new Error();
      const result = (await response.json()) as ActivityListDto;
      if (activeWorkspaceId.current !== workspaceId) return;
      setList(result);
    } catch {
      if (activeWorkspaceId.current !== workspaceId) return;
      setError("Some payment statuses couldn't be refreshed.");
    } finally {
      if (activeWorkspaceId.current === workspaceId) setReconciling(false);
    }
  }, [auth.getAccessToken, workspaceId]);
  useEffect(() => {
    activeWorkspaceId.current = workspaceId;
  }, [workspaceId]);
  useEffect(() => {
    void Promise.resolve().then(loadActivity);
    return () => {
      activitySequence.current += 1;
    };
  }, [loadActivity]);
  useEffect(() => {
    abortRequest(receiptController.current);
    const controller = new AbortController();
    receiptController.current = controller;
    void Promise.resolve().then(async () => {
      setReceipt(undefined);
      setVerification(undefined);
      if (!receiptId) return;
      try {
        const response = await request(
          `/api/receipts/${receiptId}?workspaceId=${workspaceId}`,
          controller.signal,
        );
        if (activeWorkspaceId.current !== workspaceId || controller.signal.aborted)
          return;
        if (!response?.ok) {
          setError("We couldn't find that receipt.");
          return;
        }
        const result = (await response.json()) as ReceiptDetailDto;
        if (activeWorkspaceId.current !== workspaceId || controller.signal.aborted)
          return;
        setReceipt(result);
        void check();
      } catch (error) {
        if (activeWorkspaceId.current !== workspaceId || isAbortError(error))
          return;
        setError("We couldn't load that receipt. Try again.");
      }
    });
    return () => abortRequest(controller);
  }, [check, receiptId, request, workspaceId]);
  const openReceipt = (id: string) =>
    router.push(`/app?workspace=${workspaceId}&section=activity&receipt=${id}`);
  const closeReceipt = () =>
    router.push(`/app?workspace=${workspaceId}&section=activity`);
  const openExpectedPayment = (id: string) =>
    router.push(`/app?workspace=${workspaceId}&expectedPayment=${id}`);
  if (receiptId)
    return receipt ? (
      <ReceiptDocument
        receipt={receipt}
        verification={verification}
        checking={checking}
        onCheckVerification={() => void check()}
        onBack={closeReceipt}
      />
    ) : (
      <section className="border-t border-line-strong pt-8">
        <p>Loading receipt…</p>
      </section>
    );
  return (
    <section
      aria-labelledby="activity-heading"
      className="border-t border-line-strong pt-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            id="activity-heading"
            className="text-title font-semibold tracking-[-0.03em]"
          >
            Activity
          </h1>
          <p className="mt-3 text-sm text-ink-secondary">
            {list?.viewer === "RECIPIENT"
              ? "Payments received through your Basin identity."
              : "Payments from this organization."}
          </p>
        </div>
        {list?.canReconcile ? (
          <Button disabled={reconciling} onClick={() => void reconcile()}>
            {reconciling ? "Checking submitted payments…" : "Refresh activity"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="mt-8" role="alert">
          <p className="text-state-danger">{error}</p>
          <Button className="mt-4" onClick={() => void loadActivity()}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <div className="mt-8 space-y-4" aria-label="Loading activity">
          <div className="h-16 animate-pulse bg-surface-muted" />
          <div className="h-16 animate-pulse bg-surface-muted" />
        </div>
      ) : list?.rows.length ? (
        <>
          <ul className="mt-8">
            {list.rows.map((row) => (
              <ActivityRow
                key={row.id}
                row={row}
                onViewReceipt={openReceipt}
                onViewExpectedPayment={openExpectedPayment}
              />
            ))}
          </ul>
          {list.nextCursor ? (
            <Button
              className="mt-6"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading activity…" : "Load more"}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="mt-8 border-y border-line py-8">
          <p className="font-medium">
            {list?.viewer === "RECIPIENT"
              ? "No payments received yet."
              : "No payment activity yet."}
          </p>
          <p className="mt-2 text-sm text-ink-secondary">
            {list?.viewer === "RECIPIENT"
              ? "Completed payments to your Basin identity will appear here."
              : "Completed and in-progress Basin payments will appear here."}
          </p>
        </div>
      )}
    </section>
  );
}
