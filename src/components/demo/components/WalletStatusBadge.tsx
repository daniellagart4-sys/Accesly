import type { WalletStatus } from '@accesly/react';

interface WalletStatusBadgeProps {
  status: WalletStatus;
  className?: string;
}

const STYLES: Record<
  WalletStatus,
  { box: string; dot: string; label: string }
> = {
  'on-chain': {
    box: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    label: 'Activa on-chain',
  },
  'pending-deploy': {
    box: 'bg-amber-100 text-amber-900 border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
    label: 'Desplegándose…',
  },
  unknown: {
    box: 'bg-gray-100 text-gray-700 border-gray-200',
    dot: 'bg-gray-400 animate-pulse',
    label: 'Verificando…',
  },
};

export function WalletStatusBadge({
  status,
  className = '',
}: WalletStatusBadgeProps) {
  const s = STYLES[status];
  return (
    <span
      className={`accesly-pill border ${s.box} ${className}`}
      title={`status: ${status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${s.dot}`} />
      {s.label}
    </span>
  );
}
