/**
 * WalletPanel.tsx - SDK wallet panel modal with tabs.
 *
 * Opened by clicking the connected pill. Mirrors the main app's UI:
 * - Wallet tab: Send and Receive buttons (open sub-views)
 * - Activity tab: Real transaction history via getTransactions
 * - Account tab: Wallet details with copy buttons
 * - Security tab: Recovery info, Rotate Keys, Disconnect
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccesly } from '../hooks/useAccesly';
import type { TransactionRecord } from '../types';

type Tab = 'wallet' | 'activity' | 'account' | 'security';
type WalletView = 'main' | 'send' | 'receive' | 'swap';

const SWAP_ASSETS = ['XLM', 'USDC', 'EURC'] as const;
type SwapAsset = (typeof SWAP_ASSETS)[number];

interface WalletPanelProps {
  onClose: () => void;
}

export function WalletPanel({ onClose }: WalletPanelProps) {
  const {
    wallet,
    balance,
    disconnect,
    sendPayment,
    swap,
    rotateKeys,
    getTransactions,
    refreshBalance,
    refreshWallet,
  } = useAccesly();

  const [activeTab, setActiveTab] = useState<Tab>('wallet');
  const [walletView, setWalletView] = useState<WalletView>('main');

  // Send form state
  const [sendDest, setSendDest] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendMemo, setSendMemo] = useState('');
  const [sendAsset, setSendAsset] = useState('XLM');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Swap form state
  const [swapFrom, setSwapFrom] = useState<SwapAsset>('USDC');
  const [swapTo, setSwapTo] = useState<SwapAsset>('EURC');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapSlippage, setSwapSlippage] = useState('1');
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Activity state
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Security state
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  // Clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Reload transactions every time Activity tab is opened or refreshTrigger changes.
  // Also auto-refresh every 15s while the tab is active (catches incoming payments).
  useEffect(() => {
    if (activeTab !== 'activity') return;
    loadTransactions();
    const interval = setInterval(loadTransactions, 15000);
    return () => clearInterval(interval);
  }, [activeTab, refreshTrigger]);

  if (!wallet) return null;

  async function loadTransactions() {
    setTxLoading(true);
    try {
      const txs = await getTransactions(20);
      setTransactions(txs);
    } catch {
      // Silently fail, keep empty list
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
        assetCode: sendAsset !== 'XLM' ? sendAsset : undefined,
      });
      setSendResult(result.txHash);
      refreshBalance();
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  function resetSendForm() {
    setSendResult(null);
    setSendDest('');
    setSendAmount('');
    setSendMemo('');
    setSendError(null);
    setWalletView('main');
  }

  async function handleSwap() {
    if (!swapAmount) return;
    setSwapping(true);
    setSwapError(null);
    try {
      const minReceive = (
        parseFloat(swapAmount) * (1 - parseFloat(swapSlippage) / 100)
      ).toFixed(7);
      const result = await swap({
        fromAsset: swapFrom,
        toAsset: swapTo,
        amount: swapAmount,
        minReceive,
      });
      setSwapResult(result.txHash);
      refreshBalance();
    } catch (err: any) {
      setSwapError(err.message);
    } finally {
      setSwapping(false);
    }
  }

  function resetSwapForm() {
    setSwapResult(null);
    setSwapAmount('');
    setSwapError(null);
    setWalletView('main');
  }

  async function handleRotateKeys() {
    if (!confirm('This will generate a new keypair and update your contract. Continue?')) return;
    setRotating(true);
    setRotateError(null);
    try {
      await rotateKeys();
      await refreshWallet();
    } catch (err: any) {
      setRotateError(err.message);
    } finally {
      setRotating(false);
    }
  }

  function handleDisconnect() {
    disconnect();
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
              onClick={() => { setActiveTab(tab.key); setWalletView('main'); }}
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

  // ---------------------------------------------------------------------------
  // Tab renderers
  // ---------------------------------------------------------------------------

  function renderWalletTab() {
    // Send success screen
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
          <button onClick={resetSendForm} style={styles.primaryBtn}>Done</button>
        </div>
      );
    }

    // Send form sub-view
    if (walletView === 'send') {
      return (
        <div style={styles.subView}>
          <button onClick={() => setWalletView('main')} style={styles.backBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
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
            <label style={styles.formLabel}>Asset</label>
            <select
              value={sendAsset}
              onChange={(e) => setSendAsset(e.target.value)}
              style={styles.formInput}
            >
              <option value="XLM">XLM — Stellar Lumens</option>
              <option value="USDC">USDC — USD Coin</option>
              <option value="EURC">EURC — Euro Coin</option>
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Amount ({sendAsset})</label>
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
        </div>
      );
    }

    // Receive sub-view
    if (walletView === 'receive') {
      return (
        <div style={styles.subView}>
          <button onClick={() => setWalletView('main')} style={styles.backBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <div style={styles.centeredCol}>
            <div style={styles.receiveIconBig}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>
            <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem', margin: 0 }}>
              Receive XLM
            </p>
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0, textAlign: 'center' as const }}>
              Share your Stellar address to receive payments
            </p>
            <div style={styles.addressBox}>
              <span style={styles.addressText}>{wallet!.stellarAddress}</span>
            </div>
            <button
              onClick={() => copyToClipboard(wallet!.stellarAddress, 'receive')}
              style={styles.primaryBtn}
            >
              {copiedField === 'receive' ? 'Copied!' : 'Copy Address'}
            </button>
          </div>
        </div>
      );
    }

    // Swap sub-view
    if (walletView === 'swap') {
      if (swapResult) {
        return (
          <div style={styles.centeredCol}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 11 15 16 9" />
            </svg>
            <p style={{ color: '#34d399', fontWeight: 600, margin: '0.5rem 0' }}>Swap Complete</p>
            <p style={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              {swapResult.slice(0, 12)}...{swapResult.slice(-12)}
            </p>
            <button onClick={resetSwapForm} style={styles.primaryBtn}>Done</button>
          </div>
        );
      }
      const toOptions = SWAP_ASSETS.filter((c) => c !== swapFrom);
      return (
        <div style={styles.subView}>
          <button onClick={() => setWalletView('main')} style={styles.backBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>From</label>
            <select
              value={swapFrom}
              onChange={(e) => {
                const next = e.target.value as SwapAsset;
                setSwapFrom(next);
                if (next === swapTo) setSwapTo(SWAP_ASSETS.find((c) => c !== next)!);
              }}
              style={styles.formInput}
            >
              {SWAP_ASSETS.filter((c) => c !== swapTo).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Amount</label>
            <input
              type="number"
              placeholder="0.00"
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
              min="0.0000001"
              step="any"
              style={styles.formInput}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>To</label>
            <select
              value={swapTo}
              onChange={(e) => setSwapTo(e.target.value as SwapAsset)}
              style={styles.formInput}
            >
              {toOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Max Slippage (%)</label>
            <input
              type="number"
              placeholder="1"
              value={swapSlippage}
              onChange={(e) => setSwapSlippage(e.target.value)}
              min="0.01"
              max="50"
              step="0.1"
              style={styles.formInput}
            />
          </div>
          {swapError && <p style={styles.error}>{swapError}</p>}
          <button
            onClick={handleSwap}
            disabled={swapping || !swapAmount}
            style={{ ...styles.primaryBtn, opacity: swapping || !swapAmount ? 0.5 : 1 }}
          >
            {swapping ? 'Swapping...' : `Swap ${swapFrom} → ${swapTo}`}
          </button>
        </div>
      );
    }

    // Main wallet view — Send, Receive, Swap buttons
    return (
      <div style={styles.walletTab}>
        <div style={styles.actionRow}>
          <button onClick={() => setWalletView('send')} style={styles.actionBtn}>
            <div style={styles.actionIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </div>
            <span style={styles.actionLabel}>Send</span>
          </button>
          <button onClick={() => setWalletView('receive')} style={styles.actionBtn}>
            <div style={{ ...styles.actionIcon, ...styles.actionIconReceive }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>
            <span style={styles.actionLabel}>Receive</span>
          </button>
          <button onClick={() => setWalletView('swap')} style={styles.actionBtn}>
            <div style={{ ...styles.actionIcon, ...styles.actionIconSwap }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>
            <span style={styles.actionLabel}>Swap</span>
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
        {/* Recovery status */}
        <div style={styles.fieldList}>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Recovery</span>
            <span style={{ ...styles.fieldValue, color: '#34d399' }}>Protected</span>
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

        {/* Rotate Keys */}
        {rotateError && <p style={styles.error}>{rotateError}</p>}
        <button
          onClick={handleRotateKeys}
          disabled={rotating}
          style={{
            ...styles.rotateBtn,
            opacity: rotating ? 0.5 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          {rotating ? 'Rotating...' : 'Rotate Keys'}
        </button>

        {/* Disconnect */}
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

/** Generate a deterministic HSL color from a Stellar address */
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
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: 'transparent',
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

  // Wallet tab — action buttons
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
  actionIconSwap: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    color: '#fbbf24',
  },
  actionLabel: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#e2e8f0',
  },

  // Sub-views (send/receive forms)
  subView: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: 'none',
    border: 'none',
    color: '#8b8ba7',
    fontSize: '0.8rem',
    cursor: 'pointer',
    padding: '0 0 0.25rem',
    width: 'fit-content',
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

  // Receive view
  receiveIconBig: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.25rem',
  },
  addressBox: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '0.75rem',
    width: '100%',
    marginTop: '0.5rem',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    color: '#a5b4fc',
    wordBreak: 'break-all' as const,
    lineHeight: 1.5,
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
