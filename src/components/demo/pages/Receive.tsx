import { useEffect, useState } from 'react';
import { useAccesly } from '@accesly/react';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { IcoCheck, IcoCopy } from '../components/Icons';

/**
 * Receive — muestra dirección Stellar del Smart Account del user.
 * QR generado vía qrserver.com (público, sin tracking, free). Si querés
 * cero round-trips externos, swap a una lib client-side como `qrcode`.
 */
export function Receive() {
  const { wallet, auth } = useAccesly();
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    void (async () => {
      const stored = await wallet.getStoredCredential(auth.username!).catch(() => null);
      if (!cancelled) setAddress(stored?.walletAddress ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.username, wallet]);

  async function onCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard puede fallar en iframes / contextos no seguros. No-op.
    }
  }

  return (
    <ScreenScroll>
      <PageHeader title="Recibir dinero" rightSlot={<ThemeToggle />} />

      <div className="flex flex-col items-center" style={{ marginTop: 18 }}>
        <div
          style={{
            padding: 20,
            borderRadius: 24,
            background: '#FFFFFF',
            boxShadow: '0 14px 40px rgba(69,201,168,.22)',
          }}
        >
          {address ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(address)}`}
              alt="QR de la wallet"
              width={186}
              height={186}
              style={{ display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: 186,
                height: 186,
                background: '#F5F3F7',
                borderRadius: 8,
              }}
              aria-hidden
            />
          )}
        </div>

        <div style={{ marginTop: 18, fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
          Tu wallet
        </div>
        <div
          className="text-center"
          style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 4, maxWidth: 280 }}
        >
          Escanea o comparte la dirección para recibir XLM o USDC en tu Smart Account.
        </div>
      </div>

      <div
        className="flex items-center justify-between"
        style={{
          marginTop: 22,
          padding: '12px 14px',
          borderRadius: 14,
          background: 'var(--card2)',
        }}
      >
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Dirección Stellar</div>
          <div
            className="truncate"
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--ink)',
              marginTop: 2,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
            title={address ?? ''}
          >
            {address ?? '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!address}
          className="accesly-btn flex items-center gap-1"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--lav-ink)',
            fontSize: 12.5,
            fontWeight: 600,
            padding: '4px 8px',
            opacity: address ? 1 : 0.5,
          }}
        >
          {copied ? <IcoCheck size={16} strokeWidth={2.4} /> : <IcoCopy />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <p
        style={{
          marginTop: 18,
          fontSize: 12,
          color: 'var(--ink3)',
          textAlign: 'center',
        }}
      >
        Tip: solo manda fondos desde la red Stellar testnet. Mainnet aún no está disponible.
      </p>
    </ScreenScroll>
  );
}
