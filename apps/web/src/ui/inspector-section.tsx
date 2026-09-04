type InspectorSectionProps = {
  title: string;
  children: React.ReactNode;
};

export function InspectorSection({ title, children }: InspectorSectionProps) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-tertiary">
        {title}
      </h2>
      <dl>{children}</dl>
    </section>
  );
}
