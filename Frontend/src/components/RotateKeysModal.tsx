/**
 * RotateKeysModal.tsx - Confirmation modal for key rotation.
 *
 * Security measure: requires the user to type "rotate" to confirm.
 * Shows warnings about what happens during rotation:
 * - New keypair generated
 * - On-chain ownership rotated
 * - Stellar address changes
 * - Old address funds are NOT auto-transferred
 */

import { useState } from 'react';

interface RotateKeysModalProps {
  accessToken: string;
  onClose: () => void;
  /** Called after successful rotation to refresh dashboard */
  onSuccess: () => void;
}

export function RotateKeysModal({ accessToken, onClose, onSuccess }: RotateKeysModalProps) {
  const [confirmation, setConfirmation] = useState('');
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ newAddress: string } | null>(null);

  const isConfirmed = confirmation.toLowerCase().trim() === 'rotate';

  async function handleRotate() {
    setRotating(true);
    setError(null);

    try {
      const res = await fetch('/api/wallet/rotate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess({ newAddress: data.newStellarAddress });
        onSuccess();
      } else {
        setError(data.details || data.error || 'Rotation failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setRotating(false);
    }
  }

  // --- Success state ---
  if (success) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.successIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 11 15 16 9" />
            </svg>
          </div>
          <h2 style={styles.successTitle}>Keys Rotated</h2>
          <p style={styles.successText}>
            Your wallet keys have been rotated successfully. Your new Stellar address is:
          </p>
          <div style={styles.addressBox}>
            <p style={styles.address}>{success.newAddress}</p>
          </div>
          <p style={styles.warningNote}>
            Your old address still exists on-chain but is no longer controlled by this wallet.
            Transfer any remaining funds from your old address.
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
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Rotate Keys</h2>
          <button onClick={onClose} style={styles.closeButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Warning icon */}
        <div style={styles.warningIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        {/* Warnings */}
        <div style={styles.warningBox}>
          <p style={styles.warningTitle}>This action will:</p>
          <ul style={styles.warningList}>
            <li>Generate a new keypair for your wallet</li>
            <li>Rotate ownership on the smart contract</li>
            <li>Change your Stellar address</li>
            <li>Re-split keys across AWS, local, and Google Cloud</li>
          </ul>
          <p style={styles.warningCritical}>
            Funds on your current address will NOT be transferred automatically.
            This action cannot be undone.
          </p>
        </div>

        {/* Confirmation input */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            Type <span style={styles.keyword}>rotate</span> to confirm
          </label>
          <input
            type="text"
            placeholder="rotate"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            style={styles.input}
            autoComplete="off"
          />
        </div>

        {/* Error message */}
        {error && <p style={styles.error}>{error}</p>}

        {/* Confirm button */}
        <button
          onClick={handleRotate}
          disabled={!isConfirmed || rotating}
          style={{
            ...styles.dangerButton,
            opacity: !isConfirmed || rotating ? 0.4 : 1,
            cursor: !isConfirmed || rotating ? 'not-allowed' : 'pointer',
          }}
        >
          {rotating ? 'Rotating keys...' : 'Confirm Rotation'}
        </button>
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
    maxWidth: '440px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
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
  warningIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
  },
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: '10px',
    padding: '1rem',
    marginBottom: '1.25rem',
  },
  warningTitle: {
    color: '#f59e0b',
    fontSize: '0.9rem',
    fontWeight: 600,
    margin: '0 0 0.5rem',
  },
  warningList: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    margin: '0 0 0.75rem',
    paddingLeft: '1.25rem',
    lineHeight: 1.7,
  },
  warningCritical: {
    color: '#f87171',
    fontSize: '0.8rem',
    fontWeight: 600,
    margin: 0,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    marginBottom: '1rem',
  },
  label: {
    color: '#8b8ba7',
    fontSize: '0.85rem',
  },
  keyword: {
    color: '#f59e0b',
    fontWeight: 700,
    fontFamily: 'monospace',
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
    margin: '0 0 1rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderRadius: '6px',
  },
  dangerButton: {
    width: '100%',
    padding: '0.8rem',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 600,
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
  successText: {
    color: '#94a3b8',
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    marginBottom: '1rem',
  },
  addressBox: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '10px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  address: {
    color: '#a5b4fc',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    wordBreak: 'break-all' as const,
    lineHeight: 1.6,
    margin: 0,
  },
  warningNote: {
    color: '#f59e0b',
    fontSize: '0.8rem',
    textAlign: 'center' as const,
    marginBottom: '1.25rem',
  },
  primaryButton: {
    width: '100%',
    padding: '0.8rem',
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
