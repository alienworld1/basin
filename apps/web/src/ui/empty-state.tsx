type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="max-w-xl border-t border-line-strong pt-8">
      <p className="mb-3 text-sm font-medium text-ink-tertiary">Workspace</p>
      <h1 className="text-title font-semibold tracking-[-0.03em]">{title}</h1>
      <p className="mt-6 text-lg leading-relaxed text-ink-secondary">
        {description}
      </p>
    </section>
  );
}
