import type { ApprovedPayeeDetailDto } from "../../shared/approved-payee-types";
import { Button } from "../button";

export function ReapprovalReview({
  detail,
  expiry,
  busy,
  onExpiryChange,
  onReapprove,
}: {
  detail: ApprovedPayeeDetailDto;
  expiry: string;
  busy: boolean;
  onExpiryChange: (value: string) => void;
  onReapprove: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-tertiary">Basin identity</p>
        <p className="mt-1 wrap-anywhere text-lg font-semibold">
          {detail.payeeName}
        </p>
      </div>
      <div className="border-l-2 border-state-warning pl-4">
        <p className="font-medium">Approval needs to be re-established</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {detail.payeeName}&apos;s relationship authority changed. A new
          approval keeps {detail.organizationName} in control of who it pays;
          the recipient will then confirm where payments settle.
        </p>
      </div>
      <ol className="space-y-3 border-l border-line pl-4 text-sm">
        <li>
          <p className="font-medium">1. {detail.organizationName} approves</p>
          <p className="mt-1 text-ink-secondary">
            Create a new approval for this Basin identity.
          </p>
        </li>
        <li>
          <p className="font-medium">2. {detail.payeeName} accepts</p>
          <p className="mt-1 text-ink-secondary">
            The recipient confirms the current receiving authority before
            payments can resume.
          </p>
        </li>
      </ol>
      <div>
        <label htmlFor="reapproval-expiry" className="block text-sm font-medium">
          New approval expires
        </label>
        <input
          id="reapproval-expiry"
          type="datetime-local"
          value={expiry}
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
      <Button disabled={busy || !expiry} onClick={onReapprove}>
        {busy ? "Preparing new approval…" : "Create new approval"}
      </Button>
    </div>
  );
}
