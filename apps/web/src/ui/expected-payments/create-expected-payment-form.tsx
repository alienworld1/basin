"use client";

import { useRef, useState } from "react";

import type { EligiblePayeeDto } from "../../shared/expected-payment-types";
import { Button } from "../button";

type FieldErrors = Partial<
  Record<"payee" | "amount" | "purpose" | "reference", string>
>;

function validate(values: {
  payee: string;
  amount: string;
  purpose: string;
  reference: string;
}) {
  const errors: FieldErrors = {};
  if (!values.payee) errors.payee = "Select an active approved payee.";
  if (!/^\d+(?:\.\d{1,6})?$/.test(values.amount)) {
    errors.amount = "Enter a valid USDC amount with up to 6 decimal places.";
  } else if (
    BigInt(
      values.amount
        .replace(".", "")
        .padEnd(
          values.amount.includes(".")
            ? values.amount.split(".")[0].length + 6
            : values.amount.length + 6,
          "0",
        ),
    ) === 0n
  ) {
    errors.amount = "Enter an amount greater than zero.";
  }
  if (!values.purpose.trim())
    errors.purpose = "Enter what this payment is for.";
  else if (values.purpose.trim().length > 240)
    errors.purpose = "Keep the purpose under 240 characters.";
  if (values.reference.trim().length > 160)
    errors.reference = "Keep the reference under 160 characters.";
  return errors;
}

export function CreateExpectedPaymentForm({
  organizationName,
  payees,
  initialPayeeId,
  busy,
  serverError,
  uncertain,
  onSubmit,
}: {
  organizationName: string;
  payees: EligiblePayeeDto[];
  initialPayeeId?: string;
  busy: boolean;
  serverError?: string;
  uncertain: boolean;
  onSubmit: (values: {
    approvedPayeeId: string;
    amount: string;
    purpose: string;
    reference?: string;
  }) => void;
}) {
  const [payee, setPayee] = useState(initialPayeeId ?? "");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");
  const [step, setStep] = useState<"details" | "review">("details");
  const [errors, setErrors] = useState<FieldErrors>({});
  const payeeRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const purposeRef = useRef<HTMLTextAreaElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const selected = payees.find((item) => item.id === payee);
  const review = () => {
    const next = validate({ payee, amount, purpose, reference });
    setErrors(next);
    const first = Object.keys(next)[0] as keyof FieldErrors | undefined;
    ({
      payee: payeeRef,
      amount: amountRef,
      purpose: purposeRef,
      reference: referenceRef,
    })[first ?? "payee"].current?.focus();
    if (!first) setStep("review");
  };

  if (step === "review" && selected) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-ink-tertiary">Review</p>
          <p className="mt-3 text-lg leading-relaxed">
            {organizationName} expects to pay {selected.displayName}{" "}
            <span className="font-semibold tabular-nums">{amount} USDC</span>{" "}
            for {purpose.trim()}.
          </p>
          {reference.trim() ? (
            <p className="mt-2 text-sm text-ink-secondary">
              Reference · {reference.trim()}
            </p>
          ) : null}
        </div>
        <div className="border-y border-line py-5 text-sm">
          <p className="font-medium">{selected.identity}</p>
          {selected.relationshipName ? (
            <p className="mt-1 wrap-anywhere text-ink-secondary">
              {selected.relationshipName}
            </p>
          ) : null}
          <p className="mt-4 leading-relaxed text-ink-secondary">
            Receiving details are controlled by the payee and aren&apos;t
            entered here.
          </p>
        </div>
        {serverError ? (
          <p role="alert" className="text-sm text-state-danger">
            {serverError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy || uncertain}
            onClick={() =>
              onSubmit({
                approvedPayeeId: payee,
                amount,
                purpose: purpose.trim(),
                reference: reference.trim() || undefined,
              })
            }
          >
            {busy ? "Creating expected payment…" : "Create expected payment"}
          </Button>
          <Button disabled={busy} onClick={() => setStep("details")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.keys(errors).length ? (
        <div
          role="alert"
          className="border-l-2 border-state-danger pl-4 text-sm text-state-danger"
        >
          Check the highlighted details before continuing.
        </div>
      ) : null}
      <div>
        <label htmlFor="expected-payee" className="block text-sm font-medium">
          Approved payee
        </label>
        <select
          ref={payeeRef}
          id="expected-payee"
          value={payee}
          onChange={(event) => setPayee(event.target.value)}
          aria-describedby={errors.payee ? "expected-payee-error" : undefined}
          className="focus-ring mt-2 min-h-11 w-full rounded-sm border border-line bg-surface px-3"
        >
          <option value="">Select a payee</option>
          {payees.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName} · {item.identity}
            </option>
          ))}
        </select>
        {errors.payee ? (
          <p
            id="expected-payee-error"
            className="mt-1 text-sm text-state-danger"
          >
            {errors.payee}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="expected-amount" className="block text-sm font-medium">
          Amount
        </label>
        <div className="mt-2 flex min-h-11 items-center rounded-sm border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-focus">
          <input
            ref={amountRef}
            id="expected-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby={`expected-amount-help${errors.amount ? " expected-amount-error" : ""}`}
            className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
          />
          <span className="text-sm font-medium text-ink-secondary">USDC</span>
        </div>
        <p id="expected-amount-help" className="mt-1 text-xs text-ink-tertiary">
          Enter the exact amount this payment should satisfy.
        </p>
        {errors.amount ? (
          <p
            id="expected-amount-error"
            className="mt-1 text-sm text-state-danger"
          >
            {errors.amount}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="expected-purpose" className="block text-sm font-medium">
          Purpose
        </label>
        <textarea
          ref={purposeRef}
          id="expected-purpose"
          rows={3}
          maxLength={241}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          aria-describedby={`expected-purpose-help${errors.purpose ? " expected-purpose-error" : ""}`}
          className="focus-ring mt-2 w-full rounded-sm border border-line bg-surface px-3 py-2"
        />
        <p
          id="expected-purpose-help"
          className="mt-1 text-xs text-ink-tertiary"
        >
          Describe what this payment is for.
        </p>
        {errors.purpose ? (
          <p
            id="expected-purpose-error"
            className="mt-1 text-sm text-state-danger"
          >
            {errors.purpose}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="expected-reference"
          className="block text-sm font-medium"
        >
          Reference (optional)
        </label>
        <input
          ref={referenceRef}
          id="expected-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          aria-describedby={`expected-reference-help${errors.reference ? " expected-reference-error" : ""}`}
          className="focus-ring mt-2 min-h-11 w-full rounded-sm border border-line bg-surface px-3"
        />
        <p
          id="expected-reference-help"
          className="mt-1 text-xs text-ink-tertiary"
        >
          Add an invoice or reconciliation reference if you have one.
        </p>
        {errors.reference ? (
          <p
            id="expected-reference-error"
            className="mt-1 text-sm text-state-danger"
          >
            {errors.reference}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <p role="alert" className="text-sm text-state-danger">
          {serverError}
        </p>
      ) : null}
      <Button disabled={busy} onClick={review}>
        Review expected payment
      </Button>
    </div>
  );
}
