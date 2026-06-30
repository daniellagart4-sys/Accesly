import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accesly-ink text-white hover:bg-black disabled:bg-accesly-subtle disabled:cursor-not-allowed',
  secondary:
    'bg-white text-accesly-ink border border-accesly-border hover:border-accesly-ink disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'bg-accesly-danger text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'text-accesly-subtle hover:text-accesly-ink disabled:opacity-50 disabled:cursor-not-allowed',
};

export function Button({
  variant = 'primary',
  loading,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" opacity="0.25" />
          <path d="M21 12 a9 9 0 0 0 -9 -9" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
