import type { ResolvedPayeeDto } from "../../shared/approved-payee-types";
import { Button } from "../button";

export function ApprovalReview({
  organizationName,
  payee,
  expiry,
  busy,
  onExpiryChange,
  onApprove,
}: {
  organizationName: string;
  payee: ResolvedPayeeDto;
  expiry: string;
  busy: boolean;
  onExpiryChange: (value: string) => void;
  onApprove: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-tertiary">Basin identity</p>
        <p className="mt-1 wrap-anywhere text-lg font-semibold">
          {payee.canonicalName}
        </p>
        <p className="mt-2 text-sm text-state-success">
          Active identity verified
        </p>
      </div>
      <div>
        <label htmlFor="approval-expiry" className="block text-sm font-medium">
          Approval expires
        </label>
        <input
          id="approval-expiry"
          type="datetime-local"
          value={expiry}
          max={payee.maximumExpiry.slice(0, 16)}
          onChange={(event) => onExpiryChange(event.target.value)}
          className="focus-ring mt-2 min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm"
        />
        <p className="mt-2 text-xs text-ink-tertiary">
          {expiry
            ? new Date(expiry).toLocaleString(undefined, {
                timeZoneName: "short",
              })
            : "Choose a finite expiry."}
        </p>
      </div>
      <div className="border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-ink-secondary">
        <p>{organizationName} controls whether this approval stays valid.</p>
        <p>{payee.canonicalName} controls where payments settle.</p>
      </div>
      <p className="text-xs leading-relaxed text-ink-tertiary">
        Approval applies to this Basin identity. It does not verify a legal
        identity.
      </p>
      <Button disabled={busy || !expiry} onClick={onApprove}>
        {busy ? "Preparing approval…" : "Approve payee"}
      </Button>
    </div>
  );
}
