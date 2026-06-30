import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { AGlyph } from '../components/Brand';
import { IcoBank, IcoChevron, IcoShield, IcoStore } from '../components/Icons';

type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected' | 'unknown';

/**
 * Add money — cards de método de fondeo.
 *
 *  - **SPEI/Etherfuse** (`/add/etherfuse`): si el user no tiene KYC, lo manda
 *    a /kyc primero. Si ya lo tiene, abre el flow de cotización + transferencia.
 *  - **Tarjeta** y **OXXO**: visibles pero deshabilitados (no expuestos en el
 *    SDK aún; quedan como teasers para mostrar el roadmap).
 *
 * Lee `kyc.status()` al mount para colorear el botón de KYC y saltarse el
 * paso si el user ya está aprobado.
 */
export function Add() {
  const navigate = useNavigate();
  const { kyc, auth } = useAccesly();

  const [kycStatus, setKycStatus] = useState<KycStatus>('unknown');

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await kyc.status();
        if (cancelled) return;
        setKycStatus((r.status as KycStatus) ?? 'not_started');
      } catch {
        if (!cancelled) setKycStatus('not_started');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.username, kyc]);

  return (
    <ScreenScroll>
      <PageHeader title="Agregar dinero" rightSlot={<ThemeToggle />} />

      <p
        style={{
          fontSize: 14,
          color: 'var(--ink2)',
          margin: '0 2px 16px',
          lineHeight: 1.5,
        }}
      >
        Elige cómo quieres fondear tu Smart Account. Etherfuse convierte tu MXN
        a USDC y los deposita en tu wallet on-chain.
      </p>

      <KycBanner status={kycStatus} onStart={() => navigate('/kyc')} />

      <div className="flex flex-col" style={{ gap: 11, marginTop: 14 }}>
        <MethodCard
          Icon={IcoBank}
          tone="amber"
          title="SPEI / Etherfuse"
          subtitle="Transfiere desde tu banco · MXN → USDC"
          badge={kycStatus === 'approved' ? 'Listo' : kycStatus === 'pending' ? 'KYC pendiente' : 'Requiere KYC'}
          badgeTone={kycStatus === 'approved' ? 'mint' : 'amber'}
          onClick={() => {
            if (kycStatus === 'approved') navigate('/add/etherfuse');
            else navigate('/kyc');
          }}
        />
        <MethodCard
          Icon={IcoStore}
          tone="amber"
          title="Efectivo en tienda"
          subtitle="OXXO + 20,000 puntos · Próximamente"
          disabled
        />
      </div>

      <div
        className="flex items-center gap-3"
        style={{
          marginTop: 22,
          padding: 14,
          borderRadius: 16,
          background: 'var(--lav-soft)',
          border: '1px solid rgba(139,108,231,.22)',
        }}
      >
        <AGlyph size={18} fill="var(--lav-ink)" />
        <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
          Tu llave nunca toca nuestros servidores. Etherfuse procesa el on-ramp
          y los USDC llegan directo a tu Smart Account.
        </div>
      </div>
    </ScreenScroll>
  );
}

function KycBanner({
  status,
  onStart,
}: {
  status: KycStatus;
  onStart: () => void;
}) {
  if (status === 'approved') {
    return (
      <div
        className="flex items-center gap-3"
        style={{
          padding: 12,
          borderRadius: 14,
          background: 'var(--mint-soft)',
          border: '1px solid rgba(69,201,168,.22)',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--mint)',
            color: '#0b0a0f',
            flexShrink: 0,
          }}
        >
          <IcoShield size={20} />
        </div>
        <div className="flex-1" style={{ fontSize: 13, color: 'var(--ink)' }}>
          <div style={{ fontWeight: 700 }}>Identidad verificada</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
            Puedes hacer onramps sin límites diarios
          </div>
        </div>
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          background: 'var(--amber-soft)',
          fontSize: 13,
          color: 'var(--amber-ink)',
        }}
      >
        <div style={{ fontWeight: 700 }}>KYC en revisión</div>
        <div style={{ fontSize: 11.5, marginTop: 2 }}>
          Te avisamos por correo cuando Etherfuse termine de verificarte.
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="accesly-btn flex items-center gap-3 w-full text-left"
      style={{
        padding: 12,
        borderRadius: 14,
        background: 'var(--lav-soft)',
        border: '1px solid rgba(139,108,231,.22)',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--lav)',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <IcoShield size={20} />
      </div>
      <div className="flex-1">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Verifica tu identidad
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>
          Toma 2 min. Necesario para fondear con MXN.
        </div>
      </div>
      <IcoChevron style={{ color: 'var(--ink3)' }} />
    </button>
  );
}

function MethodCard({
  Icon,
  tone,
  title,
  subtitle,
  badge,
  badgeTone,
  onClick,
  disabled,
}: {
  Icon: (p: { size?: number }) => JSX.Element;
  tone: 'lav' | 'mint' | 'amber' | 'sky';
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'mint' | 'amber';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="accesly-btn flex items-center gap-3 w-full text-left"
      style={{
        padding: 14,
        borderRadius: 18,
        border: '1px solid var(--line)',
        background: 'var(--card)',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: `var(--${tone}-soft)`,
          color: `var(--${tone}-ink)`,
          flexShrink: 0,
        }}
      >
        <Icon size={23} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>{title}</div>
        <div
          className="truncate"
          style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}
        >
          {subtitle}
        </div>
      </div>
      {badge ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 9px',
            borderRadius: 999,
            background: `var(--${badgeTone}-soft)`,
            color: `var(--${badgeTone}-ink)`,
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      ) : null}
      {!disabled && !badge ? <IcoChevron style={{ color: 'var(--ink3)' }} /> : null}
    </button>
  );
}
