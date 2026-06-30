import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly, useBalance } from '@accesly/react';
import type { TransferAsset } from '@accesly/core';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { IcoBackspace, IcoCheck, IcoSwap } from '../components/Icons';

type Step = 'compose' | 'signing' | 'success' | 'error';

/**
 * Swap XLM ↔ USDC, brand-matching custom UI (no usa `<SwapFlow>` del kit
 * para mantener consistencia visual con Send).
 *
 * Flow:
 *  1. User pickea from/to + amount + slippage
 *  2. Submit → unlockForSigning (passkey prompt)
 *  3. `tx.swap()` (Soroswap aggregator) → si falla "Path not found",
 *     auto-retry con `tx.swapViaSdex()` (SDEX classic). Mismo material
 *     unlocked, sin segundo prompt
 *  4. Success: muestra amountOut + venue (Soroswap/SDEX) + link explorer
 */
export function Swap() {
  const navigate = useNavigate();
  const { tx, wallet, auth } = useAccesly();
  const balance = useBalance();

  const [fromAsset, setFromAsset] = useState<TransferAsset>('XLM');
  const [toAsset, setToAsset] = useState<TransferAsset>('USDC');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50); // 0.5%
  const [step, setStep] = useState<Step>('compose');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    txHash: string;
    amountOut: string;
    platform: string;
    explorerUrl: string;
  } | null>(null);

  function press(k: string) {
    let cur = amount;
    if (k === 'back') cur = cur.slice(0, -1);
    else if (k === '.') {
      if (!cur.includes('.')) cur = cur === '' ? '0.' : cur + '.';
    } else {
      if (cur === '0') cur = k;
      else if ((cur.split('.')[1] ?? '').length >= 7) return;
      else cur += k;
    }
    if (cur.replace('.', '').length > 12) return;
    setAmount(cur);
  }

  function toStroops(human: string): string {
    const n = Number(human);
    if (!isFinite(n) || n <= 0) throw new Error('Monto inválido');
    return BigInt(Math.round(n * 1e7)).toString();
  }

  function flip() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fromAsset === toAsset) {
      setError('From y To deben ser distintos.');
      return;
    }
    if (!auth.username) {
      setError('Sesión expirada.');
      return;
    }
    let amountIn: string;
    try {
      amountIn = toStroops(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monto inválido');
      return;
    }

    setStep('signing');
    try {
      const material = await wallet.unlockForSigning(auth.username);
      const args = {
        fromAsset,
        toAsset,
        amountIn,
        slippageBps,
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      };
      let r;
      try {
        r = await tx.swap(args);
      } catch (soroswapErr) {
        // Auto-fallback Soroswap → SDEX cuando no hay path. El material
        // sigue unlocked, así que el retry es invisible para el user.
        const msg = soroswapErr instanceof Error ? soroswapErr.message : '';
        const noPath =
          msg.includes('Path not found') ||
          msg.includes('No path found') ||
          msg.includes('soroswap');
        if (!noPath) throw soroswapErr;
        r = await tx.swapViaSdex(args);
      }
      setResult({
        txHash: r.txHash,
        amountOut: (Number(r.quote.amountOut) / 1e7).toString(),
        platform: r.quote.platform,
        explorerUrl: r.explorerUrl,
      });
      setStep('success');
      // No auto-redirect; el user puede querer ver detalles + ir al historial
      // o al wallet manualmente.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo hacer el swap.');
      setStep('error');
    }
  }

  if (step === 'signing') return <SigningView />;
  if (step === 'success' && result)
    return (
      <SuccessView
        result={result}
        fromAsset={fromAsset}
        toAsset={toAsset}
        onAgain={() => {
          setResult(null);
          setAmount('');
          setStep('compose');
        }}
        onHome={() => navigate('/wallet')}
      />
    );

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  const displayAmount = amount === '' ? '0' : amount;
  const fromBalance = fromAsset === 'XLM' ? balance.xlm : balance.usdc;

  return (
    <ScreenScroll className="flex flex-col">
      <PageHeader title="Swap" rightSlot={<ThemeToggle />} />

      <form onSubmit={onSubmit} className="flex-1 flex flex-col">
        {/* Asset pair card con flip button al centro */}
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateRows: '1fr 1fr',
            gap: 8,
          }}
        >
          <AssetPicker label="De" asset={fromAsset} balance={fromBalance ?? '0'} />
          <AssetPicker label="A" asset={toAsset} balance={null} dim />
          <button
            type="button"
            onClick={flip}
            aria-label="Intercambiar dirección"
            className="accesly-btn flex items-center justify-center"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(0deg)',
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'var(--lav)',
              color: '#fff',
              border: '4px solid var(--sheet)',
              boxShadow: 'var(--glow-lav)',
            }}
          >
            <IcoSwap size={18} strokeWidth={2.2} />
          </button>
        </div>

        {/* Slippage chips */}
        <div className="flex items-center gap-2" style={{ marginTop: 16 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--ink2)',
              marginRight: 'auto',
            }}
          >
            Slippage
          </span>
          {[10, 50, 100, 300].map((bps) => {
            const on = slippageBps === bps;
            return (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className="accesly-btn"
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: on ? '1.5px solid var(--lav)' : '1px solid var(--line)',
                  background: on ? 'var(--lav-soft)' : 'transparent',
                  color: on ? 'var(--lav-ink)' : 'var(--ink2)',
                  fontWeight: 600,
                  fontSize: 11.5,
                }}
              >
                {(bps / 100).toFixed(bps < 100 ? 2 : 1)}%
              </button>
            );
          })}
        </div>

        <div
          className="flex-1 flex flex-col items-center justify-center"
          style={{ minHeight: 100 }}
        >
          <div className="flex items-baseline">
            <span style={{ fontSize: 26, color: 'var(--ink3)', fontWeight: 700, marginRight: 4 }}>
              {fromAsset}
            </span>
            <span
              style={{
                fontSize: 46,
                lineHeight: 1,
                letterSpacing: '-.03em',
                fontWeight: 700,
                color: amount && amount !== '0' ? 'var(--ink)' : 'var(--ink3)',
              }}
            >
              {displayAmount}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>
            Rate ≈ Soroswap, fallback SDEX automático
          </div>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="accesly-key flex items-center justify-center"
              style={{
                height: 46,
                borderRadius: 14,
                border: 'none',
                background: 'transparent',
                fontSize: 21,
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              {k === 'back' ? <IcoBackspace size={20} strokeWidth={1.7} /> : k}
            </button>
          ))}
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: 10,
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

        <button
          type="submit"
          disabled={!amount || fromAsset === toAsset}
          className="accesly-btn flex items-center justify-center gap-2"
          style={{
            height: 52,
            borderRadius: 16,
            border: 'none',
            background: 'var(--lav)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            boxShadow: 'var(--glow-lav)',
            opacity: !amount || fromAsset === toAsset ? 0.55 : 1,
          }}
        >
          <IcoSwap size={18} strokeWidth={2.1} />
          Cambiar {fromAsset} por {toAsset}
        </button>
      </form>
    </ScreenScroll>
  );
}

