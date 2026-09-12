import { useState } from "react";

import type { ApprovedPayeeDetailDto } from "../../shared/approved-payee-types";
import { Button } from "../button";

export type RevocationPhase =
  | "idle"
  | "preparing"
  | "authorizing"
  | "checking";

export function RevocationReview({
  detail,
  phase,
  error,
  onRevoke,
  onKeepApproval,
  onReviewLatest,
}: {
  detail: ApprovedPayeeDetailDto;
  phase: RevocationPhase;
  error?: string;
  onRevoke: (reason?: string) => void;
  onKeepApproval: () => void;
  onReviewLatest: () => void;
}) {
  const [reason, setReason] = useState("");
  const normalizedReason = reason.trim();
  const reasonTooLong = normalizedReason.length > 240;
  const busy = phase !== "idle";
  const phaseCopy =
    phase === "preparing"
      ? "Preparing revocation…"
      : phase === "authorizing"
        ? "Organization approval required."
        : phase === "checking"
          ? "Revocation submitted. Checking the relationship…"
          : "";
  const stale = error?.includes("relationship changed");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-medium">Revoke {detail.payeeDisplayName ?? detail.payeeName}?</p>
        <p className="mt-2 wrap-anywhere text-sm text-ink-tertiary">
          {detail.payeeName}
        </p>
      </div>
      <div className="border-y border-line py-5 text-sm leading-relaxed text-ink-secondary">
        <p>
          This ends {detail.organizationName}&apos;s approval and blocks future
          payments through this relationship.
        </p>
        <p className="mt-3">
          It won&apos;t change {detail.payeeDisplayName ?? detail.payeeName}&apos;s
          Basin identity or receiving account.
        </p>
        <p className="mt-3">
          A payment already submitted can&apos;t be cancelled here and will keep
          checking its final result.
        </p>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-ink-tertiary">Relationship</dt>
          <dd className="mt-1 wrap-anywhere">{detail.relationshipName}</dd>
        </div>
        <div>
          <dt className="text-ink-tertiary">Approval expires</dt>
          <dd className="mt-1">
            {detail.expiresAt
              ? new Date(detail.expiresAt).toLocaleString()
              : "Not confirmed"}
          </dd>
        </div>
      </dl>
      <div>
        <label htmlFor="revocation-reason" className="block text-sm font-medium">
          Internal reason (optional)
        </label>
        <textarea
          id="revocation-reason"
          value={reason}
          disabled={busy}
          rows={3}
          aria-describedby={reasonTooLong ? "revocation-reason-error" : undefined}
          onChange={(event) => setReason(event.target.value)}
          className="focus-ring mt-2 min-h-24 w-full resize-y rounded-sm border border-line bg-surface px-3 py-2"
        />
        {reasonTooLong ? (
          <p id="revocation-reason-error" role="alert" className="mt-2 text-sm text-state-danger">
            Keep the reason under 240 characters.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-tertiary">
            Visible only in this organization&apos;s audit history.
          </p>
        )}
      </div>
      {phaseCopy ? (
        <p aria-live="polite" className="text-sm font-medium">
          {phaseCopy}
        </p>
      ) : null}
      {error ? (
        <div role="alert">
          <p className="text-sm text-state-danger">{error}</p>
          {stale ? (
            <Button className="mt-3" onClick={onReviewLatest}>
              Review latest details
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          className="border-state-danger text-state-danger hover:bg-surface-muted"
          disabled={busy || reasonTooLong}
          onClick={() => onRevoke(normalizedReason || undefined)}
        >
          {busy ? "Revoking payee…" : "Revoke payee"}
        </Button>
        <Button disabled={busy} onClick={onKeepApproval}>
          Keep approval
        </Button>
      </div>
    </div>
  );
}
