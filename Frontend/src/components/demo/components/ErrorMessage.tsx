interface ErrorMessageProps {
  message: string | null;
  className?: string;
}

export function ErrorMessage({ message, className = '' }: ErrorMessageProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-accesly-danger ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4 mt-0.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
