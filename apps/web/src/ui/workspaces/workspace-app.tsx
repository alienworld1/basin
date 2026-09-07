"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { AccountControl } from "../auth/account-control";
import { authenticatedRequest } from "../auth/authenticated-request";
import { useBasinAuth } from "../auth/auth-provider";
import { readBootstrap, requestBootstrap } from "../auth/bootstrap-client";
import { AppShell } from "../app-shell";
import { Button } from "../button";
import { LoadingSkeleton } from "../loading-skeleton";
import type {
  AuthBootstrapResult,
  InspectorDetails,
  NavigationItem,
  WorkspaceSummary,
} from "../shell-types";
import type { IdentityTechnicalDetails } from "../../shared/identity-types";
import { ActiveWorkspace } from "./active-workspace";
import { WorkspaceChooser } from "./workspace-chooser";
import { WorkspaceOnboarding } from "./workspace-onboarding";

type WorkspaceAppProps = {
  requestedWorkspaceId?: string;
  navigation: NavigationItem[];
  inspectorDetails: InspectorDetails;
};

const maximumId = BigInt("9223372036854775807");

function isWorkspaceId(value: string) {
  try {
    return /^[1-9]\d*$/.test(value) && BigInt(value) <= maximumId;
  } catch {
    return false;
  }
}

