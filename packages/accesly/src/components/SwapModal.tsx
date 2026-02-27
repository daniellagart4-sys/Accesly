/**
 * SwapModal.tsx - Swap between XLM, USDC, and EURC using the Stellar DEX.
 *
 * Uses the useAccesly hook for estimateSwap and swap — no props beyond callbacks.
 *
 * Usage:
 *   import { SwapModal } from 'accesly';
 *   <SwapModal onClose={() => setOpen(false)} onSuccess={() => refresh()} />
 */

import { useState, useEffect, useRef } from 'react';
import { useAccesly } from '../hooks/useAccesly';
import type { SwapPathAsset } from '../types';

const ASSET_CODES = ['XLM', 'USDC', 'EURC'] as const;
type AssetCode = (typeof ASSET_CODES)[number];

interface SwapEstimate { destinationAmount: string; path: SwapPathAsset[]; }

interface SwapModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function SwapModal({ onClose, onSuccess }: SwapModalProps) {
  const { estimateSwap, swap } = useAccesly();

  const [fromAsset, setFromAsset] = useState<AssetCode>('XLM');
  const [toAsset, setToAsset]     = useState<AssetCode>('USDC');
  const [amount, setAmount]       = useState('');
  const [slippage, setSlippage]   = useState('1');

  const [estimate, setEstimate]           = useState<SwapEstimate | null>(null);
  const [estimating, setEstimating]       = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [swapping, setSwapping] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [txHash, setTxHash]     = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch estimate whenever from/to/amount changes (debounced 600ms)
  useEffect(() => {
    setEstimate(null);
    setEstimateError(null);

    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0 || fromAsset === toAsset) return;

    setEstimating(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await estimateSwap(fromAsset, toAsset, amount);
        setEstimate(data);
      } catch (err: any) {
        setEstimateError(err.message || 'Could not get estimate');
      } finally {
        setEstimating(false);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, fromAsset, toAsset]);

