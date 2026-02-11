/**
 * ConnectButton.tsx - SDK drop-in wallet button.
 *
 * Renders a dynamic button that:
 * - Shows "Connect Wallet" when disconnected → opens ConnectModal
 * - Shows a pill with address + balance when connected → opens WalletPanel
 * - Handles loading/creating states with spinners
 *
 * Usage:
 *   <ConnectButton />
 */

import { useState } from 'react';
import { useAccesly } from '../hooks/useAccesly';
import { ConnectModal } from './ConnectModal';
import { WalletPanel } from './WalletPanel';

export function ConnectButton() {
  const { wallet, balance, loading, creating, connect } = useAccesly();
  const [showModal, setShowModal] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  // Initial auth check
  if (loading) {
    return (
      <div style={styles.pillLoading}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // Not connected
  if (!wallet) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          style={creating ? styles.pill : styles.connectBtn}
          disabled={creating}
        >
          {creating ? (
            <>
              <div style={styles.spinnerSmall} />
              <span style={styles.pillText}>Creating wallet...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2.5" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
              Connect Wallet
            </>
          )}
        </button>

        {showModal && (
          <ConnectModal
            onClose={() => setShowModal(false)}
            onConnect={async () => {
              setShowModal(false);
              await connect();
            }}
          />
        )}
      </>
    );
  }

  // Connected - show pill
  const addr = wallet.stellarAddress;
  const truncated = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  const balanceText = balance
    ? `${parseFloat(balance).toFixed(2)} XLM`
    : '--- XLM';
  const color = identiconColor(addr);

  return (
    <>
      <button onClick={() => setShowPanel(true)} style={styles.pill}>
        <div style={{ ...styles.identicon, backgroundColor: color }} />
        <span style={styles.pillAddr}>{truncated}</span>
        <span style={styles.divider} />
        <span style={styles.pillBalance}>{balanceText}</span>
      </button>

      {showPanel && <WalletPanel onClose={() => setShowPanel(false)} />}
    </>
  );
}

/** Generate a deterministic HSL color from a Stellar address */
function identiconColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

// ---------------------------------------------------------------------------
// Inline styles (zero CSS dependencies)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  connectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.85rem 1.75rem',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.85rem',
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '50px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    color: '#e2e8f0',
    fontSize: '0.85rem',
    fontWeight: 500,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  pillLoading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 1.5rem',
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '50px',
    height: '42px',
  },
  identicon: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  pillAddr: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#e2e8f0',
  },
  divider: {
    width: '1px',
    height: '16px',
    backgroundColor: '#3a3a5a',
  },
  pillBalance: {
    fontSize: '0.8rem',
    color: '#8b8ba7',
    fontWeight: 500,
  },
  pillText: {
    fontSize: '0.8rem',
    color: '#8b8ba7',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid #2a2a4a',
    borderTop: '2px solid #667eea',
    borderRadius: '50%',
    animation: 'accesly-spin 1s linear infinite',
  },
  spinnerSmall: {
    width: '16px',
    height: '16px',
    border: '2px solid #2a2a4a',
    borderTop: '2px solid #667eea',
    borderRadius: '50%',
    animation: 'accesly-spin 1s linear infinite',
    flexShrink: 0,
  },
};
