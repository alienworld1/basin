export function LandingLoading() {
  return (
    <div className="min-h-dvh px-6 py-6 sm:px-8 lg:px-12 lg:py-8">
      <header className="flex items-center justify-between border-b border-line pb-6">
        <span className="text-lg font-semibold tracking-tight">Basin</span>
        <span
          className="h-5 w-32 rounded-xs bg-surface-muted"
          aria-hidden="true"
        />
      </header>
      <main
        id="main-content"
        className="grid min-h-[calc(100dvh-8rem)] grid-cols-4 content-center gap-4 py-16 md:grid-cols-8 lg:grid-cols-12"
      >
        <div
          className="col-span-4 md:col-span-7 lg:col-span-8"
          aria-hidden="true"
        >
          <div className="h-5 w-36 rounded-xs bg-surface-muted" />
          <div className="mt-6 h-28 max-w-3xl rounded-sm bg-surface-muted motion-safe:animate-pulse" />
          <div className="mt-8 h-6 max-w-xl rounded-xs bg-surface-muted" />
          <div className="mt-8 h-11 w-32 rounded-sm bg-surface-muted" />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          Opening Basin…
        </p>
      </main>
    </div>
  );
}
