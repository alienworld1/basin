import { getEnvironmentHealth } from "@/src/server/config/environment";
import { WorkspaceApp } from "@/src/ui/workspaces/workspace-app";
import type { InspectorDetails, NavigationItem } from "@/src/ui/shell-types";

const navigation = [
  {
    label: "Workspace",
    href: "/app",
    match: "exact",
  },
] satisfies NavigationItem[];

export default async function WorkspacePage({
  searchParams,
}: PageProps<"/app">) {
  const query = await searchParams;
  const workspaceQuery = query.workspace;
  const requestedWorkspaceId =
    typeof workspaceQuery === "string"
      ? workspaceQuery
      : Array.isArray(workspaceQuery)
        ? "invalid"
        : undefined;
  const relationshipQuery = query.relationship;
  const requestedRelationshipId =
    typeof relationshipQuery === "string"
      ? relationshipQuery
      : Array.isArray(relationshipQuery)
        ? "invalid"
        : undefined;
  const receivingQuery = query.receiving;
  const requestedReceivingRelationshipId =
    typeof receivingQuery === "string"
      ? receivingQuery
      : Array.isArray(receivingQuery)
        ? "invalid"
        : undefined;
  const expectedPaymentQuery = query.expectedPayment;
  const requestedExpectedPaymentId =
    typeof expectedPaymentQuery === "string"
      ? expectedPaymentQuery
      : Array.isArray(expectedPaymentQuery)
        ? "invalid"
        : undefined;
  const health = getEnvironmentHealth();
  const inspectorDetails: InspectorDetails = {
    environment: health.environment,
    networkName: health.network.name,
    chainId: health.network.chainId,
    rpcStatus: health.checks.rpc,
    version: health.version,
  };

  return (
    <WorkspaceApp
      requestedWorkspaceId={requestedWorkspaceId}
      requestedRelationshipId={requestedRelationshipId}
      requestedReceivingRelationshipId={requestedReceivingRelationshipId}
      requestedExpectedPaymentId={requestedExpectedPaymentId}
      navigation={navigation}
      inspectorDetails={inspectorDetails}
    />
  );
}
