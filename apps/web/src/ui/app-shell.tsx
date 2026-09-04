"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { Sheet } from "./sheet";
import type {
  InspectorDetails,
  NavigationItem,
  WorkspaceShellContext,
} from "./shell-types";
import { TechnicalDetails } from "./technical-details";
import { WorkspaceSwitcher } from "./workspace-switcher";

type AppShellProps = WorkspaceShellContext & {
  navigation: NavigationItem[];
  inspectorDetails: InspectorDetails;
  children: React.ReactNode;
};

export function AppShell({
  workspace,
  availableWorkspaces,
  navigation,
  inspectorDetails,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [openInspectorAfterMenu, setOpenInspectorAfterMenu] = useState(false);
  const [inspectorOpenedFromMenu, setInspectorOpenedFromMenu] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);

  const isCurrent = (item: NavigationItem) =>
    item.match === "exact"
      ? pathname === item.href
      : pathname.startsWith(item.href);

  const requestInspectorFromMenu = () => {
    setInspectorOpenedFromMenu(true);
    setOpenInspectorAfterMenu(true);
    setIsMenuOpen(false);
  };

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
          />
        </div>

        <nav aria-label="Workspace navigation" className="mt-10">
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item) ? "page" : undefined}
                  className="focus-ring flex min-h-11 items-center rounded-sm px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-muted aria-[current=page]:bg-surface-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button
          ref={inspectorTriggerRef}
          type="button"
          onClick={() => {
            setInspectorOpenedFromMenu(false);
            setIsInspectorOpen(true);
          }}
          className="focus-ring mt-auto min-h-11 rounded-sm px-3 text-left text-sm font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
        >
          Technical details
        </button>
      </aside>

      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-5 md:hidden">
        <Link href="/" className="focus-ring text-lg font-semibold tracking-tight">
          Basin
        </Link>
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={() => setIsMenuOpen(true)}
          className="focus-ring min-h-11 rounded-sm px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-muted"
        >
          Menu
        </button>
      </header>

      <main
        id="main-content"
        className="grid min-h-[calc(100dvh-4rem)] grid-cols-4 content-center gap-4 px-6 py-24 md:min-h-dvh md:grid-cols-8 md:px-12 lg:grid-cols-12 lg:px-16"
      >
        <div className="col-span-4 md:col-span-6 lg:col-span-7 lg:col-start-2">
          {children}
        </div>
      </main>

      <Sheet
        isOpen={isMenuOpen}
        title="Menu"
        onClose={() => setIsMenuOpen(false)}
        onClosed={() => {
          if (openInspectorAfterMenu) {
            setOpenInspectorAfterMenu(false);
            setIsInspectorOpen(true);
          }
        }}
        returnFocusRef={menuTriggerRef}
      >
        <WorkspaceSwitcher
          workspace={workspace}
          availableWorkspaces={availableWorkspaces}
        />
        <nav aria-label="Mobile workspace navigation" className="mt-10">
          <ul className="space-y-2">
            <li>
              <Link
                href="/"
                className="focus-ring flex min-h-11 items-center border-b border-line text-sm font-medium"
              >
                Basin home
              </Link>
            </li>
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item) ? "page" : undefined}
                  className="focus-ring flex min-h-11 items-center border-b border-line text-sm font-medium"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          onClick={requestInspectorFromMenu}
          className="focus-ring mt-10 min-h-11 w-full rounded-sm border border-line-strong px-4 text-left text-sm font-medium"
        >
          Technical details
        </button>
      </Sheet>

      <Sheet
        isOpen={isInspectorOpen}
        title="Technical details"
        onClose={() => setIsInspectorOpen(false)}
        returnFocusRef={
          inspectorOpenedFromMenu ? menuTriggerRef : inspectorTriggerRef
        }
      >
        <TechnicalDetails details={inspectorDetails} />
      </Sheet>
    </div>
  );
}
