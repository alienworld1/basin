import type { TreasuryTechnicalDetails as Details } from "../../shared/treasury-types";
import { InspectorSection } from "../inspector-section";
import { StatusText } from "../status-text";

export function TreasuryTechnicalDetails({ details }: { details: Details }) {
  return (
    <InspectorSection title="Treasury controls">
      <StatusText label="Provider" value="Privy" />
      {details.walletAddress ? <StatusText label="Wallet address" value={details.walletAddress} technical /> : null}
      {details.privyOrganizationId ? <StatusText label="Organization reference" value={details.privyOrganizationId} technical /> : null}
      {details.privyWalletId ? <StatusText label="Wallet reference" value={details.privyWalletId} technical /> : null}
      {details.ownerQuorumId ? <StatusText label="Administrator authority" value={details.ownerQuorumId} technical /> : null}
      {details.ownerQuorumThreshold ? <StatusText label="Approval threshold" value={String(details.ownerQuorumThreshold)} /> : null}
      {details.routineSignerId ? <StatusText label="Routine access reference" value={details.routineSignerId} technical /> : null}
      {details.routinePolicyId ? <StatusText label="Payment policy reference" value={details.routinePolicyId} technical /> : null}
      {details.routinePolicyFingerprint ? <StatusText label="Policy fingerprint" value={details.routinePolicyFingerprint} technical /> : null}
      {details.routerAddress ? <StatusText label="Basin Router" value={details.routerAddress} technical /> : null}
      {details.routerVersion ? <StatusText label="Router version" value={details.routerVersion} technical /> : null}
      {details.routineLimit ? <StatusText label="Routine limit (base units)" value={details.routineLimit} technical /> : null}
      <StatusText label="Last verified" value={details.lastVerifiedAt ? new Date(details.lastVerifiedAt).toLocaleString() : "Not yet verified"} />
    </InspectorSection>
  );
}
