import { useEffect, useState, type ReactNode } from 'react';
import { useAccesly, useBranding } from '@accesly/react';
import { useTheme } from '../theme/ThemeContext';
import { IcoMoon, IcoSun } from './Icons';

/**
 * `<WalletLauncher>` — entry point del example app. Patrón "embedded widget"
 * estilo Stripe Checkout / Plaid Link:
 *
 *   - Sin sesión → botón "Iniciar sesión" (o el copy custom del dashboard).
 *   - Con sesión → "Hola, [usuario]" + status indicator.
 *
 * Click en el botón → abre el wallet en un modal centrado con backdrop dark.
 * Click en backdrop o tecla ESC → cierra. State persiste (react-router state
 * no se pierde) — al re-abrir vuelves donde estabas.
 *
 * El integrador real elige DÓNDE pone este botón (FAB en esquina, header
 * sidebar, etc). El example lo centra para demo.
 */
export interface WalletLauncherProps {
  /** El árbol que se renderea DENTRO del modal cuando está abierto. */
  readonly children: ReactNode;
}

export function WalletLauncher({ children }: WalletLauncherProps) {
  const { auth } = useAccesly();
  const branding = useBranding();
  const [isOpen, setIsOpen] = useState(false);

  // ESC para cerrar — es la convención universal para modals/drawers.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Lock scroll del body cuando el modal está abierto — el wallet tiene su
  // propio scroll interno, no queremos que se mueva la página atrás.
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const authed = auth.status === 'authenticated';
  const greeting = greetingFromUsername(auth.username);

  // Texto del botón: si auth → "Hola, [nombre]"; si no → branding configurable
  // del dashboard, con fallback hardcoded.
  const buttonLabel = authed
    ? `Hola, ${greeting}`
    : branding.loginButtonText || 'Iniciar sesión';

  return (
    <>
      {/* "Host app" del integrador — el example deja minimalista (solo el
          botón centrado). En su app real el dev tiene aquí su sitio entero
          (e-commerce, dashboard, lo que sea). */}
      <HostBackground showThemeToggle={!isOpen}>
        <LauncherButton onClick={() => setIsOpen(true)} label={buttonLabel} authed={authed} />
      </HostBackground>

      {/* Modal con el wallet adentro. SIEMPRE montado para preservar el
          state de la navegación interna (react-router), pero oculto via
          CSS cuando isOpen=false. Eso permite que el user cierre/reabra
          sin perder en qué pantalla estaba. */}
      <WalletModal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {children}
      </WalletModal>
    </>
  );
}

function HostBackground({
  children,
  showThemeToggle,
}: {
  children: ReactNode;
  showThemeToggle: boolean;
}) {
  const { theme, toggle } = useTheme();
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background:
          'radial-gradient(55% 45% at 16% 0%, rgba(139,108,231,.16), transparent 60%),' +
          'radial-gradient(50% 42% at 90% 100%, rgba(69,201,168,.13), transparent 60%),' +
          'var(--bg)',
        transition: 'background .35s ease',
      }}
    >
      {/* Subtle "host app" hint top-left para que se sienta como una app real */}
      <div
        className="absolute top-5 left-5 text-xs"
        style={{ color: 'var(--ink3)', letterSpacing: '.05em' }}
      >
        Mi App · powered by Accesly
      </div>

      {/* Theme toggle del HOST — solo visible cuando el modal está cerrado.
          Cuando el modal abre, choca visualmente con la X del modal (ambos
          van en top-right), así que lo ocultamos. El user puede toggle el
          tema desde dentro del modal igual (cada PageHeader tiene su botón). */}
      {showThemeToggle ? (
        <div className="absolute top-5 right-5">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            className="flex items-center justify-center accesly-btn"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--ink2)',
            }}
          >
            {theme === 'light' ? <IcoMoon size={18} /> : <IcoSun size={18} />}
          </button>
        </div>
      ) : null}

      {children}
    </div>
  );
}

function LauncherButton({
  onClick,
  label,
  authed,
}: {
  onClick: () => void;
  label: string;
  authed: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="accesly-btn flex items-center gap-3 anim-pop"
      style={{
        padding: '14px 24px',
        borderRadius: 999,
        border: 'none',
        background: 'var(--accesly-grad, var(--grad))',
        color: '#fff',
        fontWeight: 700,
        fontSize: 16,
        boxShadow: 'var(--glow-lav)',
        letterSpacing: '-.005em',
      }}
    >
      {authed ? (
        <span
          aria-hidden
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.18)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {label.slice(label.indexOf(' ') + 1, label.indexOf(' ') + 2).toUpperCase()}
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 0 0 4px rgba(255,255,255,.25)',
          }}
        />
      )}
      <span>{label}</span>
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function WalletModal({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={!isOpen}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        // pointer-events off cuando cerrado para no bloquear clicks del host
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {/* Backdrop — fade in/out + click cierra. */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(11, 9, 21, .55)',
          opacity: isOpen ? 1 : 0,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          transition: 'opacity .25s ease',
        }}
      />

      {/* Phone-frame centrado. Transform pop-in cuando abre. */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          inset: 0,
          padding: 12,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : 'scale(.94)',
          transition: 'opacity .25s ease, transform .3s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Wallet"
          className="flex flex-col relative overflow-hidden"
          style={{
            width: 392,
            maxWidth: 'calc(100vw - 24px)',
            height: 'min(820px, calc(100vh - 32px))',
            background: 'var(--sheet)',
            borderRadius: 38,
            boxShadow: '0 30px 80px rgba(0,0,0,.45), 0 0 0 1px var(--line)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close X */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar wallet"
            className="absolute accesly-btn flex items-center justify-center z-10"
            style={{
              top: 12,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--card2)',
              color: 'var(--ink2)',
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>

          {/* Wallet content — siempre montado para preservar router state. */}
          {children}
        </div>
      </div>
    </div>
  );
}

function greetingFromUsername(username: string | null | undefined): string {
  if (!username) return 'tú';
  const local = username.includes('@') ? username.split('@')[0]! : username;
  const clean = local.replace(/^Google_\d+$/, '').split('_')[0]?.split('.')[0];
  if (!clean || /^\d+$/.test(clean)) return 'tú';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
