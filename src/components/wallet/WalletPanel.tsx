/**
 * WalletPanel.tsx - Main wallet modal with tabbed interface.
 *
 * Opened by clicking the connected pill in ConnectButton.
 * Tabs:
 * - Wallet: Balance overview + Send/Receive actions
 * - Activity: Transaction history
 * - Account: Wallet details (contract ID, addresses, email)
 * - Security: Recovery status + key rotation + disconnect
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from './WalletProvider';
import { SendModal } from '../SendModal';
import { ReceiveModal } from '../ReceiveModal';
import { RotateKeysModal } from '../RotateKeysModal';

type Tab = 'wallet' | 'activity' | 'account' | 'security';

interface WalletPanelProps {
  onClose: () => void;
}

interface TransactionRecord {
  id: string;
  type: 'sent' | 'received';
  amount: string;
  asset: string;
  counterparty: string;
  createdAt: string;
}

export function WalletPanel({ onClose }: WalletPanelProps) {
  const { session, wallet, balance, disconnect, refreshBalance, refreshWallet } =
    useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('wallet');

  // Sub-modal states
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showRotate, setShowRotate] = useState(false);

  // Activity tab state
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const accessToken = session?.access_token || '';

  const fetchTransactions = useCallback(async () => {
    if (!accessToken) return;
    setTxLoading(true);
    try {
      const res = await fetch('/api/wallet/transactions?limit=20', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
      }
    } catch {
      // Silently fail
    } finally {
      setTxLoading(false);
    }
  }, [accessToken]);

  // Fetch transactions when Activity tab is selected
  useEffect(() => {
    if (activeTab === 'activity') {
      fetchTransactions();
    }
  }, [activeTab, refreshTrigger, fetchTransactions]);

  // Early return after all hooks
  if (!session || !wallet) return null;

  function handlePaymentSuccess() {
    setRefreshTrigger((prev) => prev + 1);
    refreshBalance();
  }

  function handleRotateSuccess() {
    refreshWallet();
    setRefreshTrigger((prev) => prev + 1);
  }

  async function handleDisconnect() {
    await disconnect();
    onClose();
  }

  function truncate(addr: string, start = 6, end = 6): string {
    if (addr.length <= start + end + 3) return addr;
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
  }

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  function relativeTime(isoDate: string): string {
    const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    return `${Math.floor(diff / 86400)}d ago`;
  }

  const formattedBalance = balance
    ? parseFloat(balance).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '---';

  const idColor = identiconColor(wallet.stellarAddress);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'wallet', label: 'Wallet' },
    { key: 'activity', label: 'Activity' },
    { key: 'account', label: 'Account' },
    { key: 'security', label: 'Security' },
  ];

  return (
    <>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <button onClick={onClose} style={styles.closeBtn}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div style={{ ...styles.identicon, backgroundColor: idColor }} />
            <p style={styles.headerAddr}>
              {truncate(wallet.stellarAddress, 8, 8)}
            </p>
            <p style={styles.headerBalance}>
              {formattedBalance}{' '}
              <span style={styles.headerCurrency}>XLM</span>
            </p>
          </div>

          {/* Tab bar */}
          <div style={styles.tabBar}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab.key ? styles.tabActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={styles.content}>
            {activeTab === 'wallet' && renderWalletTab()}
            {activeTab === 'activity' && renderActivityTab()}
            {activeTab === 'account' && renderAccountTab()}
            {activeTab === 'security' && renderSecurityTab()}
          </div>
        </div>
      </div>

      {/* Sub-modals (rendered outside the panel overlay for z-index) */}
      {showSend && (
        <SendModal
          accessToken={accessToken}
          onClose={() => setShowSend(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
      {showReceive && (
        <ReceiveModal
          stellarAddress={wallet.stellarAddress}
          onClose={() => setShowReceive(false)}
        />
      )}
      {showRotate && (
        <RotateKeysModal
          accessToken={accessToken}
          onClose={() => setShowRotate(false)}
          onSuccess={handleRotateSuccess}
        />
      )}
    </>
  );

  // --- Tab renderers ---

  function renderWalletTab() {
    return (
      <div style={styles.walletTab}>
        <div style={styles.actionRow}>
          <button onClick={() => setShowSend(true)} style={styles.actionBtn}>
            <div style={styles.actionIcon}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </div>
            <span style={styles.actionLabel}>Send</span>
          </button>
          <button
            onClick={() => setShowReceive(true)}
            style={styles.actionBtn}
          >
            <div style={{ ...styles.actionIcon, ...styles.actionIconReceive }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>
            <span style={styles.actionLabel}>Receive</span>
          </button>
        </div>
      </div>
    );
  }

  function renderActivityTab() {
    if (txLoading && transactions.length === 0) {
      return <p style={styles.emptyText}>Loading transactions...</p>;
    }

    if (transactions.length === 0) {
      return <p style={styles.emptyText}>No transactions yet</p>;
    }

    return (
      <div style={styles.txList}>
        {transactions.map((tx) => (
          <div key={tx.id} style={styles.txRow}>
            <div
              style={{
                ...styles.txIcon,
                backgroundColor:
                  tx.type === 'received'
                    ? 'rgba(52, 211, 153, 0.15)'
                    : 'rgba(248, 113, 113, 0.15)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={tx.type === 'received' ? '#34d399' : '#f87171'}
                strokeWidth="2.5"
              >
                {tx.type === 'received' ? (
                  <>
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </>
                ) : (
                  <>
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </>
                )}
              </svg>
            </div>

            <div style={styles.txDetails}>
              <span style={styles.txType}>
                {tx.type === 'received' ? 'Received' : 'Sent'}
              </span>
              <span style={styles.txCounterparty}>
                {tx.type === 'received' ? 'from ' : 'to '}
                {truncate(tx.counterparty)}
              </span>
            </div>

            <div style={styles.txAmountCol}>
              <span
                style={{
                  ...styles.txAmount,
                  color: tx.type === 'received' ? '#34d399' : '#f87171',
                }}
              >
                {tx.type === 'received' ? '+' : '-'}
                {parseFloat(tx.amount).toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}{' '}
                {tx.asset}
              </span>
              <span style={styles.txTime}>{relativeTime(tx.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderAccountTab() {
    const fields = [
      { label: 'Email', value: wallet!.email, key: 'email' },
      { label: 'Contract ID', value: wallet!.contractId, key: 'contract', copy: true },
      {
        label: 'Stellar Address',
        value: wallet!.stellarAddress,
        key: 'stellar',
        copy: true,
      },
      { label: 'Public Key', value: wallet!.publicKey, key: 'pubkey', copy: true },
      {
        label: 'Created',
        value: new Date(wallet!.createdAt).toLocaleDateString(),
        key: 'created',
      },
    ];

    return (
      <div style={styles.fieldList}>
        {fields.map((f) => (
          <div key={f.key} style={styles.field}>
            <span style={styles.fieldLabel}>{f.label}</span>
            {f.copy ? (
              <button
                onClick={() => copyToClipboard(f.value, f.key)}
                style={{
                  ...styles.copyBtn,
                  borderColor: copiedField === f.key ? '#34d399' : '#2a2a4a',
                  color: copiedField === f.key ? '#34d399' : '#a5b4fc',
                }}
                title="Copy"
              >
                {copiedField === f.key ? 'Copied!' : truncate(f.value, 8, 8)}
              </button>
            ) : (
              <span style={styles.fieldValue}>{f.value}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderSecurityTab() {
    return (
      <div style={styles.securityTab}>
        {/* Recovery status */}
        <div style={styles.fieldList}>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Recovery</span>
            <span style={{ ...styles.fieldValue, color: '#34d399' }}>
              Protected
            </span>
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Method</span>
            <span style={styles.fieldValue}>Google ({wallet!.email})</span>
          </div>
          {wallet!.recoverySigners && wallet!.recoverySigners.length > 0 && (
            <div style={styles.field}>
              <span style={styles.fieldLabel}>Signer</span>
              <span style={styles.fieldValue}>
                {truncate(wallet!.recoverySigners[0].publicKey)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <button onClick={() => setShowRotate(true)} style={styles.rotateBtn}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Rotate Keys
        </button>

        <button onClick={handleDisconnect} style={styles.disconnectBtn}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Disconnect
        </button>
      </div>
    );
  }
}

function identiconColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  // Overlay
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
    animation: 'fadeIn 0.2s ease-out',
  },
  panel: {
    backgroundColor: '#0f0f1e',
    borderRadius: '20px',
    border: '1px solid #2a2a4a',
    width: '100%',
    maxWidth: '420px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    animation: 'slideUp 0.3s ease-out',
    overflow: 'hidden',
  },

  // Header
  header: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '1.5rem 1.5rem 1rem',
    background: 'linear-gradient(180deg, #1a1a3a 0%, #0f0f1e 100%)',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px',
  },
  identicon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    marginBottom: '0.5rem',
  },
  headerAddr: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#8b8ba7',
    margin: '0 0 0.25rem',
  },
  headerBalance: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  },
  headerCurrency: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#8b8ba7',
  },

  // Tab bar
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #2a2a4a',
    padding: '0 0.5rem',
  },
  tab: {
    flex: 1,
    padding: '0.75rem 0.5rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#64748b',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'color 0.2s, border-color 0.2s',
    borderRadius: 0,
  },
  tabActive: {
    color: '#e2e8f0',
    borderBottomColor: '#667eea',
  },

  // Content
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1rem 1.25rem 1.25rem',
  },

  // Wallet tab
  walletTab: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  actionRow: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
  },
  actionBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1.25rem 1.5rem',
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    flex: 1,
  },
  actionIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: 'rgba(102, 126, 234, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#667eea',
  },
  actionIconReceive: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    color: '#34d399',
  },
  actionLabel: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#e2e8f0',
  },

  // Activity tab
  txList: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  txRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem 0',
    borderBottom: '1px solid #1a1a2e',
  },
  txIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minWidth: 0,
  },
  txType: {
    color: '#e2e8f0',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  txCounterparty: {
    color: '#64748b',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  txAmountCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  txAmount: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  txTime: {
    color: '#64748b',
    fontSize: '0.65rem',
  },
  emptyText: {
    color: '#64748b',
    fontSize: '0.85rem',
    textAlign: 'center' as const,
    padding: '2rem 0',
  },

  // Account tab
  fieldList: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.6rem 0',
    borderBottom: '1px solid #1a1a2e',
  },
  fieldLabel: {
    color: '#8b8ba7',
    fontSize: '0.8rem',
  },
  fieldValue: {
    color: '#e2e8f0',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  copyBtn: {
    background: 'none',
    border: '1px solid #2a2a4a',
    color: '#a5b4fc',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.72rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'color 0.2s, border-color 0.2s',
  },

  // Security tab
  securityTab: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  rotateBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.65rem',
    backgroundColor: 'transparent',
    color: '#f59e0b',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '10px',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  disconnectBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.65rem',
    backgroundColor: 'transparent',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    borderRadius: '10px',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
