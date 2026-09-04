export type WorkspaceSummary = {
  id: string;
  name: string;
  type: "personal" | "organization";
};

export type WorkspaceShellContext = {
  workspace: WorkspaceSummary | null;
  availableWorkspaces: WorkspaceSummary[];
};

export type NavigationItem = {
  label: string;
  href: `/${string}`;
  match: "exact" | "prefix";
};

export type InspectorDetails = {
  environment: "development" | "preview" | "production";
  networkName: "Ethereum Sepolia";
  chainId: 11155111;
  rpcStatus: "configured" | "not_required";
  version: string | null;
};
