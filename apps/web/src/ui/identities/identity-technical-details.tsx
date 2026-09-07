"use client";

import { useState } from "react";

import type { IdentityTechnicalDetails as IdentityDetails } from "../../shared/identity-types";
import { InspectorSection } from "../inspector-section";
import { StatusText } from "../status-text";

export function IdentityTechnicalDetails({
  details,
}: {
  details: IdentityDetails;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <InspectorSection title="Basin identity">
        <StatusText label="Identity" value={details.name} />
        <StatusText
          label="Controller"
          value={details.controllerAddress}
          technical
        />
        <StatusText
          label="Registry"
          value={details.registryAddress}
          technical
        />
        <StatusText
          label="Resolver proxy"
          value={details.resolverAddress}
          technical
        />
        <StatusText
          label="Resolver implementation"
          value={details.resolverImplementationAddress}
          technical
        />
        <StatusText
          label="Record version"
          value={String(details.recordVersion)}
          technical
        />
        <StatusText
          label="Identity epoch"
          value={details.identityEpoch}
          technical
        />
      </InspectorSection>

      <InspectorSection title="Authority proof">
        <StatusText label="Identity record" value="Controller can update" />
        <StatusText label="Transfer" value="Disabled" />
        <StatusText label="Bootstrap authority" value="Removed" />
        <StatusText label="Permission profile" value="Verified" />
        <StatusText
          label="Profile hash"
          value={details.permissionProfileHash}
          technical
        />
      </InspectorSection>

      <InspectorSection title="Chain evidence">
        <StatusText label="Network" value={details.networkName} />
        <StatusText
          label="Chain ID"
          value={String(details.chainId)}
          technical
        />
        <StatusText
          label="Checked block"
          value={details.blockNumber}
          technical
        />
        <StatusText label="Checked at" value={details.checkedAt} technical />
        {details.transactionHash ? (
          <>
            <StatusText
              label="Transaction"
              value={details.transactionHash}
              technical
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={`https://sepolia.etherscan.io/tx/${details.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex min-h-11 items-center text-sm font-medium underline decoration-line-strong underline-offset-4"
              >
                View on explorer
              </a>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(details.transactionHash!);
                  setCopied(true);
                }}
                className="focus-ring min-h-11 rounded-sm px-3 text-sm font-medium"
              >
                Copy transaction
              </button>
              <span className="text-sm text-state-success" aria-live="polite">
                {copied ? "Transaction copied" : ""}
              </span>
            </div>
          </>
        ) : null}
      </InspectorSection>
    </>
  );
}
