type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex min-h-11 items-center justify-center rounded-sm border border-line-strong bg-surface-strong px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-ink-tertiary ${className}`}
      {...props}
    />
  );
}
