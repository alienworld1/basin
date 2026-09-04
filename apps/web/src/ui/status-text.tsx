type StatusTextProps = {
  label: string;
  value: string;
  technical?: boolean;
};

export function StatusText({ label, value, technical = false }: StatusTextProps) {
  return (
    <div className="grid grid-cols-2 gap-4 border-t border-line py-4 text-sm">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className={`text-right text-ink ${technical ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
