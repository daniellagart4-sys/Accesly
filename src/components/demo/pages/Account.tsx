import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { IcoLogout, IcoShield } from '../components/Icons';

/**
 * Account — perfil del user con datos del JWT + estado de recuperación +
 * cerrar sesión. Accesible desde el avatar del Home.
 */
export function Account() {
  const navigate = useNavigate();
  const { auth, wallet } = useAccesly();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    void (async () => {
      const c = await wallet.getStoredCredential(auth.username!).catch(() => null);
      if (!cancelled) setWalletAddress(c?.walletAddress ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.username, wallet]);

  async function onSignOut() {
    try {
      await auth.signOut();
    } finally {
      navigate('/');
    }
  }

  const initial = (auth.username ?? 'A').slice(0, 1).toUpperCase();
  const email = auth.username && auth.username.includes('@') ? auth.username : '—';

  const rows: { label: string; value: string; tone?: 'mint' | 'default' }[] = [
    { label: 'Usuario', value: auth.username ?? '—' },
    { label: 'Correo', value: email },
    { label: 'Recuperación', value: 'Activa', tone: 'mint' },
  ];

  return (
    <ScreenScroll>
      <PageHeader title="Mi cuenta" rightSlot={<ThemeToggle />} />

      <div className="flex-1 flex flex-col justify-center">
        <div
          className="flex flex-col items-center"
          style={{ gap: 4, marginBottom: 22 }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              background: 'var(--grad)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 34,
              boxShadow: '0 10px 26px rgba(139,108,231,.34)',
              marginBottom: 8,
            }}
          >
            {initial}
          </div>
          <div style={{ fontWeight: 700, fontSize: 21, color: 'var(--ink)' }}>
            {email !== '—' ? email.split('@')[0] : 'Usuario'}
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid var(--line)',
          }}
        >
          {rows.map((r, i) => (
            <div
              key={r.label}
              className="flex items-center justify-between"
              style={{
                padding: '14px 14px',
                background: 'var(--card)',
                borderBottom: i < rows.length - 1 ? '1px solid var(--line2)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{r.label}</span>
              <span
                className="truncate"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: r.tone === 'mint' ? 'var(--mint-ink)' : 'var(--ink)',
                  maxWidth: 200,
                  textAlign: 'right',
                }}
                title={r.value}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {walletAddress ? (
          <div
            className="flex items-center gap-3"
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 14,
              background: 'var(--card2)',
            }}
          >
            <IcoShield style={{ color: 'var(--lav-ink)' }} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Smart Account</div>
              <div
                className="truncate"
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
                title={walletAddress}
              >
                {walletAddress}
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSignOut}
          className="accesly-btn flex items-center justify-center gap-2"
          style={{
            marginTop: 24,
            height: 52,
            borderRadius: 16,
            border: '1px solid var(--line)',
            background: 'var(--card)',
            color: 'var(--ink)',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          <IcoLogout size={19} />
          Cerrar sesión
        </button>
      </div>
    </ScreenScroll>
  );
}
