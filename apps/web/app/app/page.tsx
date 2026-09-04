import { getEnvironmentHealth } from "@/src/server/config/environment";
import { AppShell } from "@/src/ui/app-shell";
import { EmptyState } from "@/src/ui/empty-state";
import type { InspectorDetails, NavigationItem } from "@/src/ui/shell-types";

const navigation = [
  {
    label: "Workspace",
    href: "/app",
    match: "exact",
  },
] satisfies NavigationItem[];

export default function WorkspacePage() {
  const health = getEnvironmentHealth();
  const inspectorDetails: InspectorDetails = {
    environment: health.environment,
    networkName: health.network.name,
    chainId: health.network.chainId,
    rpcStatus: health.checks.rpc,
    version: health.version,
  };

  return (
    <AppShell
      workspace={null}
      availableWorkspaces={[]}
      navigation={navigation}
      inspectorDetails={inspectorDetails}
    >
      <EmptyState
        title="No workspace selected"
        description="Sign in to create or join a Personal or Organization workspace."
      />
    </AppShell>
  );
}