export function WorkspaceApp({
  requestedWorkspaceId,
  navigation,
  inspectorDetails,
}: WorkspaceAppProps) {
  const auth = useBasinAuth();
  const router = useRouter();
  const [result, setResult] = useState<AuthBootstrapResult>();
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "session-ended"
  >("loading");
  const [errorMessage, setErrorMessage] = useState(
    "We couldn't open your account. Try again.",
  );
  const [selectedOverride, setSelectedOverride] = useState<{
    id: string;
    from?: string;
  }>();
  const [creating, setCreating] = useState(false);
  const [resolvingWorkspace, setResolvingWorkspace] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const [identityDetails, setIdentityDetails] =
    useState<IdentityTechnicalDetails>();
  const [identityPending, setIdentityPending] = useState(false);
  const handleIdentityDetails = useCallback(
    (details: IdentityTechnicalDetails | undefined) =>
      setIdentityDetails(details),
    [],
  );
  const handleIdentityPending = useCallback(
    (pending: boolean) => setIdentityPending(pending),
    [],
  );

  const bootstrap = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await requestBootstrap(auth.getAccessToken);
      if (!response || response.status === 401) {
        setResult(undefined);
        setStatus("session-ended");
        return;
      }
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setErrorMessage(
          body.error === "We couldn't reach the database. Try again shortly."
            ? body.error
            : "We couldn't open your account. Try again.",
        );
        setStatus("error");
        return;
      }
      const next = await readBootstrap(response);
      setResult(next);
      setStatus("ready");
      if (!requestedWorkspaceId && next.workspaces.length === 1) {
        setSelectedOverride({
          id: next.workspaces[0].id,
          from: requestedWorkspaceId,
        });
        router.replace(`/app?workspace=${next.workspaces[0].id}`);
      }
    } catch {
      setStatus("error");
      setErrorMessage("We couldn't open your account. Try again.");
    }
  }, [auth.getAccessToken, requestedWorkspaceId, router]);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.authenticated) {
      router.replace("/");
      return;
    }
    void Promise.resolve().then(() => bootstrap());
  }, [auth.authenticated, auth.ready, bootstrap, router]);

  if (!auth.ready || (status === "loading" && !result)) {
    return <LoadingSkeleton />;
  }
  if (!auth.authenticated) return <LoadingSkeleton />;

  const workspaces = result?.workspaces ?? [];
  const selectedId =
    selectedOverride && selectedOverride.from === requestedWorkspaceId
      ? selectedOverride.id
      : requestedWorkspaceId;
  const activeWorkspace =
    workspaces.find((item) => item.id === selectedId) ?? null;

  const accountControl = (
    <AccountControl
      label={result?.user.displayName ?? "Basin account"}
      onSignOut={async () => {
        await auth.logout();
        setResult(undefined);
        setSelectedOverride(undefined);
        router.replace("/");
      }}
    />
  );

  const choose = async (workspace: WorkspaceSummary, justCreated = false) => {
    if (
      identityPending &&
      activeWorkspace &&
      workspace.id !== activeWorkspace.id &&
      !window.confirm(
        "Your identity claim may continue while you switch workspaces. Switch anyway?",
      )
    ) {
      return false;
    }
    setResolvingWorkspace(true);
    try {
      const response = await requestBootstrap(auth.getAccessToken);
      if (!response || response.status === 401) {
        setStatus("session-ended");
        return false;
      }
      if (!response.ok) {
        setStatus("error");
        setErrorMessage(
          justCreated
            ? "Your workspace was created, but we couldn't open it yet. Refresh to try again."
            : "We couldn't open your account. Try again.",
        );
        return false;
      }
      const refreshed = await readBootstrap(response);
      setResult(refreshed);
      setStatus("ready");
      setCreating(false);
      setIdentityDetails(undefined);
      setIdentityPending(false);
      setSelectedOverride({ id: workspace.id, from: requestedWorkspaceId });
      startNavigation(() => router.replace(`/app?workspace=${workspace.id}`));
      return true;
    } catch {
      setStatus("error");
      setErrorMessage(
        justCreated
          ? "Your workspace was created, but we couldn't open it yet. Refresh to try again."
          : "We couldn't open your account. Try again.",
      );
      return false;
    } finally {
      setResolvingWorkspace(false);
    }
  };

  const createWorkspace = async (input: {
    type: "PERSONAL" | "ORGANIZATION";
    displayName: string;
  }) => {
    const knownIds = new Set(workspaces.map((workspace) => workspace.id));
    let response: Response | null;
    try {
      response = await authenticatedRequest(
        auth.getAccessToken,
        "/api/workspaces",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
    } catch {
      const reconciliation = await requestBootstrap(auth.getAccessToken);
      if (reconciliation?.ok) {
        const refreshed = await readBootstrap(reconciliation);
        setResult(refreshed);
        const created = refreshed.workspaces.find(
          (workspace) =>
            !knownIds.has(workspace.id) &&
            workspace.name === input.displayName &&
            workspace.type === input.type.toLowerCase(),
        );
        if (created) {
          await choose(created, true);
          return created;
        }
      }
      throw new Error("We couldn't create that workspace. Try again.");
    }
    if (!response || response.status === 401) {
      setStatus("session-ended");
      throw new Error("Your session ended. Sign in again.");
    }
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(
        body.error ?? "We couldn't create that workspace. Try again.",
      );
    }
    const workspace = (await response.json()) as WorkspaceSummary;
    setResult((current) =>
      current
        ? { ...current, workspaces: [...current.workspaces, workspace] }
        : current,
    );
    await choose(workspace, true);
    return workspace;
  };

  let content: React.ReactNode;
  if (status === "session-ended") {
    content = (
      <section role="alert" className="border-t border-line-strong pt-8">
        <p className="mb-3 text-sm font-medium text-state-danger">
          Session ended
        </p>
        <h1 className="text-title font-semibold tracking-[-0.03em]">
          Your session ended.
        </h1>
        <p className="mt-5 text-ink-secondary">Sign in again to continue.</p>
        <Button
          className="mt-6"
          onClick={async () => {
            try {
              await auth.logout();
            } finally {
              auth.login();
            }
          }}
        >
          Sign in again
        </Button>
      </section>
    );
  } else if (status === "error") {
    content = (
      <section role="alert" className="border-t border-line-strong pt-8">
        <p className="mb-3 text-sm font-medium text-state-danger">
          Unable to continue
        </p>
        <h1 className="text-title font-semibold tracking-[-0.03em]">
          {errorMessage}
        </h1>
        <Button className="mt-6" onClick={() => void bootstrap()}>
          Try again
        </Button>
      </section>
    );
  } else if (creating || workspaces.length === 0) {
    content = (
      <WorkspaceOnboarding
        title={workspaces.length ? "Create workspace" : undefined}
        onCreate={createWorkspace}
      />
    );
  } else if (selectedId && !isWorkspaceId(selectedId)) {
    content = (
      <section className="border-t border-line-strong pt-8">
        <h1 className="text-title font-semibold tracking-[-0.03em]">
          We couldn&apos;t find that workspace.
        </h1>
        <Button className="mt-6" onClick={() => router.replace("/app")}>
          Choose a workspace
        </Button>
      </section>
    );
  } else if (selectedId && !activeWorkspace) {
    content = (
      <section className="border-t border-line-strong pt-8">
        <h1 className="text-title font-semibold tracking-[-0.03em]">
          You don&apos;t have access to this workspace.
        </h1>
        <Button className="mt-6" onClick={() => router.replace("/app")}>
          Choose another workspace
        </Button>
      </section>
    );
  } else if (!activeWorkspace) {
    content = (
      <WorkspaceChooser
        workspaces={workspaces}
        onSelect={choose}
        disabled={isNavigating || resolvingWorkspace}
      />
    );
  } else {
    content = (
      <ActiveWorkspace
        key={activeWorkspace.id}
        workspace={activeWorkspace}
        userId={result!.user.id}
        onIdentityDetailsChange={handleIdentityDetails}
        onPendingChange={handleIdentityPending}
      />
    );
  }

  return (
    <AppShell
      workspace={activeWorkspace}
      availableWorkspaces={workspaces}
      navigation={navigation}
      inspectorDetails={inspectorDetails}
      accountControl={accountControl}
      onSelectWorkspace={choose}
      onCreateWorkspace={() => setCreating(true)}
      switchingWorkspace={isNavigating || resolvingWorkspace}
      identityDetails={identityDetails}
    >
      {content}
    </AppShell>
  );
}
