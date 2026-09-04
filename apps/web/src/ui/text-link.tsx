import Link from "next/link";

type TextLinkProps = {
  href: string;
  children: React.ReactNode;
};

export function TextLink({ href, children }: TextLinkProps) {
  return (
    <Link
      href={href}
      className="focus-ring inline-flex min-h-11 items-center font-medium underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-ink"
    >
      {children}
    </Link>
  );
}
