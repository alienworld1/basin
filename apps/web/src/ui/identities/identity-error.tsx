"use client";

import { useEffect, useRef } from "react";

import { Button } from "../button";

type IdentityErrorProps = {
  name?: string;
  message: string;
  actionLabel: "Try again" | "Check again" | "Choose another";
  onAction: () => void;
};

export function IdentityError({
  name,
  message,
  actionLabel,
  onAction,
}: IdentityErrorProps) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => errorRef.current?.focus(), [message]);
  return (
    <section>
      <div ref={errorRef} tabIndex={-1} role="alert" className="outline-none">
        <p className="mb-3 text-sm font-medium text-state-danger">
          Identity not ready
        </p>
        {name ? (
          <h1 className="wrap-break-word text-title font-semibold tracking-[-0.03em]">
            {name}
          </h1>
        ) : null}
        <p className="mt-5 max-w-lg text-ink-secondary">{message}</p>
      </div>
      <Button className="mt-6" onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}
