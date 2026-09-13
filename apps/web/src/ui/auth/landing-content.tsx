import Link from "next/link";

import { BasinWordmark } from "../basin-wordmark";
import { Button } from "../button";

type LandingContentProps = {
  onOpen: () => void;
  disabled: boolean;
  unavailable: boolean;
  signInFailed: boolean;
};

export function LandingContent({
  onOpen,
  disabled,
  unavailable,
  signInFailed,
}: LandingContentProps) {
  return (
    <div className="min-h-dvh px-6 py-6 sm:px-8 lg:px-12 lg:py-8">
      <header className="flex items-center justify-between border-b border-line pb-6">
        <BasinWordmark className="w-20" />
        <span className="text-sm text-ink-tertiary">Business payments</span>
      </header>
      <main
        id="main-content"
        className="grid min-h-[calc(100dvh-8rem)] grid-cols-4 content-center gap-x-4 gap-y-16 py-16 md:grid-cols-8 lg:grid-cols-12"
      >
        <section className="col-span-4 md:col-span-7 lg:col-span-8">
          <p className="mb-6 text-sm font-medium text-ink-secondary">
            A durable way to pay
          </p>
          <h1 className="max-w-4xl text-display font-semibold tracking-[-0.04em]">
            Payment relationships, not wallet whitelists.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-secondary">
            Approve who you pay. Let payees control where they receive.
          </p>
          <div className="mt-8">
            <Button onClick={onOpen} disabled={disabled}>
              Open Basin
            </Button>
          </div>
          {unavailable ? (
            <p className="mt-3 text-sm text-state-danger" role="status">
              Basin sign-in is unavailable right now.
            </p>
          ) : signInFailed ? (
            <p className="mt-3 text-sm text-state-danger" role="alert">
              We couldn&apos;t sign you in. Try again.
            </p>
          ) : null}
        </section>
        <aside className="col-span-4 self-end border-t border-line pt-6 md:col-start-5 lg:col-start-10 lg:pt-8">
          <ol className="space-y-5 text-sm leading-relaxed text-ink-secondary">
            <li>
              <span className="block font-medium text-ink">
                Payer authority
              </span>
              Organizations approve who they pay.
            </li>
            <li>
              <span className="block font-medium text-ink">
                Payee authority
              </span>
              Payees control where they receive.
            </li>
            <li>
              <span className="block font-medium text-ink">
                Execution authority
              </span>
              Operators can only execute valid payments.
            </li>
          </ol>
        </aside>
      </main>
      <footer className="border-t border-line pt-5 text-sm text-ink-tertiary">
        <Link className="focus-ring transition-colors hover:text-ink" href="/">
          <BasinWordmark className="w-20" />
        </Link>
      </footer>
    </div>
  );
}
