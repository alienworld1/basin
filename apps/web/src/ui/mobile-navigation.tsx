"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { Sheet } from "./sheet";
import type { NavigationItem } from "./shell-types";

type MobileNavigationProps = {
  navigation: NavigationItem[];
  workspaceSwitcher: React.ReactNode;
  inspectorContent: React.ReactNode;
};

export function MobileNavigation({
  navigation,
  workspaceSwitcher,
  inspectorContent,
}: MobileNavigationProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [openInspectorAfterMenu, setOpenInspectorAfterMenu] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const requestInspector = () => {
    setOpenInspectorAfterMenu(true);
    setIsMenuOpen(false);
  };

  return (
    <>
      <button
        ref={menuTriggerRef}
        type="button"
        onClick={() => setIsMenuOpen(true)}
        className="focus-ring min-h-11 rounded-sm px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-muted"
      >
        Menu
      </button>
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
        {workspaceSwitcher}
        <nav aria-label="Mobile workspace navigation" className="mt-10">
          <ul className="space-y-2">
            <li>
              <Link
                href="/"
                onClick={() => setIsMenuOpen(false)}
                className="focus-ring flex min-h-11 items-center border-b border-line text-sm font-medium"
              >
                Basin home
              </Link>
            </li>
            {navigation.map((item) => {
              const isCurrent =
                pathname === item.href ||
                (item.match === "prefix" &&
                  pathname.startsWith(`${item.href}/`));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => setIsMenuOpen(false)}
                    className="focus-ring flex min-h-11 items-center border-b border-line text-sm font-medium"
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button
          type="button"
          onClick={requestInspector}
          className="focus-ring mt-10 min-h-11 w-full rounded-sm border border-line-strong px-4 text-left text-sm font-medium"
        >
          Technical details
        </button>
      </Sheet>
      <Sheet
        isOpen={isInspectorOpen}
        title="Technical details"
        onClose={() => setIsInspectorOpen(false)}
        returnFocusRef={menuTriggerRef}
      >
        {inspectorContent}
      </Sheet>
    </>
  );
}
