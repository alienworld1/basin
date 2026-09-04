import { InspectorSection } from "./inspector-section";
import type { InspectorDetails } from "./shell-types";
import { StatusText } from "./status-text";

type TechnicalDetailsProps = {
  details: InspectorDetails;
};

export function TechnicalDetails({ details }: TechnicalDetailsProps) {
  return (
    <>
      <p className="max-w-sm text-sm leading-relaxed text-ink-secondary">
        Read-only application and network configuration. No external services
        are contacted for this summary.
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
        <StatusText label="Chain ID" value={String(details.chainId)} technical />
        <StatusText
          label="RPC"
          value={details.rpcStatus === "configured" ? "Configured" : "Not required"}
        />
      </InspectorSection>
    </>
  );
}
