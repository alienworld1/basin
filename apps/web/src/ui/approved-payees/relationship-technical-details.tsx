import type { RelationshipTechnicalDetails } from "../../shared/approved-payee-types";
import { InspectorSection } from "../inspector-section";
import { StatusText } from "../status-text";

export function RelationshipTechnicalDetails({
  details,
}: {
  details: RelationshipTechnicalDetails;
}) {
  if (!details) return null;
  return (
    <InspectorSection title="Approved payee">
      <StatusText label="Network" value={details.network} />
      {details.registryAddress ? (
        <StatusText
          label="Registry"
          value={details.registryAddress}
          technical
        />
      ) : null}
      {details.relationshipTokenId ? (
        <StatusText
          label="Token ID"
          value={details.relationshipTokenId}
          technical
        />
      ) : null}
      {details.generationId ? (
        <StatusText label="Generation" value={details.generationId} technical />
      ) : null}
      {details.resolverAddress ? (
        <StatusText
          label="Resolver"
          value={details.resolverAddress}
          technical
        />
      ) : null}
      {details.resolverImplementationCodeHash ? (
        <StatusText
          label="Resolver code"
          value={details.resolverImplementationCodeHash}
          technical
        />
      ) : null}
      {details.securityRootCommitment ? (
        <StatusText
          label="Accepted root"
          value={details.securityRootCommitment}
          technical
        />
      ) : null}
      {details.activationTransactionHash ? (
        <StatusText
          label="Activation"
          value={details.activationTransactionHash}
          technical
        />
      ) : null}
      {details.lastVerifiedAt ? (
        <StatusText
          label="Verified"
          value={new Date(details.lastVerifiedAt).toLocaleString()}
        />
      ) : null}
    </InspectorSection>
  );
}
