"use client";

import { useState } from "react";

import type { WorkspaceSummary } from "../shell-types";
import { WorkspaceForm } from "./workspace-form";

type WorkspaceOnboardingProps = {
  title?: string;
  onCreate: (input: {
    type: "PERSONAL" | "ORGANIZATION";
    displayName: string;
  }) => Promise<WorkspaceSummary>;
};

export function WorkspaceOnboarding({
  onCreate,
  title = "How will you use Basin?",
}: WorkspaceOnboardingProps) {
  const [type, setType] = useState<"PERSONAL" | "ORGANIZATION">();
  const [busy, setBusy] = useState(false);

  return (
    <section className="border-t border-line-strong pt-8">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">Workspace</p>
      <h1 tabIndex={-1} className="text-title font-semibold tracking-[-0.03em]">
        {title}
      </h1>
      <fieldset className="mt-8 grid gap-3 sm:grid-cols-2" disabled={busy}>
        <legend className="sr-only">Workspace type</legend>
        {(["PERSONAL", "ORGANIZATION"] as const).map((value) => {
          const selected = type === value;
          return (
            <label
              key={value}
              className={`focus-within:ring-2 focus-within:ring-ink min-h-28 cursor-pointer rounded-sm border p-4 transition-colors ${selected ? "border-ink bg-surface-muted" : "border-line-strong bg-surface"}`}
            >
              <input
                className="sr-only"
                type="radio"
                name="workspace-type"
                value={value}
                checked={selected}
                onChange={() => setType(value)}
              />
              <span className="block font-semibold">
                {value === "PERSONAL" ? "Personal" : "Organization"}
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-ink-secondary">
                {value === "PERSONAL"
                  ? "Receive business payments and control where they settle."
                  : "Create a team workspace for approved payees and payments."}
              </span>
            </label>
          );
        })}
      </fieldset>
      {type ? (
        <WorkspaceForm type={type} onCreate={onCreate} onBusyChange={setBusy} />
      ) : (
        <p className="mt-6 text-sm text-ink-tertiary">
          Choose an option to continue.
        </p>
      )}
    </section>
  );
}
