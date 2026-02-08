/**
 * TransactionHistory.tsx - Displays recent wallet transactions.
 *
 * Shows a list of sent/received payments with:
 * - Direction icon (arrow up for sent, arrow down for received)
 * - Amount and asset
 * - Counterparty address (truncated)
 * - Relative time
 */

import { useState, useEffect, useCallback } from 'react';
import type { TransactionRecord } from '../services/stellar';

interface TransactionHistoryProps {
  accessToken: string;
  /** Incremented to trigger a refresh (e.g., after sending a payment) */
  refreshTrigger: number;
}

export function TransactionHistory({ accessToken, refreshTrigger }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
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
      setLoading(false);
    }
  }, [accessToken]);

  // Fetch on mount and when refreshTrigger changes
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, refreshTrigger]);

  /**
   * Format a date to a relative time string (e.g., "2h ago", "yesterday").
   */
  function relativeTime(isoDate: string): string {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffSeconds = Math.floor((now - then) / 1000);

    if (diffSeconds < 60) return 'just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 172800) return 'yesterday';
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  }

  /** Truncate an address for display */
  function truncate(address: string): string {
    if (address.length <= 16) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  }

  if (loading) {
    return (
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>History</h3>
        <p style={styles.emptyText}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>History</h3>

      {transactions.length === 0 ? (
        <p style={styles.emptyText}>No transactions yet</p>
      ) : (
        <div style={styles.list}>
          {transactions.map((tx) => (
            <div key={tx.id} style={styles.row}>
              {/* Direction icon */}
              <div
                style={{
                  ...styles.iconCircle,
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

              {/* Details */}
              <div style={styles.details}>
                <span style={styles.txType}>
                  {tx.type === 'received' ? 'Received' : 'Sent'}
                </span>
                <span style={styles.counterparty}>
                  {tx.type === 'received' ? 'from ' : 'to '}
                  {truncate(tx.counterparty)}
                </span>
              </div>

              {/* Amount and time */}
              <div style={styles.amountCol}>
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
                <span style={styles.time}>{relativeTime(tx.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem 0',
    borderBottom: '1px solid #2a2a4a',
  },
  iconCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  details: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minWidth: 0,
  },
  txType: {
    color: '#e2e8f0',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  counterparty: {
    color: '#64748b',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  amountCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  txAmount: {
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  time: {
    color: '#64748b',
    fontSize: '0.7rem',
  },
  emptyText: {
    color: '#64748b',
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    padding: '1.5rem 0',
  },
};
