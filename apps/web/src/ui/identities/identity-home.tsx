"use client";

import { animated, useReducedMotion, useSpring } from "@react-spring/web";
import { useEffect, useRef, useState } from "react";

import type { ActiveIdentityDto } from "../../shared/identity-types";
import { Receiving } from "../receiving/receiving";
import { Button } from "../button";

type IdentityHomeProps = {
  identity: ActiveIdentityDto;
  justVerified: boolean;
  workspaceId: string;
  requestedReceivingRelationshipId?: string;
  onReceivingChange: (
    details: import("../../shared/settlement-types").ReceivingStatusDto,
  ) => void;
};

export function IdentityHome({
  identity,
  justVerified,
  workspaceId,
  requestedReceivingRelationshipId,
  onReceivingChange,
}: IdentityHomeProps) {
  const reducedMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const spring = useSpring({
    from: justVerified
      ? { opacity: 0, transform: "translate3d(0, 12px, 0)" }
      : undefined,
    to: { opacity: 1, transform: "translate3d(0, 0px, 0)" },
    immediate: Boolean(reducedMotion) || !justVerified,
    config: { tension: 260, friction: 32, clamp: true },
  });

  useEffect(() => {
    if (justVerified) headingRef.current?.focus();
  }, [justVerified]);

  return (
    <section aria-labelledby="basin-identity-name">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">
        Personal identity
      </p>
      <animated.div
        style={spring}
        className="border-l-4 border-accent-verdant bg-surface px-5 py-6 sm:px-7"
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          id="basin-identity-name"
          className="wrap-break-word text-title font-semibold tracking-[-0.03em] outline-none"
        >
          {identity.name}
        </h1>
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          <p className="text-sm font-semibold text-state-success">Active</p>
        </div>
      </animated.div>
      <p className="mt-6 max-w-lg text-ink-secondary">
        Your Basin account controls this identity. Receiving details are kept
        separate.
      </p>
      <div className="mt-6 flex items-center gap-4">
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(identity.name);
            setCopied(true);
          }}
        >
          Copy identity
        </Button>
        <span className="text-sm text-state-success" aria-live="polite">
          {copied ? "Identity copied" : ""}
        </span>
      </div>
      <Receiving
        key={`${workspaceId}:${requestedReceivingRelationshipId ?? "default"}`}
        workspaceId={workspaceId}
        requestedRelationshipId={requestedReceivingRelationshipId}
        onDetailsChange={onReceivingChange}
      />
    </section>
  );
}
