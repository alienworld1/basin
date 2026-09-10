"use client";

import { animated, useReducedMotion, useSpring } from "@react-spring/web";
import type { ReceivingOperationDto } from "../../shared/settlement-types";
import { Button } from "../button";

export function ReceivingPendingStatus({
  operation,
  busy,
  onCheck,
  onStartOver,
}: {
  operation: ReceivingOperationDto;
  busy: boolean;
  onCheck: () => void;
  onStartOver: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const waiting = ["SUBMITTED", "VERIFYING", "UNKNOWN"].includes(
    operation.status,
  );
  const motion = useSpring({
    from: { transform: "translate3d(0%, 0, 0)", opacity: 0.45 },
    to: { transform: "translate3d(700%, 0, 0)", opacity: 1 },
    loop: reducedMotion ? false : true,
    immediate: !!reducedMotion,
    config: { duration: 1800 },
  });

  return (
    <div className="mt-4 border-l-2 border-accent-gold pl-4" role="status">
      {waiting ? (
        <div
          className="mb-3 h-0.5 w-24 overflow-hidden bg-line"
          aria-hidden="true"
        >
          <animated.div
            style={motion}
            className="h-full w-3 bg-accent-gold"
          />
        </div>
      ) : null}
      <p className="font-medium">
        {waiting ? "Waiting for Sepolia confirmation" : operation.message}
      </p>
      {waiting ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          Basin is checking the network and will verify the receiving change
          before marking it complete. You can leave this page while it
          continues.
        </p>
      ) : null}
      {operation.transactionHash ? (
        <a
          className="focus-ring mt-3 inline-flex min-h-11 items-center text-sm underline"
          href={`https://sepolia.etherscan.io/tx/${operation.transactionHash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
      ) : null}
      {operation.status !== "PREPARED" ? (
        <div className="mt-3">
          <Button disabled={busy} onClick={onCheck}>
            Check status
          </Button>
          {operation.status === "UNKNOWN" && !operation.transactionHash ? (
            <details className="mt-4 text-sm text-ink-secondary">
              <summary className="focus-ring w-fit cursor-pointer py-2 font-medium text-ink">
                Having trouble?
              </summary>
              <p className="mt-2 max-w-md leading-relaxed">
                If Basin never showed a submitted transaction, cancel this
                pending attempt before trying again.
              </p>
              <Button className="mt-3" disabled={busy} onClick={onStartOver}>
                Cancel and start over
              </Button>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
