"use client";
import {
  checksumReceivingAddress,
  receivingAddress,
} from "@basin/ens/settlement-record";
import { useState } from "react";
import type {
  PreparedReceivingDto,
  ReceivingStatusDto,
} from "../../shared/settlement-types";
import { Button } from "../button";
export function ReceivingReview({
  details,
  busy,
  onPrepare,
  onConfirm,
}: {
  details: ReceivingStatusDto;
  busy: boolean;
  onPrepare: (destination: string) => Promise<PreparedReceivingDto>;
  onConfirm: (destination: string) => void;
}) {
  const current = details.relationshipId
    ? details.current?.destination
    : details.preference?.destination;
  const [destination, setDestination] = useState(
    details.prepared?.destination ??
      current ??
      details.preference?.destination ??
      "",
  );
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [prepared, setPrepared] = useState<PreparedReceivingDto | null>(null);
  const relationship = details.relationships.find(
    (item) => item.id === details.relationshipId,
  );
  const nextEpoch = prepared?.epoch ?? "0";
  const oldDestination = prepared ? prepared.oldDestination : current;
  return (
    <form
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        try {
          const normalized = receivingAddress(destination);
          if (current?.toLowerCase() === normalized)
            throw new Error("This is already your receiving account.");
          setError(null);
          if (!review) {
            if (relationship) setPrepared(await onPrepare(normalized));
            setDestination(checksumReceivingAddress(normalized));
            setReview(true);
          } else onConfirm(normalized);
        } catch (caught) {
          setError((caught as Error).message);
        }
      }}
    >
      <p className="font-medium">You control where you receive</p>
      <p className="text-sm text-ink-secondary">
        {details.asset.symbol} · Ethereum Sepolia
      </p>
      {relationship ? (
        <p className="wrap-anywhere font-medium">
          {prepared?.relationshipName ?? relationship.name}
        </p>
      ) : null}
      {review ? (
        <div className="space-y-6">
          {oldDestination ? (
            <div>
              <p className="mb-2 text-sm text-ink-secondary">
                Current receiving account
              </p>
              <p className="wrap-anywhere font-mono text-sm">
                {oldDestination}
              </p>
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-sm text-ink-secondary">
              New receiving account
            </p>
            <p className="wrap-anywhere font-mono text-sm">{destination}</p>
          </div>
          {relationship ? (
            <>
              <p className="text-sm">
                Receiving version{" "}
                {BigInt(nextEpoch) > 0n
                  ? `${BigInt(nextEpoch) - 1n} → ${nextEpoch}`
                  : nextEpoch}
              </p>
              <p className="text-sm text-ink-secondary">
                Your Basin identity remains the same. This changes receiving
                details for this relationship. Completed payments keep their
                original details.
              </p>
              <div className="border-t border-line pt-4">
                <p className="text-sm font-medium">Your Basin account</p>
                <p className="mt-1 text-sm text-ink-secondary">
                  Your signed-in Privy account authorizes this change directly.
                  You do not need to connect an external wallet.
                </p>
                <p className="mt-2 wrap-anywhere font-mono text-xs text-ink-secondary">
                  {prepared?.transaction.from}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-secondary">
              Your account is saved privately. Receiving becomes active when a
              payment relationship is accepted.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label
            htmlFor="receiving-address"
            className="block text-sm font-medium"
          >
            Receiving account
          </label>
          <input
            id="receiving-address"
            value={destination}
            onChange={(event) => {
              setDestination(event.target.value);
              setError(null);
            }}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby="receiving-help receiving-error"
            autoComplete="off"
            spellCheck={false}
            className="focus-ring min-h-11 w-full min-w-0 rounded-sm border border-line-strong bg-surface px-3 py-3 font-mono text-sm"
          />
          <p id="receiving-help" className="text-sm text-ink-secondary">
            Enter an Ethereum address for receiving {details.asset.symbol}.
          </p>
        </div>
      )}
      <p
        id="receiving-error"
        role="alert"
        className="text-sm text-state-danger"
      >
        {error}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy
            ? "Checking your receiving account…"
            : !review
              ? current
                ? "Review change"
                : "Review account"
              : relationship
                ? current
                  ? "Update receiving account"
                  : "Set receiving account"
                : "Save receiving account"}
        </Button>
        {review && !relationship ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => setReview(false)}
          >
            Edit account
          </Button>
        ) : null}
      </div>
    </form>
  );
}
