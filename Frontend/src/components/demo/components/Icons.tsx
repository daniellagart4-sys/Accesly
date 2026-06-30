/**
 * Iconos del mockup — stroke-based, recoloreables vía `currentColor`.
 * Mantienen el peso visual del Brand Book (24×24, stroke 2, linecap round).
 */
import type { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  readonly size?: number;
  readonly strokeWidth?: number;
}

function wrap(children: React.ReactNode, p: IconProps = {}) {
  const { size = 22, strokeWidth = 2, ...rest } = p;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IcoHome = (p: IconProps) =>
  wrap(
    <>
      <path d="M3 10.8 12 3.2l9 7.6" />
      <path d="M5.2 9.4V20a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V9.4" />
      <path d="M9.6 21v-5.2a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1V21" />
    </>,
    p,
  );

export const IcoSend = (p: IconProps) =>
  wrap(
    <>
      <path d="M6.5 17.5 17.5 6.5" />
      <path d="M9 6.5h8.5V15" />
    </>,
    p,
  );

export const IcoReceive = (p: IconProps) =>
  wrap(
    <>
      <path d="M17.5 6.5 6.5 17.5" />
      <path d="M15 17.5H6.5V9" />
    </>,
    p,
  );

export const IcoSwap = (p: IconProps) =>
  wrap(
    <>
      <path d="M7 4v12" />
      <path d="M3 8l4-4 4 4" />
      <path d="M17 20V8" />
      <path d="M13 16l4 4 4-4" />
    </>,
    p,
  );

export const IcoAdd = (p: IconProps) => wrap(<path d="M12 5v14M5 12h14" />, p);

export const IcoBack = (p: IconProps) => wrap(<path d="M15 5l-7 7 7 7" />, p);

export const IcoChevron = (p: IconProps) =>
  wrap(<path d="M9 6l6 6-6 6" />, { size: 18, strokeWidth: 2, ...p });

export const IcoCheck = (p: IconProps) =>
  wrap(<path d="M4.5 12.5l5 5 10-11" />, { strokeWidth: 2.2, ...p });

export const IcoCopy = (p: IconProps) =>
  wrap(
    <>
      <rect x={9} y={9} width={11} height={11} rx={2.5} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
    { size: 18, ...p },
  );

export const IcoCard = (p: IconProps) =>
  wrap(
    <>
      <rect x={2.5} y={5} width={19} height={14} rx={3} />
      <path d="M2.5 9.5h19" />
    </>,
    p,
  );

export const IcoStore = (p: IconProps) =>
  wrap(
    <>
      <path d="M4 4h16l1.2 4.4a2.4 2.4 0 0 1-4.7.6 2.4 2.4 0 0 1-4.5 0 2.4 2.4 0 0 1-4.5 0 2.4 2.4 0 0 1-4.7-.6L4 4Z" />
      <path d="M5.3 10.5V19a1 1 0 0 0 1 1h11.4a1 1 0 0 0 1-1v-8.5" />
      <path d="M10 20v-4.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20" />
    </>,
    p,
  );

export const IcoBank = (p: IconProps) =>
  wrap(
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 21h18" />
    </>,
    p,
  );

export const IcoArrowUp = (p: IconProps) =>
  wrap(<path d="M7 17 17 7M8 7h9v9" />, { size: 16, ...p });

export const IcoPhone = (p: IconProps) =>
  wrap(
    <>
      <rect x={7} y={2.5} width={10} height={19} rx={2.6} />
      <path d="M11 18.5h2" />
    </>,
    p,
  );

export const IcoLogout = (p: IconProps) =>
  wrap(
    <>
      <path d="M15 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
      <path d="M13 12h8" />
      <path d="M18 9l3 3-3 3" />
    </>,
    p,
  );

export const IcoBackspace = (p: IconProps) =>
  wrap(
    <>
      <path d="M21 5H9L3 12l6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
      <path d="M17 9.5l-5 5M12 9.5l5 5" />
    </>,
    { size: 24, ...p },
  );

export const IcoSun = (p: IconProps) =>
  wrap(
    <>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" />
    </>,
    { size: 20, ...p },
  );

export const IcoMoon = (p: IconProps) =>
  wrap(<path d="M20.5 14.8A8.2 8.2 0 0 1 9.2 3.5 7.3 7.3 0 1 0 20.5 14.8Z" />, { size: 20, ...p });

export const IcoShield = (p: IconProps) =>
  wrap(
    <>
      <path d="M12 3l8 3v6c0 5-3.4 8.5-8 9.5-4.6-1-8-4.5-8-9.5V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>,
    p,
  );

export const GoogleG = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12a12 12 0 0 1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44a20 20 0 0 0 13.5-5.2l-6.2-5.3A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.3C39.9 36.2 44 31 44 24c0-1.2-.1-2.4-.4-3.5z"
    />
  </svg>
);
