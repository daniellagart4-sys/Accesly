import type { ReactNode } from 'react';

interface InfoNoteProps {
  tone?: 'info' | 'warning';
  title?: string;
  children: ReactNode;
}

const TONES = {
  info: {
    box: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: 'text-blue-500',
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: 'text-amber-500',
  },
};

export function InfoNote({ tone = 'info', title, children }: InfoNoteProps) {
  const t = TONES[tone];
  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg border text-sm ${t.box}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`w-4 h-4 mt-0.5 shrink-0 ${t.icon}`}
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
      <div className="flex-1 leading-relaxed">
        {title && <div className="font-medium mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
