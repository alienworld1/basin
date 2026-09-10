"use client";

import { normalizeBasinLabel } from "@basin/ens/names";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ActiveIdentityDto,
  IdentityStatusDto,
  IdentityTechnicalDetails,
} from "../../shared/identity-types";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import type { WorkspaceSummary } from "../shell-types";
import { IdentityClaimReview } from "./identity-claim-review";
import { IdentityError } from "./identity-error";
import { IdentityHome } from "./identity-home";
import { IdentityProgress } from "./identity-progress";
import {
  IdentitySetupForm,
  type AvailabilityState,
} from "./identity-setup-form";
import {
  clearPendingClaim,
  readPendingClaim,
  writePendingClaim,
  type PendingIdentityClaim,
} from "./pending-claim";

type PersonalIdentityProps = {
  userId: string;
  workspace: WorkspaceSummary;
  requestedReceivingRelationshipId?: string;
  onIdentityDetailsChange: (
    details: IdentityTechnicalDetails | undefined,
  ) => void;
  onPendingChange: (pending: boolean) => void;
};

type Phase =
  | "EDIT"
  | "REVIEW"
  | "SUBMITTING"
  | "CONFIRMING"
  | "VERIFYING"
  | "CHECKING"
  | "READY"
  | "ERROR";

type ErrorState = {
  message: string;
  action: "Try again" | "Check again" | "Choose another";
};

