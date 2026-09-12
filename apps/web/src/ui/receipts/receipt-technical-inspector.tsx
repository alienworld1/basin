"use client";

import { useRef, useState } from "react";

import type {
  ReceiptDetailDto,
  ReceiptVerificationDto,
} from "../../shared/receipt-types";
import { InspectorSection } from "../inspector-section";
import { Sheet } from "../sheet";
import { StatusText } from "../status-text";

export function ReceiptTechnicalInspector({
  receipt,
  verification,
}: {
  receipt: ReceiptDetailDto;
  verification?: ReceiptVerificationDto;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring mt-8 min-h-11 text-sm font-medium underline underline-offset-4"
      >
        Technical details
      </button>
      <Sheet
        isOpen={open}
        title="Receipt technical details"
        onClose={() => setOpen(false)}
        returnFocusRef={trigger}
      >
        <p className="text-sm text-ink-secondary">
          Evidence for this receipt at the time of payment.
        </p>
        <InspectorSection title="Economic record">
          <StatusText
            label="Payment ID"
            value={receipt.technical.paymentId}
            technical
          />
          <StatusText
            label="Obligation"
            value={receipt.technical.obligationId}
            technical
          />
        </InspectorSection>
        <InspectorSection title="Approved payee">
          <StatusText label="Relationship" value={receipt.relationshipName} />
          <StatusText
            label="Generation token"
            value={receipt.relationshipTokenId}
            technical
          />
          <StatusText label="State at payment" value="Active" />
          <StatusText
            label="Relationship registry"
            value={receipt.technical.relationshipRegistry}
            technical
          />
          <StatusText
            label="Resolver proxy"
            value={receipt.technical.resolverProxy}
            technical
          />
          <StatusText
            label="Resolver implementation"
            value={receipt.technical.resolverImplementation}
            technical
          />
          <StatusText
            label="Identity epoch"
            value={receipt.technical.identityEpoch}
            technical
          />
        </InspectorSection>
        <InspectorSection title="Settlement authority">
          <StatusText
            label="Settlement epoch"
            value={receipt.settlementEpoch}
            technical
          />
          <StatusText
            label="Commitment"
            value={receipt.technical.settlementCommitment}
            technical
          />
          <StatusText
            label="Security root"
            value={receipt.technical.securityRootCommitment}
            technical
          />
        </InspectorSection>
        <InspectorSection title="Privy execution">
          <StatusText
            label="Execution path"
            value={receipt.technical.executionPath}
          />
        </InspectorSection>
        <InspectorSection title="Router transaction">
          <StatusText label="Network" value="Ethereum Sepolia" />
          <StatusText
            label="Router"
            value={receipt.technical.routerAddress}
            technical
          />
          <StatusText
            label="Version"
            value={receipt.technical.routerVersion}
            technical
          />
          <StatusText
            label="Transaction"
            value={receipt.technical.transactionHash}
            technical
          />
          {verification?.blockNumber ? (
            <StatusText
              label="Block"
              value={verification.blockNumber}
              technical
            />
          ) : null}
          {verification?.blockHash ? (
            <StatusText
              label="Block hash"
              value={verification.blockHash}
              technical
            />
          ) : null}
          {verification?.eventName ? (
            <StatusText
              label="Event"
              value={verification.eventName}
              technical
            />
          ) : null}
        </InspectorSection>
        {verification ? (
          <InspectorSection title="Verification">
            <StatusText label="Result" value={verification.status} />
            {verification.confirmations ? (
              <StatusText
                label="Confirmations"
                value={verification.confirmations}
                technical
              />
            ) : null}
            {verification.mismatches?.length ? (
              <StatusText
                label="Mismatched fields"
                value={verification.mismatches.join(", ")}
                technical
              />
            ) : null}
          </InspectorSection>
        ) : null}
      </Sheet>
    </>
  );
}
