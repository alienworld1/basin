"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { NavigationItem } from "./shell-types";

type ShellNavigationProps = {
  navigation: NavigationItem[];
};

export function ShellNavigation({ navigation }: ShellNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav aria-label="Workspace navigation" className="mt-10">
      <ul className="space-y-1">
        {navigation.map((item) => {
          const target = new URL(item.href, "http://basin.local");
          const section = target.searchParams.get("section");
          const isCurrent =
            pathname === target.pathname &&
            (section
              ? searchParams.get("section") === section
              : !searchParams.get("section"));
          if (
            searchParams.get("workspace") &&
            !target.searchParams.get("workspace")
          )
            target.searchParams.set(
              "workspace",
              searchParams.get("workspace")!,
            );

          return (
            <li key={item.href}>
              <Link
                href={`${target.pathname}${target.search}`}
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
