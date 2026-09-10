export function ExpectedPaymentSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-5 divide-y divide-line border-y border-line"
    >
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid min-h-20 gap-4 py-4 md:grid-cols-[1fr_6rem_2fr_6rem]"
        >
          <div className="h-5 w-32 rounded-xs bg-surface-muted motion-safe:animate-pulse" />
          <div className="h-5 w-20 rounded-xs bg-surface-muted motion-safe:animate-pulse" />
          <div className="h-5 w-full max-w-xs rounded-xs bg-surface-muted motion-safe:animate-pulse" />
          <div className="h-5 w-16 rounded-xs bg-surface-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
