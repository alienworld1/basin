import Link from "next/link";

import { DesktopTechnicalInspector } from "./desktop-technical-inspector";
import { MobileNavigation } from "./mobile-navigation";
import { ShellNavigation } from "./shell-navigation";
import type {
  InspectorDetails,
  NavigationItem,
  WorkspaceShellContext,
  WorkspaceSummary,
} from "./shell-types";
import { TechnicalDetails } from "./technical-details";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { IdentityTechnicalDetails } from "../shared/identity-types";

type AppShellProps = WorkspaceShellContext & {
  navigation: NavigationItem[];
  inspectorDetails: InspectorDetails;
  accountControl: React.ReactNode;
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  onCreateWorkspace: () => void;
  switchingWorkspace?: boolean;
  identityDetails?: IdentityTechnicalDetails;
  children: React.ReactNode;
};

export function AppShell({
  workspace,
  availableWorkspaces,
  navigation,
  inspectorDetails,
  accountControl,
  onSelectWorkspace,
  onCreateWorkspace,
  switchingWorkspace,
  identityDetails,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface px-5 py-6 md:flex md:min-h-dvh md:flex-col">
        <Link
          href="/"
          className="focus-ring w-fit text-lg font-semibold tracking-tight"
        >
          Basin
        </Link>

        <div className="mt-12">
          <WorkspaceSwitcher
            workspace={workspace}
            availableWorkspaces={availableWorkspaces}
            onSelect={onSelectWorkspace}
            onCreate={onCreateWorkspace}
            disabled={switchingWorkspace}
          />
        </div>

        <ShellNavigation navigation={navigation} />

        <DesktopTechnicalInspector>
          <TechnicalDetails
            details={inspectorDetails}
            identityDetails={identityDetails}
          />
        </DesktopTechnicalInspector>
        <div className="mt-6">{accountControl}</div>
      </aside>

      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-5 md:hidden">
        <Link
          href="/"
          className="focus-ring text-lg font-semibold tracking-tight"
        >
          Basin
        </Link>
        <MobileNavigation
          navigation={navigation}
          workspaceSwitcher={
            <WorkspaceSwitcher
              workspace={workspace}
              availableWorkspaces={availableWorkspaces}
              onSelect={onSelectWorkspace}
              onCreate={onCreateWorkspace}
              disabled={switchingWorkspace}
            />
          }
          inspectorContent={
            <TechnicalDetails
              details={inspectorDetails}
              identityDetails={identityDetails}
            />
          }
          accountControl={accountControl}
        />
      </header>

      <main
        id="main-content"
        className="grid min-h-[calc(100dvh-4rem)] grid-cols-4 content-center gap-4 px-6 py-24 md:min-h-dvh md:grid-cols-8 md:px-12 lg:grid-cols-12 lg:px-16"
      >
        <div className="col-span-4 md:col-span-6 lg:col-span-7 lg:col-start-2">
          {children}
        </div>
      </main>
    </div>
  );
}
