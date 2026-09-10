"use client";
import { useReducedMotion, useTransition } from "@react-spring/web";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PreparedReceivingDto,
  ReceivingOperationDto,
  ReceivingStatusDto,
} from "../../shared/settlement-types";
import { useBasinAuth } from "../auth/auth-provider";
import { authenticatedRequest } from "../auth/authenticated-request";
import {
  ReceivingWalletError,
  useReceivingWallet,
} from "./use-receiving-wallet";

export function useReceiving(
  workspaceId: string,
  onDetailsChange: (details: ReceivingStatusDto) => void,
  requestedRelationshipId?: string,
) {
  const auth = useBasinAuth();
  const send = useReceivingWallet();
  const [details, setDetails] = useState<ReceivingStatusDto | null>(null);
  const [relationship, setRelationship] = useState<string | null>(
    requestedRelationshipId ?? null,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const lastDetails = useRef<ReceivingStatusDto | null>(null);
  const submitting = useRef(false);
  const reviewOpen = useRef(false);
  const focusSuccess = useRef(false);
  const reviewedOperation = useRef<PreparedReceivingDto | null>(null);
  const pollingWindow = useRef({ operationId: "", started: 0 });
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const request = useCallback(
    async <T>(path: string, body?: object, method = "POST"): Promise<T> => {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        path,
        body
          ? {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : undefined,
      );
      if (!response || response.status === 401)
        throw new Error("Your session ended. Sign in again.");
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.fieldErrors?.destination?.[0] ??
            data.error ??
            "We couldn't check your receiving details.",
        );
      return data as T;
    },
    [auth.getAccessToken],
  );
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const query = new URLSearchParams({
        workspaceId,
        ...(relationship ? { relationshipId: relationship } : {}),
      });
      const result = await request<ReceivingStatusDto>(
        `/api/settlement/status?${query}`,
      );
      if (!mounted.current || current !== sequence.current) return;
      lastDetails.current = result;
      setDetails(result);
      onDetailsChange(result);
      setError(null);
      setChecking(false);
    } catch (caught) {
      if (mounted.current && current === sequence.current) {
        setError((caught as Error).message);
        setChecking(false);
        if (lastDetails.current) {
          const unverified: ReceivingStatusDto = {
            ...lastDetails.current,
            status: "NEEDS_REVIEW",
            trust: "UNVERIFIED",
            canEdit: false,
            technical: lastDetails.current.technical
              ? { ...lastDetails.current.technical, approvalVerified: false }
              : null,
            message: "We couldn't verify your receiving details. Check again.",
          };
          setDetails(unverified);
          onDetailsChange(unverified);
        }
      }
    }
  }, [relationship, request, workspaceId, onDetailsChange]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const pendingId = details?.pending?.id;
  const pendingStatus = details?.pending?.status;
  useEffect(() => {
    if (
      !pendingId ||
      !pendingStatus ||
      !["SUBMITTED", "VERIFYING"].includes(pendingStatus)
    )
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    if (pollingWindow.current.operationId !== pendingId)
      pollingWindow.current = { operationId: pendingId, started: Date.now() };
    const started = pollingWindow.current.started;
    if (Date.now() - started >= 120_000) return;
    let attempt = 0;
    const poll = () => {
      timer = setTimeout(async () => {
        if (stopped) return;
        await load();
        if (!stopped && Date.now() - started < 120_000) {
          attempt++;
          poll();
        }
      }, [3000, 5000, 10000][Math.min(attempt, 2)]);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pendingId, pendingStatus, load]);
  useEffect(() => {
    if (!pendingId || pendingStatus !== "UNKNOWN") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const check = () => {
      timer = setTimeout(async () => {
        if (stopped) return;
        try {
          await request("/api/settlement/reconcile", {
            workspaceId,
            operationId: pendingId,
          });
          if (!stopped) await load();
        } catch {
          // Keep the durable waiting state; the manual status action remains available.
        }
        if (!stopped && Date.now() - started < 120_000) check();
      }, 15_000);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pendingId, pendingStatus, load, request, workspaceId]);
  const transitions = useTransition(
    details?.current ?? details?.preference ?? null,
    {
      keys: (item) =>
        item
          ? "commitment" in item
            ? item.commitment
            : item.revision
          : "empty",
      from: { opacity: 0, transform: "translate3d(0, 8px, 0)" },
      enter: { opacity: 1, transform: "translate3d(0, 0px, 0)" },
      leave: { opacity: 0, transform: "translate3d(0, -8px, 0)" },
      exitBeforeEnter: true,
      immediate: !!reducedMotion,
      config: { tension: 260, friction: 32, clamp: true },
    },
  );
  const prepareReview = async (destination: string) => {
    if (!details?.relationshipId || submitting.current)
      throw new Error("Check the selected relationship.");
    submitting.current = true;
    setBusy(true);
    try {
      const prepared = await request<PreparedReceivingDto>(
        "/api/settlement/prepare",
        {
          workspaceId,
          relationshipId: details.relationshipId,
          destination,
          idempotencyKey:
            details.prepared?.idempotencyKey ?? crypto.randomUUID(),
        },
      );
      if (!mounted.current) throw new Error("Your workspace changed.");
      reviewedOperation.current = prepared;
      if (!reviewOpen.current) await load();
      return prepared;
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const confirm = async (destination: string) => {
    if (!details || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    let operationId: string | null = null;
    let walletOutcome: "REJECTED" | "NOT_SUBMITTED" | null = null;
    let authorizationStarted = false;
    let walletMessage: string | null = null;
    try {
      if (!details.relationshipId) {
        await request(
          "/api/settlement/preference",
          {
            workspaceId,
            destination,
            expectedRevision: details.preference?.revision ?? null,
          },
          "PUT",
        );
      } else {
        if (
          !reviewedOperation.current ||
          reviewedOperation.current.destination.toLowerCase() !==
            destination.toLowerCase()
        )
          throw new Error("Review the receiving change before confirming.");
        operationId = reviewedOperation.current.operationId;
        if (!reviewOpen.current) return;
        const prepared = await request<PreparedReceivingDto>(
          "/api/settlement/authorize",
          { workspaceId, operationId },
        );
        authorizationStarted = true;
        if (!mounted.current) return;
        setProgress("Authorizing with your Basin account…");
        let hash: `0x${string}`;
        try {
          ({ hash } = await send(prepared));
        } catch (caught) {
          walletOutcome =
            caught instanceof ReceivingWalletError &&
            caught.code !== "UNKNOWN"
              ? caught.code
              : null;
          walletMessage =
            caught instanceof ReceivingWalletError ? caught.message : null;
          throw caught;
        }
        if (!mounted.current) return;
        setProgress("Your change is being confirmed.");
        const result = await request<ReceivingOperationDto>(
          "/api/settlement/confirm",
          { workspaceId, operationId, transactionHash: hash },
        );
        if (!mounted.current) return;
        setProgress(result.message);
      }
      if (!mounted.current) return;
      focusSuccess.current = true;
      setOpen(false);
      await load();
    } catch (caught) {
      if (!mounted.current) return;
      const awaitingResult = Boolean(
        operationId &&
          authorizationStarted &&
          (!walletMessage ||
            (caught instanceof ReceivingWalletError &&
              caught.code === "UNKNOWN")),
      );
      setError(
        awaitingResult
          ? null
          : (caught as Error).message?.startsWith("0x")
            ? "We couldn't complete the change. Check again."
            : (caught as Error).message,
      );
      if (operationId && authorizationStarted) {
        try {
          await request("/api/settlement/reconcile", {
            workspaceId,
            operationId,
            ...(walletOutcome ? { walletOutcome } : {}),
          });
        } catch {
          /* The server journal retains the operation for the next authorized read. */
        }
        setOpen(false);
        await load();
        if (walletMessage && !awaitingResult) setError(walletMessage);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const openReview = () => {
    setError(null);
    reviewOpen.current = true;
    setOpen(true);
  };
  const closeReview = () => {
    reviewOpen.current = false;
    setOpen(false);
    if (!submitting.current) void load();
  };
  const afterClosed = () => {
    if (focusSuccess.current) {
      heading.current?.focus();
      focusSuccess.current = false;
    }
  };
  return {
    auth,
    details,
    setDetails,
    setChecking,
    setRelationship,
    busy,
    setBusy,
    error,
    setError,
    checking,
    heading,
    trigger,
    transitions,
    progress,
    request,
    load,
    openReview,
    closeReview,
    afterClosed,
    open,
    prepareReview,
    confirm,
  };
}
