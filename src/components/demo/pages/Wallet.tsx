import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly, useBalance, useWalletHistory, useBranding } from '@accesly/react';
import { ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { Wordmark, Accent, AGlyph } from '../components/Brand';
import { IcoAdd, IcoChevron, IcoReceive, IcoSend, IcoSwap } from '../components/Icons';

type PrimaryAsset = 'XLM' | 'USDC';
const PRIMARY_ASSET_KEY = 'accesly-example:primary-asset';

function readPrimaryAsset(): PrimaryAsset {
  if (typeof window === 'undefined') return 'XLM';
  const v = window.localStorage.getItem(PRIMARY_ASSET_KEY);
  return v === 'USDC' ? 'USDC' : 'XLM';
}

/**
 * Home — pantalla principal post-login. Replica el mockup del Brand Book:
 *  - Header con avatar (linkea a /account) + saludo + ThemeToggle
 *  - Balance card con gradient y micro-pill de delta
 *  - Quick actions row: Enviar / Recibir / Agregar / Swap
 *  - Lista de últimos movimientos (link a /history)
 *
 * Guard: si el user todavía no tiene wallet en este device, redirigimos a
 * /create-wallet (post-recovery o nuevo signup que se saltó el bootstrap).
 */
export function Wallet() {
  const navigate = useNavigate();
  const { wallet, auth } = useAccesly();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    void (async () => {
      const stored = await wallet.getStoredCredential(auth.username!).catch(() => null);
      if (cancelled) return;
      if (!stored?.walletAddress) {
        navigate('/create-wallet');
      } else {
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.username, wallet, navigate]);

  if (!checked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div style={{ color: 'var(--ink2)', fontSize: 14 }}>Cargando wallet…</div>
      </div>
    );
  }

  return <Home />;
}

function Home() {
  const navigate = useNavigate();
  const { auth } = useAccesly();
  const branding = useBranding();

  // Saludo: prefer displayName del branding, fallback a username del JWT.
  const greeting = greetingFromUsername(auth.username) || branding.displayName || 'usuario';

  return (
    <ScreenScroll>
      <div className="flex items-center justify-between" style={{ padding: '22px 0 18px' }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="accesly-btn flex items-center justify-center"
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              background: 'var(--grad)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 18,
              flexShrink: 0,
              boxShadow: '0 4px 14px rgba(139,108,231,.32)',
              border: 'none',
              padding: 0,
            }}
            aria-label="Mi cuenta"
          >
            {greeting.slice(0, 1).toUpperCase()}
          </button>
          <div style={{ fontSize: 18, color: 'var(--ink2)', letterSpacing: '-.01em' }}>
            Hola,{' '}
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{greeting}</span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <BalanceCard />

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          margin: '18px 0 6px',
        }}
      >
        <QuickAction Icon={IcoSend} label="Enviar" tone="lav" onClick={() => navigate('/send')} />
        <QuickAction
          Icon={IcoReceive}
          label="Recibir"
          tone="mint"
          onClick={() => navigate('/receive')}
        />
        <QuickAction
          Icon={IcoAdd}
          label="Agregar"
          tone="amber"
          onClick={() => navigate('/add')}
        />
        <QuickAction Icon={IcoSwap} label="Swap" tone="sky" onClick={() => navigate('/swap')} />
      </div>

      <RecentMovements onSeeAll={() => navigate('/history')} />
    </ScreenScroll>
  );
}

