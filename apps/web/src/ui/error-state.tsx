import { Button } from "./button";
import { TextLink } from "./text-link";

type ErrorStateProps = {
  title: string;
  description?: string;
  onRetry?: () => void;
  showHomeLink?: boolean;
};

export function ErrorState({
  title,
  description,
  onRetry,
  showHomeLink = false,
}: ErrorStateProps) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center px-6 py-16 sm:px-8 lg:px-12"
    >
      <section role="alert" className="w-full max-w-xl border-t border-line-strong pt-8">
        <p className="mb-3 text-sm font-medium text-state-danger">Unable to continue</p>
        <h1 className="text-title font-semibold tracking-[-0.03em]">{title}</h1>
        {description ? (
          <p className="mt-5 leading-relaxed text-ink-secondary">{description}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-4">
          {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
          {showHomeLink ? <TextLink href="/">Back to Basin</TextLink> : null}
        </div>
      </section>
    </main>
  );
}
