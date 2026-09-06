import type { WorkspaceSummary } from "../shell-types";

type WorkspaceChooserProps = {
  workspaces: WorkspaceSummary[];
  onSelect: (workspace: WorkspaceSummary) => void;
  disabled?: boolean;
};

export function WorkspaceChooser({
  workspaces,
  onSelect,
  disabled,
}: WorkspaceChooserProps) {
  return (
    <section className="border-t border-line-strong pt-8">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">Workspace</p>
      <h1 className="text-title font-semibold tracking-[-0.03em]">
        Choose a workspace
      </h1>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(workspace)}
              className="focus-ring flex min-h-16 w-full items-center justify-between gap-4 px-2 py-3 text-left transition-colors hover:bg-surface-muted disabled:cursor-wait"
            >
              <span className="min-w-0 font-medium">{workspace.name}</span>
              <span className="shrink-0 text-sm text-ink-tertiary">
                {workspace.type === "personal" ? "Personal" : "Organization"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
