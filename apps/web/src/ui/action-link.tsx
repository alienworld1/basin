import Link from "next/link";

type ActionLinkProps = {
  href: string;
  children: React.ReactNode;
};

export function ActionLink({ href, children }: ActionLinkProps) {
  return (
    <Link
      href={href}
      className="focus-ring inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-bg transition-[background-color,transform] duration-150 hover:bg-ink-secondary active:translate-y-px"
    >
      {children}
    </Link>
  );
}
