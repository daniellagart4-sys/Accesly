/**
 * SendModal.tsx - Modal form for sending XLM to another wallet.
 *
 * Fields:
 * - Destination address (G...)
 * - Amount (XLM)
 * - Memo (optional)
 *
 * Calls POST /api/wallet/send and shows success/error feedback.
 */

import { useState } from 'react';

interface SendModalProps {
  accessToken: string;
  onClose: () => void;
  /** Called after a successful payment to refresh balance/history */
  onSuccess: () => void;
}

export function SendModal({ accessToken, onClose, onSuccess }: SendModalProps) {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destination, amount, memo: memo || undefined }),
      });

      const data = await res.json();

      if (res.ok) {
        setTxHash(data.txHash);
        onSuccess();
      } else {
        setError(data.details || data.error || 'Payment failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // Success state
  if (txHash) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.successIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 11 15 16 9" />
            </svg>
          </div>
          <h2 style={styles.successTitle}>Payment Sent</h2>
          <p style={styles.successHash}>
            {txHash.slice(0, 12)}...{txHash.slice(-12)}
          </p>
          <button onClick={onClose} style={styles.primaryButton}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Send XLM</h2>
          <button onClick={onClose} style={styles.closeButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSend} style={styles.form}>
          {/* Destination */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Destination Address</label>
            <input
              type="text"
              placeholder="G..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
              maxLength={56}
              style={styles.input}
            />
          </div>

          {/* Amount */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Amount (XLM)</label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="0.0000001"
              step="any"
              style={styles.input}
            />
          </div>

          {/* Memo */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Memo (optional)</label>
            <input
              type="text"
              placeholder="What is this for?"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={28}
              style={styles.input}
            />
          </div>

          {/* Error message */}
          {error && <p style={styles.error}>{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={sending || !destination || !amount}
            style={{
              ...styles.primaryButton,
              opacity: sending || !destination || !amount ? 0.5 : 1,
            }}
          >
            {sending ? 'Sending...' : 'Send Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    backgroundColor: '#141428',
    borderRadius: '16px',
    border: '1px solid #2a2a4a',
    padding: '1.75rem',
    width: '100%',
    maxWidth: '420px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#e2e8f0',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
  },
  label: {
    color: '#8b8ba7',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  input: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '0.7rem 0.85rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: '#f87171',
    fontSize: '0.85rem',
    margin: 0,
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderRadius: '6px',
  },
  primaryButton: {
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '0.8rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.5rem',
    width: '100%',
  },
  successIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
  },
  successTitle: {
    color: '#34d399',
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center' as const,
    margin: '0 0 0.5rem',
  },
  successHash: {
    color: '#64748b',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    textAlign: 'center' as const,
    marginBottom: '1.5rem',
  },
};
