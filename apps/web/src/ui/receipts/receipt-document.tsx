"use client";

import { useEffect, useRef } from "react";

import { Button } from "../button";
import type {
  ReceiptDetailDto,
  ReceiptVerificationDto,
} from "../../shared/receipt-types";
import { ReceiptTechnicalInspector } from "./receipt-technical-inspector";

export function ReceiptDocument({
  receipt,
  verification,
  checking,
  onCheckVerification,
  onBack,
}: {
  receipt: ReceiptDetailDto;
  verification?: ReceiptVerificationDto;
  checking: boolean;
  onCheckVerification: () => void;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [receipt.id]);
  const status = verification?.status ?? "CHECKING";
  const heading = `${receipt.payerOrganizationName} paid ${receipt.payeeName}.`;
  return (
    <section
      aria-labelledby="receipt-heading"
      className="border-t border-line-strong pt-8"
    >
      <Button onClick={onBack}>Back to activity</Button>
      <p className="mt-8 text-sm text-ink-tertiary">Settled</p>
      <h1
        ref={headingRef}
        id="receipt-heading"
        tabIndex={-1}
        className="mt-2 wrap-break-word text-title font-semibold tracking-[-0.03em]"
      >
        {heading}
      </h1>
      <p className="mt-6 text-3xl font-semibold tabular-nums">
        {receipt.amount}{" "}
        <span className="text-lg text-ink-secondary">USDC</span>
      </p>
      <dl className="mt-8 space-y-5 border-y border-line py-6 text-sm">
        <div>
          <dt className="text-ink-tertiary">Purpose</dt>
          <dd className="mt-1 wrap-break-word">{receipt.purpose}</dd>
        </div>
        {receipt.reference ? (
          <div>
            <dt className="text-ink-tertiary">Reference</dt>
            <dd className="mt-1 wrap-break-word">{receipt.reference}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ink-tertiary">Paid on</dt>
          <dd className="mt-1">
            {new Date(receipt.settledAt).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-ink-tertiary">Approved payee at payment</dt>
          <dd className="mt-1">
            Active at payment · {receipt.relationshipName}
          </dd>
        </div>
        <div>
          <dt className="text-ink-tertiary">Settlement</dt>
          <dd className="mt-1">Completed · Epoch {receipt.settlementEpoch}</dd>
        </div>
        <div>
          <dt className="text-ink-tertiary">Basin identity</dt>
          <dd className="mt-1 wrap-anywhere">{receipt.payeeIdentity}</dd>
        </div>
      </dl>
      <div className="mt-6" aria-live="polite">
        <p
          className={
            status === "MISMATCH"
              ? "font-medium text-state-danger"
              : "font-medium"
          }
        >
          {status === "CHECKING"
            ? "Checking receipt evidence…"
            : status === "VERIFIED"
              ? "Receipt verified"
              : status === "MISMATCH"
                ? "Receipt needs review."
                : status === "UNSUPPORTED"
                  ? "This receipt uses a Router version this app can't verify yet."
                  : "Verification temporarily unavailable."}
        </p>
        {verification ? (
          <p className="mt-2 text-sm text-ink-secondary">
            {verification.summary}
          </p>
        ) : null}
        {status === "EVIDENCE_UNAVAILABLE" ? (
          <Button
            className="mt-4"
            disabled={checking}
            onClick={onCheckVerification}
          >
            {checking ? "Checking verification…" : "Check verification"}
          </Button>
        ) : null}
      </div>
      <ReceiptTechnicalInspector
        receipt={receipt}
        verification={verification}
      />
    </section>
  );
}