function greetingFromUsername(username: string | null | undefined): string | null {
  if (!username) return null;
  // Cognito usernames suelen ser `Google_<id>` o `email@host.com`. Sacamos
  // el primer chunk legible: parte antes de `@` o de `_`.
  const local = username.includes('@') ? username.split('@')[0] : username;
  const clean = (local ?? '').replace(/^Google_\d+$/, '').split('_')[0]?.split('.')[0];
  if (!clean || /^\d+$/.test(clean)) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function BalanceCard() {
  const balance = useBalance();

  // Preferencia de asset primario — el user lo toggle con un botón sencillo
  // sin texto al lado del label "Saldo disponible". Persiste en localStorage.
  const [primary, setPrimary] = useState<PrimaryAsset>(readPrimaryAsset);
  useEffect(() => {
    try {
      window.localStorage.setItem(PRIMARY_ASSET_KEY, primary);
    } catch {
      /* quota / private mode — no-op */
    }
  }, [primary]);

  const xlmFormatted = balance.xlm ?? '0';
  const usdcFormatted = balance.usdc ?? '0';
  const primaryFormatted = primary === 'XLM' ? xlmFormatted : usdcFormatted;
  const secondaryAsset: PrimaryAsset = primary === 'XLM' ? 'USDC' : 'XLM';
  const secondaryFormatted = primary === 'XLM' ? usdcFormatted : xlmFormatted;

  return (
    <div
      style={{
        borderRadius: 27,
        padding: 1.4,
        background:
          'linear-gradient(135deg, rgba(139,108,231,.45), rgba(123,164,247,.36), rgba(69,201,168,.46))',
        boxShadow: '0 14px 34px rgba(139,108,231,.15)',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 26,
          padding: '22px 22px 20px',
          background:
            'radial-gradient(82% 95% at 6% -6%, rgba(139,108,231,.30), transparent 58%),' +
            'radial-gradient(85% 90% at 104% 16%, rgba(123,164,247,.24), transparent 56%),' +
            'radial-gradient(98% 110% at 55% 120%, rgba(69,201,168,.32), transparent 60%),' +
            'var(--card)',
        }}
      >
        <div className="flex items-center justify-between" style={{ position: 'relative' }}>
          <div className="flex items-center gap-2">
            <span
              style={{
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--ink2)',
              }}
            >
              Saldo disponible
            </span>
            {/* Toggle simple sin texto — switchea asset principal */}
            <button
              type="button"
              onClick={() => setPrimary((p) => (p === 'XLM' ? 'USDC' : 'XLM'))}
              aria-label={`Mostrar ${secondaryAsset} como principal`}
              className="accesly-btn flex items-center justify-center"
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1px solid var(--line)',
                background: 'var(--card)',
                color: 'var(--ink2)',
                padding: 0,
              }}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M7 4v12" />
                <path d="M3 8l4-4 4 4" />
                <path d="M17 20V8" />
                <path d="M13 16l4 4 4-4" />
              </svg>
            </button>
          </div>
          <Wordmark size={13} color="var(--lav-ink)" />
        </div>

        <div
          style={{
            position: 'relative',
            marginTop: 14,
            display: 'flex',
            alignItems: 'baseline',
            color: 'var(--ink)',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 23, color: 'var(--ink3)', marginRight: 4 }}>
            {primary}
          </span>
          <span style={{ fontWeight: 800, fontSize: 44, lineHeight: 1, letterSpacing: '-.03em' }}>
            {primaryFormatted}
          </span>
        </div>

        <div
          style={{
            position: 'relative',
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--ink2)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span>
            + {secondaryFormatted} {secondaryAsset}
          </span>
        </div>

        {balance.error ? (
          <div
            style={{
              position: 'relative',
              marginTop: 12,
              fontSize: 12,
              color: 'var(--error)',
            }}
          >
            No pudimos refrescar tu saldo
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QuickAction({
  Icon,
  label,
  tone,
  onClick,
}: {
  Icon: (p: { size?: number }) => JSX.Element;
  label: string;
  tone: 'lav' | 'mint' | 'amber' | 'sky';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="accesly-btn flex flex-col items-center gap-2.5"
      style={{
        padding: '14px 4px 12px',
        borderRadius: 18,
        border: '1px solid var(--line)',
        background: 'var(--card)',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: `var(--${tone}-soft)`,
          color: `var(--${tone}-ink)`,
        }}
      >
        <Icon size={22} />
      </div>
      <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--ink)' }}>{label}</span>
    </button>
  );
}

function RecentMovements({ onSeeAll }: { onSeeAll: () => void }) {
  const history = useWalletHistory();
  const events = history.events.slice(0, 4);

  return (
    <>
      <div className="flex items-center justify-between" style={{ margin: '24px 2px 10px' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Movimientos</span>
          <Accent w={32} />
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="accesly-btn"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--lav-ink)',
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          Ver todos
        </button>
      </div>

      {history.isLoading && events.length === 0 ? (
        <div className="text-center py-4" style={{ color: 'var(--ink3)', fontSize: 13 }}>
          Cargando…
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-6" style={{ color: 'var(--ink3)', fontSize: 13 }}>
          Aún no hay movimientos.
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Pídele a alguien que te envíe XLM o agrega fondos.
          </div>
        </div>
      ) : (
        <div>
          {events.map((e) => (
            <MovementRow key={`${e.type}-${e.eventToid}`} item={e} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onSeeAll}
        className="accesly-btn flex items-center justify-center gap-1"
        style={{
          width: '100%',
          marginTop: 14,
          padding: '10px 0',
          border: '1px solid var(--line)',
          borderRadius: 14,
          background: 'transparent',
          color: 'var(--ink2)',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Ver historial completo
        <IcoChevron />
      </button>
    </>
  );
}

interface HistoryItemLike {
  readonly type: 'wallet-created' | 'signer-rotated' | 'transfer-in' | 'transfer-out';
  readonly eventToid: string;
  readonly txToid: string;
  readonly ledger: number;
  readonly timestamp: string;
  readonly to?: string;
  readonly from?: string;
  readonly amountStroops?: string;
  readonly asset?: string;
}

function MovementRow({ item }: { item: HistoryItemLike }) {
  const meta = describe(item);
  return (
    <div className="flex items-center gap-3" style={{ padding: '11px 2px' }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: meta.bg,
          color: meta.color,
          fontWeight: 700,
          fontSize: 18,
          flexShrink: 0,
        }}
        aria-hidden
      >
        {meta.icon === '✦' ? <AGlyph size={20} fill="currentColor" /> : meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}
        >
          {meta.title}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}
        >
          {meta.subtitle}
        </div>
      </div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: meta.flow === 'in' ? 'var(--mint-ink)' : 'var(--ink)',
        }}
      >
        {meta.amount}
      </div>
    </div>
  );
}

function describe(item: HistoryItemLike) {
  const asset = item.asset ?? 'XLM';
  if (item.type === 'transfer-in') {
    return {
      title: 'Recibido',
      subtitle: `de ${short(item.from)}`,
      amount: `+${stroopsToHuman(item.amountStroops)} ${asset}`,
      icon: '↓',
      color: 'var(--mint-ink)',
      bg: 'var(--mint-soft)',
      flow: 'in' as const,
    };
  }
  if (item.type === 'transfer-out') {
    return {
      title: 'Enviado',
      subtitle: `a ${short(item.to)}`,
      amount: `-${stroopsToHuman(item.amountStroops)} ${asset}`,
      icon: '↑',
      color: 'var(--ink)',
      bg: 'var(--lav-soft)',
      flow: 'out' as const,
    };
  }
  if (item.type === 'signer-rotated') {
    return {
      title: 'Llave rotada',
      subtitle: 'Cambio de signer',
      amount: '',
      icon: '⟳',
      color: 'var(--sky-ink)',
      bg: 'var(--sky-soft)',
      flow: 'meta' as const,
    };
  }
  return {
    title: 'Wallet creada',
    subtitle: 'Smart Account on-chain',
    amount: '',
    icon: '✦',
    color: 'var(--lav-ink)',
    bg: 'var(--lav-soft)',
    flow: 'meta' as const,
  };
}

function short(addr?: string | null): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function stroopsToHuman(stroops?: string): string {
  if (!stroops) return '0';
  const n = Number(stroops) / 1e7;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
