"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavigationItem } from "./shell-types";

type ShellNavigationProps = {
  navigation: NavigationItem[];
};

export function ShellNavigation({ navigation }: ShellNavigationProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace navigation" className="mt-10">
      <ul className="space-y-1">
        {navigation.map((item) => {
          const isCurrent =
            pathname === item.href ||
            (item.match === "prefix" && pathname.startsWith(`${item.href}/`));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className="focus-ring flex min-h-11 items-center rounded-sm px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-muted aria-[current=page]:bg-surface-muted"
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