export function PersonalIdentity({
  userId,
  workspace,
  requestedReceivingRelationshipId,
  onIdentityDetailsChange,
  onPendingChange,
}: PersonalIdentityProps) {
  const auth = useBasinAuth();
  const [label, setLabel] = useState("");
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const [phase, setPhase] = useState<Phase>(
    workspace.identity ? "CHECKING" : "EDIT",
  );
  const [selectedName, setSelectedName] = useState(
    workspace.identity?.name ?? "",
  );
  const [pending, setPending] = useState<PendingIdentityClaim | null>(null);
  const [identity, setIdentity] = useState<ActiveIdentityDto | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [justVerified, setJustVerified] = useState(false);
  const requestSequence = useRef(0);

  const saveReady = useCallback(
    (ready: ActiveIdentityDto, isNew: boolean) => {
      setIdentity(ready);
      setSelectedName(ready.name);
      setPhase("READY");
      setJustVerified(isNew);
      setPending(null);
      clearPendingClaim(userId, workspace.id);
      onPendingChange(false);
      onIdentityDetailsChange(ready.technical);
    },
    [onIdentityDetailsChange, onPendingChange, userId, workspace.id],
  );

  const checkStatus = useCallback(
    async (claim: PendingIdentityClaim, isReturning = false) => {
      setPhase(isReturning ? "CHECKING" : "VERIFYING");
      const params = new URLSearchParams({
        workspace: workspace.id,
        name: claim.name,
      });
      if (claim.transactionHash) {
        params.set("transaction", claim.transactionHash);
      }
      try {
        const response = await authenticatedRequest(
          auth.getAccessToken,
          `/api/identities/status?${params}`,
        );
        if (!response || response.status === 401) {
          setError({
            message: "Your session ended. Sign in again.",
            action: "Check again",
          });
          setPhase("ERROR");
          return;
        }
        const body = (await response.json()) as
          IdentityStatusDto | { error?: string };
        if (!response.ok) {
          setError({
            message:
              "error" in body && body.error
                ? body.error
                : "We couldn't check that identity right now. Try again.",
            action: "Check again",
          });
          setPhase("ERROR");
          return;
        }
        if (!("status" in body)) return;
        if (body.status === "ACTIVE") {
          saveReady(body, !workspace.identity);
        } else if (body.status === "PENDING") {
          setPhase("CONFIRMING");
          setError(null);
        } else {
          if (body.status === "FAILED" || body.status === "COLLISION") {
            clearPendingClaim(userId, workspace.id);
            setPending(null);
            onPendingChange(false);
          }
          setError({
            message: body.message,
            action:
              body.status === "COLLISION"
                ? "Choose another"
                : body.status === "FAILED"
                  ? "Try again"
                  : "Check again",
          });
          setPhase("ERROR");
        }
      } catch {
        setError({
          message: "We couldn't check that identity right now. Try again.",
          action: "Check again",
        });
        setPhase("ERROR");
      }
    },
    [
      auth.getAccessToken,
      onPendingChange,
      saveReady,
      userId,
      workspace.id,
      workspace.identity,
    ],
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      setIdentity(null);
      setJustVerified(false);
      setError(null);
      const stored = readPendingClaim(userId, workspace.id);
      if (workspace.identity) {
        const claim: PendingIdentityClaim = {
          version: 1,
          workspaceId: workspace.id,
          name: workspace.identity.name,
          createdAt: new Date().toISOString(),
        };
        setSelectedName(claim.name);
        setPhase("CHECKING");
        void checkStatus(claim, true);
        return;
      }
      if (stored) {
        setPending(stored);
        setSelectedName(stored.name);
        setPhase("CHECKING");
        onPendingChange(true);
        void checkStatus(stored, true);
        return;
      }
      setPending(null);
      setSelectedName("");
      setLabel("");
      setAvailability({ status: "idle" });
      setPhase("EDIT");
      onIdentityDetailsChange(undefined);
      onPendingChange(false);
    });
  }, [
    checkStatus,
    onIdentityDetailsChange,
    onPendingChange,
    userId,
    workspace.id,
    workspace.identity,
  ]);

  useEffect(() => {
    if (!pending || (phase !== "CONFIRMING" && phase !== "VERIFYING")) return;
    const timeout = window.setTimeout(() => void checkStatus(pending), 5_000);
    return () => window.clearTimeout(timeout);
  }, [checkStatus, pending, phase]);

  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const checkAvailability = useCallback(
    async (rawLabel: string) => {
      let normalized;
      try {
        normalized = normalizeBasinLabel(rawLabel);
      } catch (caught) {
        setAvailability({
          status: "error",
          message:
            caught instanceof Error
              ? caught.message
              : "Enter a valid Basin identity.",
        });
        return;
      }
      const sequence = ++requestSequence.current;
      setAvailability({ status: "checking", name: normalized.name });
      try {
        const params = new URLSearchParams({
          workspace: workspace.id,
          label: rawLabel,
        });
        const response = await authenticatedRequest(
          auth.getAccessToken,
          `/api/identities/availability?${params}`,
        );
        if (sequence !== requestSequence.current) return;
        if (!response) throw new Error();
        const body = (await response.json()) as {
          status?: string;
          name?: string;
          error?: string;
        };
        if (!response.ok) {
          setAvailability({
            status: "error",
            name: normalized.name,
            message:
              body.error ??
              "We couldn't check that identity right now. Try again.",
          });
          return;
        }
        if (
          body.status === "AVAILABLE" ||
          body.status === "OWNED_BY_REQUESTER"
        ) {
          setAvailability({
            status: "available",
            name: body.name ?? normalized.name,
          });
          return;
        }
        setAvailability({
          status: "unavailable",
          name: body.name ?? normalized.name,
        });
      } catch {
        if (sequence === requestSequence.current) {
          setAvailability({
            status: "error",
            name: normalized.name,
            message: "We couldn't check that identity right now. Try again.",
          });
        }
      }
    },
    [auth.getAccessToken, workspace.id],
  );

  useEffect(() => {
    if (phase !== "EDIT") return;
    if (!label.trim()) return;
    const timeout = window.setTimeout(() => void checkAvailability(label), 450);
    return () => window.clearTimeout(timeout);
  }, [checkAvailability, label, phase]);

  const claim = async () => {
    if (availability.status !== "available") return;
    const name = availability.name;
    const claimReference: PendingIdentityClaim = {
      version: 1,
      workspaceId: workspace.id,
      name,
      createdAt: new Date().toISOString(),
    };
    setSelectedName(name);
    setPending(claimReference);
    writePendingClaim(userId, claimReference);
    onPendingChange(true);
    setPhase("SUBMITTING");
    setError(null);
    try {
      const response = await authenticatedRequest(
        auth.getAccessToken,
        "/api/identities/claim",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, label }),
        },
      );
      if (!response || response.status === 401) {
        setError({
          message: "Your session ended. Sign in again.",
          action: "Check again",
        });
        setPhase("ERROR");
        return;
      }
      const body = (await response.json()) as
        | ActiveIdentityDto
        | {
            status?: "SUBMITTED";
            name?: string;
            transactionHash?: string;
            error?: string;
            code?: string;
          };
      if (!response.ok) {
        const action =
          response.status === 409
            ? "Choose another"
            : response.status === 400
              ? "Try again"
              : "Check again";
        setError({
          message:
            "error" in body && body.error
              ? body.error
              : "We couldn't claim that identity. Check the details and try again.",
          action,
        });
        setPhase("ERROR");
        return;
      }
      if (body.status === "ACTIVE") {
        saveReady(body, true);
        return;
      }
      if (body.status === "SUBMITTED" && body.transactionHash && body.name) {
        const submitted = {
          ...claimReference,
          name: body.name,
          transactionHash: body.transactionHash,
        };
        setPending(submitted);
        writePendingClaim(userId, submitted);
        setPhase("CONFIRMING");
      }
    } catch {
      setError({
        message:
          "Your request may still be processing. Check again before retrying.",
        action: "Check again",
      });
      setPhase("ERROR");
    }
  };

  const handleReceiving = useCallback(
    (receiving: import("../../shared/settlement-types").ReceivingStatusDto) => {
      if (identity)
        onIdentityDetailsChange({ ...identity.technical, receiving });
    },
    [identity, onIdentityDetailsChange],
  );

  if (phase === "READY" && identity) {
    return (
      <IdentityHome
        identity={identity}
        justVerified={justVerified}
        workspaceId={workspace.id}
        requestedReceivingRelationshipId={requestedReceivingRelationshipId}
        onReceivingChange={handleReceiving}
      />
    );
  }
  if (phase === "REVIEW" && availability.status === "available") {
    return (
      <IdentityClaimReview
        name={availability.name}
        canClaim={auth.ready && auth.walletStatus === "READY"}
        walletMessage={
          auth.walletStatus === "READY"
            ? undefined
            : "Finish your personal setup before claiming an identity."
        }
        onBack={() => setPhase("EDIT")}
        onClaim={() => void claim()}
      />
    );
  }
  if (
    phase === "SUBMITTING" ||
    phase === "CONFIRMING" ||
    phase === "VERIFYING" ||
    phase === "CHECKING"
  ) {
    return (
      <IdentityProgress
        name={selectedName}
        phase={phase}
        onCheckAgain={
          pending && phase !== "SUBMITTING"
            ? () => void checkStatus(pending)
            : undefined
        }
      />
    );
  }
  if (phase === "ERROR" && error) {
    return (
      <IdentityError
        name={selectedName || undefined}
        message={error.message}
        actionLabel={error.action}
        onAction={() => {
          if (error.action === "Check again" && pending) {
            void checkStatus(pending);
            return;
          }
          clearPendingClaim(userId, workspace.id);
          setPending(null);
          setError(null);
          setLabel("");
          setSelectedName("");
          setAvailability({ status: "idle" });
          setPhase("EDIT");
          onPendingChange(false);
        }}
      />
    );
  }
  return (
    <IdentitySetupForm
      label={label}
      availability={availability}
      onLabelChange={(next) => {
        requestSequence.current += 1;
        setLabel(next);
        setAvailability({ status: "idle" });
      }}
      onBlur={() => {
        if (label.trim()) void checkAvailability(label);
      }}
      onReview={() => {
        if (availability.status === "available") setPhase("REVIEW");
      }}
    />
  );
}
