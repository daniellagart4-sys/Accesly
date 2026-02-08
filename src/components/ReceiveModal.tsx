/**
 * ReceiveModal.tsx - Shows the wallet address for receiving funds.
 *
 * Displays the full Stellar address with a copy button.
 */

import { useState } from 'react';

interface ReceiveModalProps {
  stellarAddress: string;
  onClose: () => void;
}

export function ReceiveModal({ stellarAddress, onClose }: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(stellarAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Receive XLM</h2>
          <button onClick={onClose} style={styles.closeButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p style={styles.description}>
          Share your Stellar address to receive XLM or other tokens
        </p>

        {/* Address display */}
        <div style={styles.addressBox}>
          <p style={styles.address}>{stellarAddress}</p>
        </div>

        {/* Copy button */}
        <button onClick={handleCopy} style={styles.copyButton}>
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Address
            </>
          )}
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
    maxWidth: '420px',
    textAlign: 'center' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
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
  description: {
    color: '#8b8ba7',
    fontSize: '0.9rem',
    marginBottom: '1.25rem',
  },
  addressBox: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '10px',
    padding: '1rem',
    marginBottom: '1.25rem',
  },
  address: {
    color: '#a5b4fc',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    wordBreak: 'break-all' as const,
    lineHeight: 1.6,
    margin: 0,
  },
  copyButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.8rem',
    backgroundColor: 'transparent',
    color: '#a5b4fc',
    border: '1.5px solid #4a4a7a',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
