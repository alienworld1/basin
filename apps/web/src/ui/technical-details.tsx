import { ReceivingEvidence } from "./receiving/receiving-evidence";
import { InspectorSection } from "./inspector-section";
import type { InspectorDetails } from "./shell-types";
import { StatusText } from "./status-text";
import type { IdentityTechnicalDetails as IdentityDetails } from "../shared/identity-types";
import { IdentityTechnicalDetails } from "./identities/identity-technical-details";

type TechnicalDetailsProps = {
  details: InspectorDetails;
  identityDetails?: IdentityDetails;
};

export function TechnicalDetails({
  details,
  identityDetails,
}: TechnicalDetailsProps) {
  return (
    <>
      <p className="max-w-sm text-sm leading-relaxed text-ink-secondary">
        Read-only application, network, and verified identity evidence.
      </p>

      <InspectorSection title="Application">
        <StatusText label="Environment" value={details.environment} />
        <StatusText
          label="Revision"
          value={details.version ?? "Not provided"}
          technical={Boolean(details.version)}
        />
      </InspectorSection>

      <InspectorSection title="Network">
        <StatusText label="Network" value={details.networkName} />
        <StatusText
          label="Chain ID"
          value={String(details.chainId)}
          technical
        />
        <StatusText
          label="RPC"
          value={
            details.rpcStatus === "configured" ? "Configured" : "Not required"
          }
        />
      </InspectorSection>
      {identityDetails ? (
        <IdentityTechnicalDetails details={identityDetails} />
      ) : null}
      {identityDetails?.receiving ? (
        <ReceivingEvidence details={identityDetails.receiving} />
      ) : null}
    </>
  );
}
