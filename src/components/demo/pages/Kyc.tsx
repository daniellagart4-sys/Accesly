import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly, useKycPolicy } from '@accesly/react';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { IcoCheck, IcoShield } from '../components/Icons';

type Status = 'unknown' | 'not_started' | 'pending' | 'approved' | 'rejected';

/**
 * KYC — frontend wrapper alrededor de `kyc.start()` / `kyc.status()`.
 *
 * Flow:
 *  1. Mount → llama `kyc.status()` para saber el estado actual del user.
 *  2. Botón "Iniciar verificación" → `kyc.start()` → devuelve `hostedUrl` →
 *     abrimos en nueva tab (Etherfuse hosted form).
 *  3. Cuando el user vuelve, re-checkeamos status (efectivamente polling de 1
 *     vez; el webhook server-side actualiza DDB asincrónamente).
 *
 * Si `useKycPolicy().enabled` es false, la pantalla muestra "No requerido"
 * porque el developer apagó KYC desde el dashboard.
 */
export function Kyc() {
  const navigate = useNavigate();
  const { kyc, auth } = useAccesly();
  const policy = useKycPolicy();

  const [status, setStatus] = useState<Status>('unknown');
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    if (!auth.username) return;
    try {
      const r = await kyc.status();
      setStatus((r.status as Status) ?? 'not_started');
      setHostedUrl(r.hostedUrl);
    } catch {
      setStatus('not_started');
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, [auth.username]);

  async function onStart() {
    setError(null);
    setLoading(true);
    try {
      const r = await kyc.start();
      setStatus((r.status as Status) ?? 'pending');
      setHostedUrl(r.hostedUrl);
      if (r.hostedUrl) window.open(r.hostedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la verificación.');
    } finally {
      setLoading(false);
    }
  }

  // Policy off → developer no requiere KYC en este app
  if (!policy.isLoading && !policy.enabled) {
    return (
      <ScreenScroll>
        <PageHeader title="Verificación de identidad" rightSlot={<ThemeToggle />} />
        <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: 28 }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'var(--mint-soft)',
              color: 'var(--mint-ink)',
            }}
          >
            <IcoCheck size={36} />
          </div>
          <div style={{ marginTop: 18, fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>
            No necesitas verificarte
          </div>
          <div
            className="text-center"
            style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, maxWidth: 280 }}
          >
            Esta app no requiere KYC. Ya puedes usar todas las funciones.
          </div>
          <button
            type="button"
            onClick={() => navigate('/wallet')}
            className="accesly-btn"
            style={{
              marginTop: 22,
              padding: '12px 22px',
              borderRadius: 14,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Ir al inicio
          </button>
        </div>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <PageHeader title="Verificación de identidad" rightSlot={<ThemeToggle />} />

      <div
        className="flex flex-col items-center text-center"
        style={{ marginTop: 12, padding: '12px 8px 20px' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 78,
            height: 78,
            borderRadius: '50%',
            background:
              status === 'approved'
                ? 'var(--mint-soft)'
                : status === 'pending'
                  ? 'var(--amber-soft)'
                  : 'var(--lav-soft)',
            color:
              status === 'approved'
                ? 'var(--mint-ink)'
                : status === 'pending'
                  ? 'var(--amber-ink)'
                  : 'var(--lav-ink)',
          }}
        >
          {status === 'approved' ? <IcoCheck size={38} /> : <IcoShield size={38} />}
        </div>
        <div style={{ marginTop: 16, fontWeight: 700, fontSize: 19, color: 'var(--ink)' }}>
          {status === 'approved'
            ? 'Identidad verificada'
            : status === 'pending'
              ? 'En revisión'
              : status === 'rejected'
                ? 'Verificación rechazada'
                : 'Verifica tu identidad'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, maxWidth: 300 }}>
          {status === 'approved'
            ? 'Puedes hacer onramps en MXN sin límites diarios.'
            : status === 'pending'
              ? 'Etherfuse está procesando tu información. Te avisamos por correo cuando termine.'
              : status === 'rejected'
                ? 'Etherfuse no pudo verificar tu identidad. Intenta de nuevo con documentos más claros.'
                : 'Necesario para fondear con MXN vía SPEI. Etherfuse procesa el KYC y nunca compartimos tus datos con terceros.'}
        </div>

        {policy.minLevel ? (
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--ink3)',
            }}
          >
            Nivel requerido: <strong>{policy.minLevel}</strong>
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(244,113,116,.1)',
            color: 'var(--error)',
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      ) : null}

      {status === 'not_started' || status === 'unknown' ? (
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          className="accesly-btn flex items-center justify-center gap-2"
          style={{
            width: '100%',
            height: 52,
            borderRadius: 16,
            border: 'none',
            background: 'var(--lav)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            boxShadow: 'var(--glow-lav)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Abriendo Etherfuse…' : 'Iniciar verificación'}
        </button>
      ) : status === 'pending' && hostedUrl ? (
        <button
          type="button"
          onClick={() => window.open(hostedUrl, '_blank', 'noopener,noreferrer')}
          className="accesly-btn"
          style={{
            width: '100%',
            height: 52,
            borderRadius: 16,
            border: '1px solid var(--line)',
            background: 'var(--card)',
            color: 'var(--ink)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Continuar en Etherfuse
        </button>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/wallet')}
          className="accesly-btn"
          style={{
            width: '100%',
            height: 52,
            borderRadius: 16,
            border: '1px solid var(--line)',
            background: 'var(--card)',
            color: 'var(--ink)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Ir al inicio
        </button>
      )}

      <button
        type="button"
        onClick={() => void refreshStatus()}
        className="accesly-btn"
        style={{
          width: '100%',
          marginTop: 10,
          padding: '8px 0',
          background: 'transparent',
          border: 'none',
          color: 'var(--ink3)',
          fontSize: 12,
        }}
      >
        Refrescar estado
      </button>
    </ScreenScroll>
  );
}