function AssetPicker({
  label,
  asset,
  balance,
  dim,
}: {
  label: string;
  asset: TransferAsset;
  balance: string | null;
  dim?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: '14px 16px',
        borderRadius: 18,
        border: '1px solid var(--line)',
        background: dim ? 'var(--card2)' : 'var(--card)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--ink3)',
          }}
        >
          {label}
        </div>
        <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--ink)', marginTop: 2 }}>
          {asset}
        </div>
      </div>
      {balance != null ? (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Disponible</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>
            {balance}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>recibes</div>
      )}
    </div>
  );
}

function SigningView() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center anim-scr"
      style={{ padding: 28 }}
    >
      <div
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: '3px solid var(--lav-soft)',
          borderTopColor: 'var(--lav)',
          animationName: 'spin',
          animationDuration: '0.9s',
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        }}
      />
      <div className="text-center" style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Firmando swap…</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, maxWidth: 280 }}>
          Aprueba con tu biométrico. Si no hay liquidez en Soroswap, cae a SDEX automáticamente.
        </div>
      </div>
    </div>
  );
}

function SuccessView({
  result,
  fromAsset,
  toAsset,
  onAgain,
  onHome,
}: {
  result: { txHash: string; amountOut: string; platform: string; explorerUrl: string };
  fromAsset: TransferAsset;
  toAsset: TransferAsset;
  onAgain: () => void;
  onHome: () => void;
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center anim-scr"
      style={{ padding: 28 }}
    >
      <div
        className="anim-pop flex items-center justify-center"
        style={{
          width: 86,
          height: 86,
          borderRadius: '50%',
          background: 'var(--mint)',
          color: '#0b0a0f',
          boxShadow: 'var(--glow-mint)',
        }}
      >
        <IcoCheck size={42} />
      </div>
      <div className="text-center" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>Swap completo</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8 }}>
          Recibiste{' '}
          <strong style={{ color: 'var(--ink)' }}>
            {result.amountOut} {toAsset}
          </strong>{' '}
          a cambio de {fromAsset}
        </div>
        <div
          className="inline-flex items-center gap-1"
          style={{
            marginTop: 10,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--lav-soft)',
            color: 'var(--lav-ink)',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          vía {result.platform}
        </div>
        <div style={{ marginTop: 16 }}>
          <a
            href={result.explorerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12,
              color: 'var(--lav-ink)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {result.txHash.slice(0, 8)}…{result.txHash.slice(-6)}
          </a>
        </div>
      </div>

      <div className="flex gap-2" style={{ marginTop: 28, width: '100%' }}>
        <button
          type="button"
          onClick={onAgain}
          className="accesly-btn"
          style={{
            flex: 1,
            height: 50,
            borderRadius: 14,
            border: '1px solid var(--line)',
            background: 'var(--card)',
            color: 'var(--ink)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Otro swap
        </button>
        <button
          type="button"
          onClick={onHome}
          className="accesly-btn"
          style={{
            flex: 1,
            height: 50,
            borderRadius: 14,
            border: 'none',
            background: 'var(--lav)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            boxShadow: 'var(--glow-lav)',
          }}
        >
          Ir al inicio
        </button>
      </div>
    </div>
  );
}
