import { type ReactNode, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { IcoHome, IcoReceive, IcoSend } from './Icons';

/**
 * Shell interno del wallet — ya NO contiene el phone-frame (eso lo provee
 * el `<WalletModal>` que envuelve este árbol). Solo aporta el scroll
 * interno + el bottom tab bar cuando hay sesión.
 *
 * `bare` oculta el tab bar para flows no-autenticados (landing/signin/etc.)
 * y para wizards con su propio header (create-wallet, recover, callback).
 */
export function Layout({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const { auth } = useAccesly();
  const location = useLocation();

  const authed = auth.status === 'authenticated';
  const showTabs = !bare && authed;

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
      {showTabs ? <TabBar pathname={location.pathname} /> : null}
    </>
  );
}

const TABS = [
  { to: '/wallet', label: 'Inicio', Icon: IcoHome },
  { to: '/send', label: 'Enviar', Icon: IcoSend },
  { to: '/receive', label: 'Recibir', Icon: IcoReceive },
] as const;

function TabBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const active = useMemo(() => {
    return TABS.findIndex((t) => pathname === t.to || pathname.startsWith(t.to + '/'));
  }, [pathname]);

  return (
    <div
      className="flex"
      style={{
        borderTop: '1px solid var(--line)',
        background: 'var(--sheet)',
        padding: '8px 8px 10px',
      }}
    >
      {TABS.map((t, i) => {
        const on = i === active;
        return (
          <button
            key={t.to}
            type="button"
            onClick={() => navigate(t.to)}
            className="accesly-btn flex-1 flex flex-col items-center gap-1 py-1.5"
            style={{
              background: 'none',
              border: 'none',
              color: on ? 'var(--lav-ink)' : 'var(--ink3)',
            }}
            aria-current={on ? 'page' : undefined}
          >
            <t.Icon size={23} strokeWidth={on ? 2.05 : 1.8} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Header reutilizable para subpáginas (con back). El back va a /wallet por
 * default; el caller puede override con `onBack` para flows wizard.
 */
export function PageHeader({
  title,
  rightSlot,
  onBack,
}: {
  title: string;
  rightSlot?: ReactNode;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3" style={{ padding: '26px 0 14px' }}>
      <button
        type="button"
        onClick={onBack ?? (() => navigate('/wallet'))}
        className="accesly-btn flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          border: '1px solid var(--line)',
          background: 'var(--card)',
          color: 'var(--ink)',
        }}
        aria-label="Volver"
      >
        <BackArrow />
      </button>
      <div className="flex-1 min-w-0">
        <h2
          className="m-0 truncate"
          style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)', letterSpacing: '-.005em' }}
        >
          {title}
        </h2>
        <div
          style={{
            width: 28,
            height: 3,
            borderRadius: 3,
            background: 'var(--grad)',
            marginTop: 7,
          }}
        />
      </div>
      {rightSlot ? <div className="flex-shrink-0">{rightSlot}</div> : null}
    </div>
  );
}

function BackArrow() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ScreenScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex-1 overflow-y-auto anim-scr ${className ?? ''}`}
      style={{ padding: '8px 20px 16px' }}
    >
      {children}
    </div>
  );
}
