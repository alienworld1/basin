import type { ReceivingStatusDto } from "../../shared/settlement-types";
import { StatusText } from "../status-text";
export function ReceivingEvidence({
  details,
}: {
  details: ReceivingStatusDto;
}) {
  return (
    <details className="mt-6 border-t border-line pt-4">
      <summary className="focus-ring min-h-11 cursor-pointer text-sm font-medium">
        Technical details
      </summary>
      <dl className="space-y-3 text-sm">
        <StatusText label="Network" value={details.asset.network} />
        <StatusText
          label="Asset contract"
          value={details.asset.address}
          technical
        />
        <StatusText
          label="Authority"
          value={
            details.trust === "PREFERENCE_ONLY"
              ? "Saved preference only"
              : details.trust.replaceAll("_", " ")
          }
        />
        {details.technical ? (
          <>
            <StatusText
              label="Relationship token"
              value={details.technical.relationshipTokenId}
              technical
            />
            <StatusText
              label="Identity epoch"
              value={details.technical.identityEpoch}
              technical
            />
            <StatusText
              label="Resolver"
              value={details.technical.resolver}
              technical
            />
            <StatusText
              label="Permission profile"
              value={details.technical.profile}
              technical
            />
            <StatusText
              label="Approval independently verified"
              value={details.technical.approvalVerified ? "Yes" : "No"}
            />
          </>
        ) : null}
        {details.current ? (
          <StatusText
            label="Settlement commitment"
            value={details.current.commitment}
            technical
          />
        ) : null}
        {details.blockNumber ? (
          <StatusText
            label="Observed block"
            value={details.blockNumber}
            technical
          />
        ) : null}
      </dl>
    </details>
  );
}
