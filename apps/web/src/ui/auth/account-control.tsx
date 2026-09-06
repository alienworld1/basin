"use client";

import { useState } from "react";

import { Button } from "../button";

type AccountControlProps = {
  label: string;
  onSignOut: () => Promise<void>;
};

export function AccountControl({ label, onSignOut }: AccountControlProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="border-t border-line pt-4">
      <p className="truncate text-sm text-ink-secondary" title={label}>
        {label}
      </p>
      <Button
        className="mt-3 w-full"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          setError(false);
          try {
            await onSignOut();
          } catch {
            setError(true);
            setSigningOut(false);
          }
        }}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-state-danger" role="alert">
          We couldn&apos;t sign you out. Try again.
        </p>
      ) : null}
    </div>
  );
}
