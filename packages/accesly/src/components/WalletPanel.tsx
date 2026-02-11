/**
 * WalletPanel.tsx - SDK wallet panel modal with tabs.
 *
 * Opened by clicking the connected pill.
 * Tabs: Wallet (send/receive), Activity (transactions),
 *       Account (details), Security (recovery + disconnect).
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccesly } from '../hooks/useAccesly';
import type { TransactionRecord, SendPaymentParams } from '../types';

type Tab = 'wallet' | 'activity' | 'account' | 'security';

interface WalletPanelProps {
  onClose: () => void;
}

export function WalletPanel({ onClose }: WalletPanelProps) {
  const { wallet, balance, disconnect, sendPayment, refreshBalance } = useAccesly();
  const [activeTab, setActiveTab] = useState<Tab>('wallet');

  // Send form state
  const [sendDest, setSendDest] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendMemo, setSendMemo] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Activity state
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Lazy-load transactions when Activity tab is selected
  useEffect(() => {
    if (activeTab === 'activity' && transactions.length === 0) {
      loadTransactions();
    }
  }, [activeTab]);

  if (!wallet) return null;

  async function loadTransactions() {
    setTxLoading(true);
    try {
      // Use the AcceslyClient indirectly through the parent context
      // For SDK, we fetch directly since we have the client
      const res = await fetch('/api/wallet/transactions?limit=20');
      // Note: This won't work cross-origin. In the SDK, transactions
      // are loaded via the AcceslyClient. For now, we'll show placeholder.
      // TODO: Expose getTransactions through context
    } catch {
      // Silently fail
    } finally {
      setTxLoading(false);
    }
  }

  async function handleSend() {
    if (!sendDest || !sendAmount) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendPayment({
        destination: sendDest,
        amount: sendAmount,
        memo: sendMemo || undefined,
      });
      setSendResult(result.txHash);
      refreshBalance();
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
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

  function handleDisconnect() {
    disconnect();
    onClose();
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={onClose} style={styles.closeBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div style={{ ...styles.identicon, backgroundColor: idColor }} />
          <p style={styles.headerAddr}>{truncate(wallet.stellarAddress, 8, 8)}</p>
          <p style={styles.headerBalance}>
            {formattedBalance} <span style={styles.headerCurrency}>XLM</span>
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
  );

  // --- Tab renderers ---

  function renderWalletTab() {
    // Send success state
    if (sendResult) {
      return (
        <div style={styles.centeredCol}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="8 12 11 15 16 9" />
          </svg>
          <p style={{ color: '#34d399', fontWeight: 600, margin: '0.5rem 0' }}>Payment Sent</p>
          <p style={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {sendResult.slice(0, 12)}...{sendResult.slice(-12)}
          </p>
          <button onClick={() => { setSendResult(null); setSendDest(''); setSendAmount(''); setSendMemo(''); }} style={styles.primaryBtn}>
            Done
          </button>
        </div>
      );
    }

    return (
      <div style={styles.walletTab}>
        {/* Send form */}
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Destination</label>
          <input
            type="text"
            placeholder="G..."
            value={sendDest}
            onChange={(e) => setSendDest(e.target.value)}
            maxLength={56}
            style={styles.formInput}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Amount (XLM)</label>
          <input
            type="number"
            placeholder="0.00"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            min="0.0000001"
            step="any"
            style={styles.formInput}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Memo (optional)</label>
          <input
            type="text"
            placeholder="What is this for?"
            value={sendMemo}
            onChange={(e) => setSendMemo(e.target.value)}
            maxLength={28}
            style={styles.formInput}
          />
        </div>
        {sendError && <p style={styles.error}>{sendError}</p>}
        <button
          onClick={handleSend}
          disabled={sending || !sendDest || !sendAmount}
          style={{
            ...styles.primaryBtn,
            opacity: sending || !sendDest || !sendAmount ? 0.5 : 1,
          }}
        >
          {sending ? 'Sending...' : 'Send Payment'}
        </button>

        {/* Copy address for receiving */}
        <button
          onClick={() => copyToClipboard(wallet!.stellarAddress, 'receive')}
          style={styles.receiveBtn}
        >
          {copiedField === 'receive' ? 'Address Copied!' : 'Copy Address to Receive'}
        </button>
      </div>
    );
  }

  function renderActivityTab() {
    return (
      <p style={styles.emptyText}>
        Transaction history coming soon.
      </p>
    );
  }

  function renderAccountTab() {
    const fields = [
      { label: 'Email', value: wallet!.email, key: 'email' },
      { label: 'Contract ID', value: wallet!.contractId, key: 'contract', copy: true },
      { label: 'Stellar Address', value: wallet!.stellarAddress, key: 'stellar', copy: true },
      { label: 'Public Key', value: wallet!.publicKey, key: 'pubkey', copy: true },
      { label: 'Created', value: new Date(wallet!.createdAt).toLocaleDateString(), key: 'created' },
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
                  color: copiedField === f.key ? '#34d399' : '#a5b4fc',
                  borderColor: copiedField === f.key ? '#34d399' : '#2a2a4a',
                }}
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
        <div style={styles.fieldList}>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Recovery</span>
            <span style={{ ...styles.fieldValue, color: '#34d399' }}>Protected</span>
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Method</span>
            <span style={styles.fieldValue}>Google ({wallet!.email})</span>
          </div>
        </div>
        <button onClick={handleDisconnect} style={styles.disconnectBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    overflow: 'hidden',
  },
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
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1rem 1.25rem 1.25rem',
  },
  // Wallet tab
  walletTab: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.3rem',
  },
  formLabel: {
    color: '#8b8ba7',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  formInput: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '0.65rem 0.75rem',
    color: '#e2e8f0',
    fontSize: '0.9rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  primaryBtn: {
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '0.75rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: '0.25rem',
  },
  receiveBtn: {
    backgroundColor: 'transparent',
    color: '#a5b4fc',
    border: '1.5px solid #4a4a7a',
    borderRadius: '10px',
    padding: '0.65rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  error: {
    color: '#f87171',
    fontSize: '0.8rem',
    margin: 0,
    padding: '0.4rem 0.6rem',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderRadius: '6px',
  },
  centeredCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 0',
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
  emptyText: {
    color: '#64748b',
    fontSize: '0.85rem',
    textAlign: 'center' as const,
    padding: '2rem 0',
  },
};
