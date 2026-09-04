import type { WorkspaceShellContext } from "./shell-types";

type WorkspaceSwitcherProps = WorkspaceShellContext;

export function WorkspaceSwitcher({
  workspace,
  availableWorkspaces,
}: WorkspaceSwitcherProps) {
  const label = workspace?.name ?? "No workspace selected";
  const canSwitch = availableWorkspaces.length > 1;

  return (
    <div>
      <button
        type="button"
        disabled={!canSwitch}
        aria-label={workspace ? `Current workspace: ${label}` : label}
        title={label}
        className="focus-ring min-h-11 w-full truncate rounded-sm border border-line px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:text-ink-tertiary"
      >
        {label}
      </button>
      {!workspace ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-tertiary">
          Sign in to access workspace choices.
        </p>
      ) : null}
    </div>
  );
}
