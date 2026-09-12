import type { ApprovedPayeeDetailDto } from "../../shared/approved-payee-types";
import { Button } from "../button";

function acceptanceLabel(status: ApprovedPayeeDetailDto["status"]) {
  if (status === "ACTIVE") return "Accepted by recipient";
  if (status === "PENDING") return "Recipient acceptance pending";
  if (status === "REVOKED")
    return "Acceptance ended when this relationship was revoked";
  if (status === "EXPIRED") return "Acceptance ended when this approval expired";
  return "Approval needs to be re-established";
}

export function RelationshipDetail({
  detail,
  busy,
  onAccept,
  onSetupReceiving,
  onReapprove,
  onRevoke,
  onCheck,
  onCreateExpectedPayment,
}: {
  detail: ApprovedPayeeDetailDto;
  busy: boolean;
  onAccept: () => void;
  onSetupReceiving: () => void;
  onReapprove: () => void;
  onRevoke: () => void;
  onCheck: () => void;
  onCreateExpectedPayment?: () => void;
}) {
  const expiry = detail.expiresAt
    ? new Date(detail.expiresAt).toLocaleString(undefined, {
        timeZoneName: "short",
      })
    : "Not confirmed";
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-ink-tertiary">Basin identity</p>
        <h2 className="mt-1 wrap-anywhere text-xl font-semibold">
          {detail.payeeName}
        </h2>
        {detail.payeeDisplayName ? (
          <p className="mt-1 text-sm text-ink-secondary">
            {detail.payeeDisplayName}
          </p>
        ) : null}
      </div>
      <div className="border-y border-line py-5">
        <p
          className={`font-medium ${detail.status === "ACTIVE" ? "text-state-success" : detail.status === "REVOKED" ? "text-state-danger" : "text-state-warning"}`}
        >
          {detail.statusLabel}
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-ink-tertiary">Relationship</dt>
            <dd className="mt-1 wrap-anywhere">
              {detail.relationshipName ?? "Awaiting organization authorization"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Approval expires</dt>
            <dd className="mt-1">{expiry}</dd>
          </div>
        </dl>
      </div>
      <div className="space-y-3 text-sm">
        <p>
          <span className="font-medium">
            Approved by {detail.organizationName}
          </span>
          <br />
          <span className="text-ink-secondary">
            The organization controls whether this approval stays valid.
          </span>
        </p>
        <p>
          <span className="font-medium">
            {acceptanceLabel(detail.status)}
          </span>
          <br />
          <span className="text-ink-secondary">
            {detail.payeeName} controls where payments settle.
          </span>
        </p>
      </div>
      {detail.blockingReasons.length ? (
        <div className="space-y-2" role="status">
          {detail.blockingReasons.map((reason) => (
            <p key={reason} className="text-sm text-ink-secondary">
              {reason}
            </p>
          ))}
        </div>
      ) : null}
      {detail.operation ? (
        <div className="border-l-2 border-line-strong pl-4">
          <p className="text-sm font-medium">{detail.operation.message}</p>
          <p className="mt-1 text-xs text-ink-tertiary">
            Updated {new Date(detail.operation.updatedAt).toLocaleString()}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {onCreateExpectedPayment ? (
          <Button disabled={busy} onClick={onCreateExpectedPayment}>
            Create expected payment
          </Button>
        ) : null}
        {detail.canSetupReceiving ? (
          <Button disabled={busy} onClick={onSetupReceiving}>
            Set up receiving
          </Button>
        ) : null}
        {detail.canAccept ? (
          <Button disabled={busy} onClick={onAccept}>
            {busy ? "Preparing acceptance…" : "Accept relationship"}
          </Button>
        ) : null}
        {detail.canReapprove ? (
          <Button disabled={busy} onClick={onReapprove}>
            Re-establish approval
          </Button>
        ) : null}
        {detail.canRevoke ? (
          <Button disabled={busy} onClick={onRevoke}>
            Revoke payee
          </Button>
        ) : null}
        <Button disabled={busy} onClick={onCheck}>
          Check status
        </Button>
      </div>
      {detail.history.length ? (
        <div>
          <h3 className="text-sm font-semibold">Relationship history</h3>
          <ol className="mt-3 space-y-3 border-l border-line pl-4">
            {detail.history.map((item) => (
              <li key={item.id} className="text-sm">
                <p>{item.type.toLowerCase().replaceAll("_", " ")}</p>
                <p className="text-xs text-ink-tertiary">
                  {new Date(item.occurredAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
