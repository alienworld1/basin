export function LoadingSkeleton() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      <div aria-hidden="true" className="hidden border-r border-line bg-surface p-5 md:block">
        <div className="h-6 w-16 rounded-xs bg-surface-muted" />
        <div className="mt-12 h-16 rounded-sm bg-surface-muted" />
      </div>
      <div>
        <div aria-hidden="true" className="h-16 border-b border-line bg-surface md:hidden" />
        <main
          id="main-content"
          className="grid min-h-[calc(100dvh-4rem)] grid-cols-4 content-center gap-4 px-6 py-24 md:min-h-dvh md:grid-cols-8 md:px-12 lg:grid-cols-12 lg:px-16"
        >
          <div aria-hidden="true" className="col-span-4 md:col-span-6 lg:col-span-7 lg:col-start-2">
            <div className="h-px bg-line-strong" />
            <div className="mt-8 h-5 w-28 rounded-xs bg-surface-muted" />
            <div className="mt-5 h-12 max-w-md rounded-sm bg-surface-muted motion-safe:animate-pulse" />
            <div className="mt-6 h-5 max-w-lg rounded-xs bg-surface-muted motion-safe:animate-pulse" />
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            Opening your workspace.
          </p>
        </main>
      </div>
    </div>
  );
}
