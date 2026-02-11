/**
 * App.tsx - Main application component.
 *
 * Uses WalletProvider for global state and renders:
 * - Landing page with ConnectButton (when disconnected)
 * - Connected state with wallet pill (when authenticated)
 * - ConnectModal and WalletPanel overlays
 */

import { useState } from 'react';
import { WalletProvider, useWallet } from './wallet/WalletProvider';
import { ConnectButton } from './wallet/ConnectButton';
import { ConnectModal } from './wallet/ConnectModal';
import { WalletPanel } from './wallet/WalletPanel';

function AppContent() {
  const { session, wallet, loading, creating, error } = useWallet();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showWalletPanel, setShowWalletPanel] = useState(false);

  // Initial loading
  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // Not connected - landing page
  if (!session) {
    return (
      <div style={styles.landing}>
        <h1 style={styles.title}>Accesly</h1>
        <p style={styles.subtitle}>
          Your Web3 wallet, powered by account abstraction
        </p>

        <ConnectButton
          onConnectClick={() => setShowConnectModal(true)}
          onPillClick={() => {}}
        />

        <p style={styles.footer}>
          A Stellar wallet will be created automatically for you
        </p>

        {showConnectModal && (
          <ConnectModal onClose={() => setShowConnectModal(false)} />
        )}
      </div>
    );
  }

  // Connected state
  return (
    <div style={styles.connected}>
      <h1 style={styles.connectedLogo}>Accesly</h1>

      <ConnectButton
        onConnectClick={() => {}}
        onPillClick={() => setShowWalletPanel(true)}
      />

      {/* Creating wallet status */}
      {creating && (
        <div style={styles.statusBox}>
          <div style={styles.spinnerSmall} />
          <p style={styles.statusText}>Creating your wallet on Stellar...</p>
          <p style={styles.statusHint}>
            Deploying smart contract, this may take a moment
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Hint when ready */}
      {!creating && !error && wallet && (
        <p style={styles.connectedHint}>Tap your wallet to get started</p>
      )}

      {showWalletPanel && (
        <WalletPanel onClose={() => setShowWalletPanel(false)} />
      )}
    </div>
  );
}

export function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #2a2a4a',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  // Landing page
  landing: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1.25rem',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '2.75rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1.05rem',
    maxWidth: '320px',
    lineHeight: 1.5,
    margin: 0,
  },
  footer: {
    color: '#475569',
    fontSize: '0.8rem',
    marginTop: '0.5rem',
  },

  // Connected state
  connected: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
    textAlign: 'center' as const,
  },
  connectedLogo: {
    fontSize: '1.5rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: '0 0 0.5rem',
  },
  connectedHint: {
    color: '#475569',
    fontSize: '0.8rem',
    margin: 0,
  },
  statusBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  spinnerSmall: {
    width: '24px',
    height: '24px',
    border: '2px solid #2a2a4a',
    borderTop: '2px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  statusText: {
    color: '#94a3b8',
    fontSize: '0.9rem',
    margin: 0,
  },
  statusHint: {
    color: '#475569',
    fontSize: '0.8rem',
    margin: 0,
  },
  errorBox: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    marginTop: '0.5rem',
  },
  errorText: {
    color: '#f87171',
    fontSize: '0.85rem',
    margin: 0,
  },
};