  function handleFlip() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setAmount('');
    setEstimate(null);
    setEstimateError(null);
  }

  // minReceive = estimated output * (1 - slippage%)
  function calcMinReceive(): string {
    if (!estimate) return '0.0000001';
    const minRaw = parseFloat(estimate.destinationAmount) * (1 - parseFloat(slippage || '1') / 100);
    return Math.max(minRaw, 0.0000001).toFixed(7);
  }

  async function handleSwap(e: React.FormEvent) {
    e.preventDefault();
    if (!estimate) return;
    setSwapping(true);
    setError(null);

    try {
      const result = await swap({
        fromAsset,
        toAsset,
        amount,
        minReceive: calcMinReceive(),
        path: estimate.path,
      });
      setTxHash(result.txHash);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Swap failed');
    } finally {
      setSwapping(false);
    }
  }

  // --- Success screen ---
  if (txHash) {
    return (
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.successIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 11 15 16 9" />
            </svg>
          </div>
          <h2 style={s.successTitle}>Swap Complete</h2>
          <p style={s.successHash}>{txHash.slice(0, 12)}...{txHash.slice(-12)}</p>
          <button onClick={onClose} style={s.primaryBtn}>Done</button>
        </div>
      </div>
    );
  }

  const toOptions   = ASSET_CODES.filter((c) => c !== fromAsset);
  const fromOptions = ASSET_CODES.filter((c) => c !== toAsset);
  const canSubmit   = !!estimate && !estimating && !swapping;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>Swap</h2>
          <button onClick={onClose} style={s.closeBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSwap} style={s.form}>
          {/* From */}
          <div style={s.group}>
            <label style={s.label}>From</label>
            <div style={s.row}>
              <select
                value={fromAsset}
                onChange={(e) => setFromAsset(e.target.value as AssetCode)}
                style={{ ...s.input, width: '130px', flexShrink: 0 }}
              >
                {fromOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="0.0000001"
                step="any"
                style={{ ...s.input, flex: 1 }}
              />
            </div>
          </div>

          {/* Flip button */}
          <div style={s.flipRow}>
            <button type="button" onClick={handleFlip} style={s.flipBtn} title="Flip assets">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>

          {/* To */}
          <div style={s.group}>
            <label style={s.label}>To</label>
            <select
              value={toAsset}
              onChange={(e) => setToAsset(e.target.value as AssetCode)}
              style={s.input}
            >
              {toOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Estimate result */}
          <div style={s.estimateBox}>
            {estimating && (
              <p style={s.estimateText}>Fetching rate...</p>
            )}
            {!estimating && estimate && (
              <>
                <p style={s.estimateAmount}>
                  ≈ {parseFloat(estimate.destinationAmount).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })} {toAsset}
                </p>
                <p style={s.estimateMin}>
                  Min received: {calcMinReceive()} {toAsset} (after {slippage}% slippage)
                </p>
              </>
            )}
            {!estimating && estimateError && (
              <p style={s.estimateError}>{estimateError}</p>
            )}
            {!estimating && !estimate && !estimateError && amount && (
              <p style={s.estimateText}>Enter an amount to see the rate</p>
            )}
          </div>

          {/* Slippage */}
          <div style={s.group}>
            <label style={s.label}>Max Slippage (%)</label>
            <input
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              min="0.1"
              max="50"
              step="0.1"
              style={s.input}
            />
          </div>

          {error && <p style={s.error}>{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{ ...s.primaryBtn, opacity: canSubmit ? 1 : 0.45 }}
          >
            {swapping ? 'Swapping...' : estimating ? 'Getting rate...' : `Swap ${fromAsset} → ${toAsset}`}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '1rem',
  },
  modal: {
    backgroundColor: '#141428',
    borderRadius: '16px',
    border: '1px solid #2a2a4a',
    padding: '1.75rem',
    width: '100%', maxWidth: '420px',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1.25rem',
  },
  title: { fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0', margin: 0 },
  closeBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' },
  form: { display: 'flex', flexDirection: 'column' as const, gap: '0.85rem' },
  group: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  label: { color: '#8b8ba7', fontSize: '0.78rem', fontWeight: 500 },
  row: { display: 'flex', gap: '0.5rem' },
  input: {
    backgroundColor: '#1a1a2e', border: '1px solid #2a2a4a',
    borderRadius: '8px', padding: '0.65rem 0.75rem',
    color: '#e2e8f0', fontSize: '0.9rem', outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
  },
  flipRow: { display: 'flex', justifyContent: 'center', margin: '-0.1rem 0' },
  flipBtn: {
    background: '#1a1a2e', border: '1px solid #2a2a4a',
    borderRadius: '50%', width: '34px', height: '34px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#667eea',
  },
  estimateBox: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    minHeight: '54px',
    display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', gap: '0.2rem',
  },
  estimateText: { color: '#64748b', fontSize: '0.82rem', margin: 0, textAlign: 'center' as const },
  estimateAmount: { color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 700, margin: 0 },
  estimateMin: { color: '#64748b', fontSize: '0.75rem', margin: 0 },
  estimateError: { color: '#f87171', fontSize: '0.82rem', margin: 0 },
  error: {
    color: '#f87171', fontSize: '0.85rem', margin: 0,
    padding: '0.45rem 0.65rem',
    backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: '6px',
  },
  primaryBtn: {
    backgroundColor: '#667eea', color: '#fff', border: 'none',
    borderRadius: '10px', padding: '0.8rem',
    fontSize: '1rem', fontWeight: 600, cursor: 'pointer', width: '100%',
  },
  successIcon: { display: 'flex', justifyContent: 'center', marginBottom: '1rem' },
  successTitle: {
    color: '#34d399', fontSize: '1.25rem', fontWeight: 600,
    textAlign: 'center' as const, margin: '0 0 0.5rem',
  },
  successHash: {
    color: '#64748b', fontSize: '0.8rem', fontFamily: 'monospace',
    textAlign: 'center' as const, marginBottom: '1.5rem',
  },
};
