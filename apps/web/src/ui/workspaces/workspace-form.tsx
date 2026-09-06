"use client";

import { useEffect, useRef, useState } from "react";

import { useBasinAuth } from "../auth/auth-provider";
import { Button } from "../button";
import type { WorkspaceSummary } from "../shell-types";

type WorkspaceFormProps = {
  type: "PERSONAL" | "ORGANIZATION";
  onCreate: (input: {
    type: "PERSONAL" | "ORGANIZATION";
    displayName: string;
  }) => Promise<WorkspaceSummary>;
  onBusyChange?: (busy: boolean) => void;
};

export function WorkspaceForm({
  type,
  onCreate,
  onBusyChange,
}: WorkspaceFormProps) {
  const auth = useBasinAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<"idle" | "wallet" | "creating">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const personal = type === "PERSONAL";
  const busy = phase !== "idle";

  useEffect(() => {
    inputRef.current?.focus();
  }, [type]);

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(personal ? "Enter your name." : "Enter an organization name.");
      return;
    }
    if (trimmed.length > 120) {
      setError("Keep the name to 120 characters or fewer.");
      return;
    }
    setError(undefined);
    if (personal) {
      try {
        setPhase("wallet");
        await auth.prepareWallet();
      } catch {
        setError("We couldn't prepare your personal account. Try again.");
        setPhase("idle");
        return;
      }
    }
    try {
      setPhase("creating");
      await onCreate({ type, displayName: trimmed });
    } catch {
      setError("We couldn't create that workspace. Try again.");
      setPhase("idle");
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 max-w-lg" noValidate>
      <label htmlFor="workspace-name" className="block text-sm font-medium">
        {personal ? "Your name" : "Organization name"}
      </label>
      <p
        id="workspace-name-help"
        className="mt-2 text-sm leading-relaxed text-ink-secondary"
      >
        {personal
          ? "Receive business payments and control where they settle."
          : "Create a team workspace for approved payees and payments."}
      </p>
      <input
        ref={inputRef}
        id="workspace-name"
        name="displayName"
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        maxLength={121}
        aria-invalid={Boolean(error)}
        aria-describedby={`workspace-name-help${error ? " workspace-name-error" : ""}`}
        className="focus-ring mt-4 min-h-11 w-full rounded-sm border border-line-strong bg-surface-strong px-3 text-ink disabled:cursor-not-allowed"
      />
      {error ? (
        <p
          id="workspace-name-error"
          className="mt-3 text-sm text-state-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={busy || (personal && auth.walletStatus === "LOADING")}
        className="mt-6"
      >
        {phase === "wallet"
          ? "Preparing your account…"
          : phase === "creating"
            ? "Creating workspace…"
            : personal
              ? "Create personal workspace"
              : "Create organization workspace"}
      </Button>
      {personal && auth.walletStatus === "LOADING" && !busy ? (
        <p className="mt-3 text-sm text-ink-tertiary" role="status">
          Your account options are still loading.
        </p>
      ) : null}
    </form>
  );
}
