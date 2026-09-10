"use client";
import { animated } from "@react-spring/web";
import { useRouter } from "next/navigation";
import type { ReceivingStatusDto } from "../../shared/settlement-types";
import { Button } from "../button";
import { Sheet } from "../sheet";
import { ReceivingReview } from "./receiving-review";
import { ReceivingHistory } from "./receiving-history";
import { ReceivingPendingStatus } from "./receiving-pending-status";
import { useReceiving } from "./use-receiving";

export function Receiving({
  workspaceId,
  requestedRelationshipId,
  onDetailsChange,
}: {
  workspaceId: string;
  requestedRelationshipId?: string;
  onDetailsChange: (details: ReceivingStatusDto) => void;
}) {
  const {
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
  } = useReceiving(workspaceId, onDetailsChange, requestedRelationshipId);
  const router = useRouter();
  return (
    <section
      className="mt-8 max-w-xl border-t border-line pt-8"
      aria-labelledby="receiving-heading"
    >
      <h2
        ref={heading}
        id="receiving-heading"
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        Receiving account
      </h2>
      <div
        className="mt-4 min-h-28"
        aria-live="polite"
        aria-busy={checking || busy}
      >
        {checking ? (
          <p className="text-sm text-ink-secondary">
            Checking receiving details…
          </p>
        ) : null}
        {details ? (
          <>
            {details.relationships.length > 1 ? (
              <div className="mb-6 space-y-2">
                <label
                  htmlFor="receiving-relationship"
                  className="block text-sm font-medium"
                >
                  Payment relationship
                </label>
                <select
                  id="receiving-relationship"
                  disabled={busy}
                  value={details.relationshipId ?? ""}
                  onChange={(event) => {
                    setDetails(null);
                    setChecking(true);
                    setRelationship(event.target.value);
                  }}
                  className="focus-ring min-h-11 w-full min-w-0 rounded-sm border border-line bg-surface px-3 text-sm"
                >
                  {details.relationships.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name ?? "Relationship awaiting setup"}
                    </option>
                  ))}
                </select>
              </div>
            ) : details.relationships[0]?.name ? (
              <p className="mb-4 wrap-anywhere text-sm font-medium">
                {details.relationships[0].name}
              </p>
            ) : null}
            <p className="font-medium">
              {details.pending &&
              ["SUBMITTED", "VERIFYING", "UNKNOWN"].includes(
                details.pending.status,
              )
                ? "Receiving change in progress"
                : details.status === "SAVED"
                ? "Receiving account saved"
                : details.status === "VERIFIED"
                  ? `Receiving version ${details.current?.epoch}`
                  : details.status === "VERIFYING"
                    ? "Checking your receiving account…"
                    : details.status === "NEEDS_REVIEW"
                      ? "Receiving details need review"
                      : "Set up receiving"}
            </p>
            {transitions((style, item) =>
              item ? (
                <animated.p
                  style={style}
                  className="mt-3 wrap-anywhere font-mono text-sm"
                >
                  {item.destination}
                </animated.p>
              ) : null,
            )}
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              {details.message}
            </p>
            {details.pending ? (
              <ReceivingPendingStatus
                operation={details.pending}
                busy={busy}
                onCheck={async () => {
                  setBusy(true);
                  try {
                    await request("/api/settlement/reconcile", {
                      workspaceId,
                      operationId: details.pending!.id,
                    });
                    await load();
                  } catch (caught) {
                    setError((caught as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
                onStartOver={async () => {
                  setBusy(true);
                  try {
                    await request("/api/settlement/reconcile", {
                      workspaceId,
                      operationId: details.pending!.id,
                      walletOutcome: "NOT_SUBMITTED",
                    });
                    await load();
                  } catch (caught) {
                    setError((caught as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
            {details.prepared && details.pending ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button ref={trigger} disabled={busy} onClick={openReview}>
                  Review change
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await request(
                        "/api/settlement/prepare",
                        { workspaceId, operationId: details.pending!.id },
                        "DELETE",
                      );
                      await load();
                    } catch (caught) {
                      setError((caught as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel change
                </Button>
              </div>
            ) : null}
            {details.canEdit && !details.pending ? (
              <Button
                ref={trigger}
                className="mt-6"
                disabled={busy || auth.walletStatus !== "READY"}
                onClick={openReview}
              >
                {details.relationshipId
                  ? details.current
                    ? "Change receiving account"
                    : "Set up receiving"
                  : details.preference
                    ? "Change receiving account"
                    : "Set up receiving"}
              </Button>
            ) : !details.pending ? (
              <Button className="mt-6" onClick={() => void load()}>
                Check again
              </Button>
            ) : null}
            {auth.walletStatus !== "READY" ? (
              <p className="mt-3 text-sm text-ink-secondary">
                Reconnect your account to make changes.
              </p>
            ) : null}
            <ReceivingHistory versions={details.history} />
            {requestedRelationshipId &&
            details.relationshipId === requestedRelationshipId ? (
              <Button
                className="mt-6"
                disabled={busy || Boolean(details.pending)}
                onClick={() =>
                  router.push(
                    `/app?workspace=${workspaceId}&relationship=${requestedRelationshipId}`,
                  )
                }
              >
                Return to relationship
              </Button>
            ) : null}
          </>
        ) : null}
        {progress ? <p className="mt-4 text-sm">{progress}</p> : null}
      </div>
      {error ? (
        <div role="alert" className="mt-4 space-y-3">
          <p className="text-sm text-state-danger">{error}</p>
          {!details ? (
            <Button onClick={() => void load()}>Check again</Button>
          ) : null}
        </div>
      ) : null}
      <Sheet
        isOpen={open}
        title="Receiving account"
        onClose={closeReview}
        returnFocusRef={trigger}
        onClosed={afterClosed}
      >
        {details && open ? (
          <>
            <ReceivingReview
              details={details}
              busy={busy}
              onPrepare={prepareReview}
              onConfirm={(destination) => void confirm(destination)}
            />
            {progress ? (
              <p role="status" className="mt-6 text-sm">
                {progress}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-6 text-sm text-state-danger">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </section>
  );
}
