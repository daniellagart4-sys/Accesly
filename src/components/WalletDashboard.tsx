/**
 * WalletDashboard.tsx - Main wallet interface after login.
 *
 * Layout (top to bottom):
 * 1. Balance card with Send/Receive buttons
 * 2. Transaction history
 * 3. Account details (contract ID, addresses, recovery status)
 * 4. Sign out
 *
 * Also handles automatic wallet creation if user has no wallet yet.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase-client';
import type { Session } from '@supabase/supabase-js';
import { BalanceCard } from './BalanceCard';
import { SendModal } from './SendModal';
import { ReceiveModal } from './ReceiveModal';
import { TransactionHistory } from './TransactionHistory';
import { RotateKeysModal } from './RotateKeysModal';

interface WalletInfo {
  contractId: string;
  publicKey: string;
  stellarAddress: string;
  email: string;
  emailHash: string;
  createdAt: string;
  recoverySigners?: Array<{ publicKey: string; createdAt: string }>;
}

interface WalletDashboardProps {
  session: Session;
}

export function WalletDashboard({ session }: WalletDashboardProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showRotateKeys, setShowRotateKeys] = useState(false);

  // Incremented to trigger refresh in child components after a tx
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchWalletInfo();
  }, []);

  async function fetchWalletInfo() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet/info', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet);
      } else if (res.status === 404) {
        await createWallet();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to fetch wallet info');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function createWallet() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok || res.status === 409) {
        await fetchWalletInfo();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create wallet');
      }
    } catch {
      setError('Network error during wallet creation.');
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function truncate(addr: string): string {
    if (addr.length <= 20) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  /** Called after a successful payment */
  function handlePaymentSuccess() {
    setRefreshTrigger((prev) => prev + 1);
  }

  // --- Loading state ---
  if (loading || creating) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>
          {creating ? 'Creating your wallet on Stellar...' : 'Loading...'}
        </p>
        {creating && (
          <p style={styles.hint}>
            This may take a few seconds (deploying smart contract)
          </p>
        )}
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div style={styles.container}>
        <h2 style={styles.errorTitle}>Something went wrong</h2>
        <p style={styles.errorMessage}>{error}</p>
        <div style={styles.errorActions}>
          <button onClick={fetchWalletInfo} style={styles.retryButton}>Try Again</button>
          <button onClick={handleLogout} style={styles.logoutButtonSmall}>Sign Out</button>
        </div>
      </div>
    );
  }

  if (!wallet) return null;

  return (
    <div style={styles.container}>
      {/* Balance + Send/Receive */}
      <BalanceCard
        accessToken={session.access_token}
        onSend={() => setShowSend(true)}
        onReceive={() => setShowReceive(true)}
      />

      {/* Transaction history */}
      <TransactionHistory
        accessToken={session.access_token}
        refreshTrigger={refreshTrigger}
      />

      {/* Account details */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Account</h3>
        <div style={styles.field}>
          <span style={styles.label}>Email</span>
          <span style={styles.value}>{wallet.email}</span>
        </div>
        <div style={styles.field}>
          <span style={styles.label}>Contract ID</span>
          <button onClick={() => copyToClipboard(wallet.contractId)} style={styles.copyBtn} title="Copy">
            {truncate(wallet.contractId)}
          </button>
        </div>
        <div style={styles.field}>
          <span style={styles.label}>Stellar Address</span>
          <button onClick={() => copyToClipboard(wallet.stellarAddress)} style={styles.copyBtn} title="Copy">
            {truncate(wallet.stellarAddress)}
          </button>
        </div>
        <div style={styles.field}>
          <span style={styles.label}>Public Key</span>
          <button onClick={() => copyToClipboard(wallet.publicKey)} style={styles.copyBtn} title="Copy">
            {truncate(wallet.publicKey)}
          </button>
        </div>
        <div style={styles.field}>
          <span style={styles.label}>Created</span>
          <span style={styles.value}>{new Date(wallet.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Recovery status */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Recovery (SEP-30)</h3>
        <div style={styles.field}>
          <span style={styles.label}>Status</span>
          <span style={{ ...styles.value, color: '#34d399' }}>Protected</span>
        </div>
        <div style={styles.field}>
          <span style={styles.label}>Method</span>
          <span style={styles.value}>Google ({wallet.email})</span>
        </div>
        {wallet.recoverySigners && wallet.recoverySigners.length > 0 && (
          <div style={styles.field}>
            <span style={styles.label}>Signer</span>
            <span style={styles.value}>{truncate(wallet.recoverySigners[0].publicKey)}</span>
          </div>
        )}
        <button
          onClick={() => setShowRotateKeys(true)}
          style={styles.rotateButton}
        >
          Rotate Keys
        </button>
      </div>

      {/* Sign out */}
      <button onClick={handleLogout} style={styles.logoutButton}>
        Sign Out
      </button>

      {/* Modals */}
      {showSend && (
        <SendModal
          accessToken={session.access_token}
          onClose={() => setShowSend(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
      {showReceive && wallet && (
        <ReceiveModal
          stellarAddress={wallet.stellarAddress}
          onClose={() => setShowReceive(false)}
        />
      )}
      {showRotateKeys && (
        <RotateKeysModal
          accessToken={session.access_token}
          onClose={() => setShowRotateKeys(false)}
          onSuccess={() => {
            fetchWalletInfo();
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    width: '100%',
    maxWidth: '480px',
  },
  card: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid #2a2a4a',
  },
  cardTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#8b8ba7',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #2a2a4a',
  },
  label: {
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  value: {
    color: '#e2e8f0',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  copyBtn: {
    background: 'none',
    border: '1px solid #3a3a5a',
    color: '#a5b4fc',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  logoutButton: {
    background: 'transparent',
    border: '1px solid #475569',
    color: '#94a3b8',
    padding: '0.6rem 1.5rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  logoutButtonSmall: {
    background: 'transparent',
    border: '1px solid #475569',
    color: '#94a3b8',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  retryButton: {
    backgroundColor: '#667eea',
    color: '#fff',
    padding: '0.65rem 1.5rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    border: 'none',
    cursor: 'pointer',
  },
  errorActions: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  errorTitle: {
    color: '#f87171',
    fontSize: '1.25rem',
  },
  errorMessage: {
    color: '#94a3b8',
    textAlign: 'center' as const,
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #2a2a4a',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '1rem',
  },
  hint: {
    color: '#64748b',
    fontSize: '0.85rem',
  },
  rotateButton: {
    width: '100%',
    marginTop: '0.75rem',
    padding: '0.6rem',
    backgroundColor: 'transparent',
    color: '#f59e0b',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
