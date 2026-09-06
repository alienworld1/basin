"use client";

import { useRef, useState } from "react";

import { Sheet } from "./sheet";
import type { WorkspaceShellContext, WorkspaceSummary } from "./shell-types";

type WorkspaceSwitcherProps = WorkspaceShellContext & {
  onSelect: (workspace: WorkspaceSummary) => void;
  onCreate: () => void;
  disabled?: boolean;
};

export function WorkspaceSwitcher({
  workspace,
  availableWorkspaces,
  onSelect,
  onCreate,
  disabled,
}: WorkspaceSwitcherProps) {
  const label = workspace?.name ?? "No workspace selected";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={workspace ? `Current workspace: ${label}` : label}
        title={label}
        className="focus-ring min-h-11 w-full truncate rounded-sm border border-line px-3 py-2 text-left text-sm font-medium disabled:cursor-wait disabled:text-ink-tertiary"
      >
        {label}
      </button>
      {availableWorkspaces.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-tertiary">
          Create a workspace to begin.
        </p>
      ) : null}
      <Sheet
        isOpen={open}
        title="Workspaces"
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      >
        {availableWorkspaces.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {availableWorkspaces.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === workspace?.id ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onSelect(item);
                  }}
                  className="focus-ring flex min-h-14 w-full items-center justify-between gap-3 px-2 text-left text-sm aria-[current=true]:font-semibold"
                >
                  <span className="min-w-0 truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-tertiary">
                    {item.type === "personal" ? "Personal" : "Organization"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onCreate();
          }}
          className="focus-ring mt-6 min-h-11 w-full rounded-sm border border-line-strong px-4 text-left text-sm font-medium"
        >
          Create workspace
        </button>
      </Sheet>
    </div>
  );
}
