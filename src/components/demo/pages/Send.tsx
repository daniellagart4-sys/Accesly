import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly, useBalance } from '@accesly/react';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { IcoBackspace, IcoCheck, IcoSend } from '../components/Icons';
import type { TransferAsset } from '@accesly/core';

type Step = 'compose' | 'signing' | 'sent' | 'error';

/**
 * Send — XLM o USDC. Sin contacts strip (decisión Brand v3): el user pega o
 * tipea la dirección destino, escoge asset, elige monto con un numpad, y
 * dispara `tx.send()`. El SDK hace el reconstruct Shamir + signs auth entry.
 */
export function Send() {
  const navigate = useNavigate();
  const { tx, wallet, auth } = useAccesly();
  const balance = useBalance();

  const [destination, setDestination] = useState('');
  const [asset, setAsset] = useState<TransferAsset>('XLM');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('compose');
  const [error, setError] = useState<string | null>(null);
  const [resultHash, setResultHash] = useState<string | null>(null);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!auth.username) {
      setError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }
    if (!destination || destination.length < 12) {
      setError('Ingresa una dirección destino válida.');
      return;
    }
    let amountStroops: string;
    try {
      amountStroops = toStroops(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monto inválido');
      return;
    }

    setStep('signing');
    try {
      const material = await wallet.unlockForSigning(auth.username);
      const r = await tx.send({
        destinationAddress: destination.trim(),
        amountStroops,
        asset,
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });
      setResultHash(r.txHash);
      setStep('sent');
      // Auto-retorno al home post-éxito para que se actualice el balance.
      setTimeout(() => navigate('/wallet'), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
      setStep('error');
    }
  }

  if (step === 'signing') return <SigningView />;
  if (step === 'sent') return <SentView txHash={resultHash} />;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  const displayAmount = amount === '' ? '0' : amount;
  const assetBalance = asset === 'XLM' ? balance.xlm : balance.usdc;

  return (
    <ScreenScroll className="flex flex-col">
      <PageHeader title="Enviar dinero" rightSlot={<ThemeToggle />} />

      <form onSubmit={onSubmit} className="flex-1 flex flex-col">
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--ink2)',
          }}
        >
          Dirección destino
        </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="G... o C..."
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{
            marginTop: 6,
            width: '100%',
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid var(--line)',
            background: 'var(--card)',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            outline: 'none',
          }}
        />

        <div className="flex gap-2 mt-3">
          {(['XLM', 'USDC'] as const).map((a) => {
            const on = asset === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setAsset(a)}
                className="accesly-btn flex-1"
                style={{
                  padding: '9px 0',
                  borderRadius: 12,
                  border: on ? '1.5px solid var(--lav)' : '1px solid var(--line)',
                  background: on ? 'var(--lav-soft)' : 'var(--card)',
                  color: on ? 'var(--lav-ink)' : 'var(--ink2)',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {a}
              </button>
            );
          })}
        </div>

        <div
          className="flex-1 flex flex-col items-center justify-center"
          style={{ minHeight: 130 }}
        >
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            Disponible: {assetBalance ?? '0'} {asset}
          </div>
          <div className="flex items-baseline" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 26, color: 'var(--ink3)', fontWeight: 700, marginRight: 4 }}>
              {asset}
            </span>
            <span
              style={{
                fontSize: 48,
                lineHeight: 1,
                letterSpacing: '-.03em',
                fontWeight: 700,
                color: amount && amount !== '0' ? 'var(--ink)' : 'var(--ink3)',
              }}
            >
              {displayAmount}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--mint-ink)', marginTop: 6 }}>
            Llega al instante · Sin comisión
          </div>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="accesly-key flex items-center justify-center"
              style={{
                height: 50,
                borderRadius: 14,
                border: 'none',
                background: 'transparent',
                fontSize: 22,
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              {k === 'back' ? <IcoBackspace size={22} strokeWidth={1.7} /> : k}
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
          disabled={!destination || !amount}
          className="accesly-btn flex items-center justify-center gap-2"
          style={{
            height: 54,
            borderRadius: 16,
            border: 'none',
            background: 'var(--lav)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            boxShadow: 'var(--glow-lav)',
            opacity: !destination || !amount ? 0.55 : 1,
          }}
        >
          <IcoSend size={19} strokeWidth={2.1} />
          Enviar {displayAmount} {asset}
        </button>
      </form>
    </ScreenScroll>
  );
}

function SigningView() {
  // Spinner: no usamos `className` para la animación porque las reglas en
  // `index.css` con `prefers-reduced-motion` o cualquier class shorthand
  // pueden colisionar con la inline `animation` y dejar el ring estático.
  // Usar solo `style` garantiza que la spin loop arranca incluso si hay
  // otro class en el árbol que setea `animation:` por separado.
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
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Firmando…</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, maxWidth: 280 }}>
          Aprueba con tu biométrico. Tu llave nunca toca nuestros servidores.
        </div>
      </div>
    </div>
  );
}

function SentView({ txHash }: { txHash: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center anim-scr" style={{ padding: 28 }}>
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
        <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>Dinero enviado</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6 }}>
          Tu transferencia llegó al instante.
        </div>
        {txHash ? (
          <div style={{ marginTop: 12 }}>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12,
                color: 'var(--lav-ink)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {txHash.slice(0, 8)}…{txHash.slice(-6)}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
