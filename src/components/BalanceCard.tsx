/**
 * BalanceCard.tsx - Displays the wallet's XLM balance prominently.
 *
 * Shows:
 * - Large balance number
 * - "Send" and "Receive" action buttons
 * - Auto-refreshes balance periodically
 */

import { useState, useEffect, useCallback } from 'react';

interface BalanceCardProps {
  /** Supabase auth token for API calls */
  accessToken: string;
  /** Open the Send modal */
  onSend: () => void;
  /** Open the Receive modal */
  onReceive: () => void;
}

export function BalanceCard({ accessToken, onSend, onReceive }: BalanceCardProps) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch balance from the backend
  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/balance', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        // Find the native (XLM) balance
        const native = data.balances.find((b: any) => b.asset === 'native');
        setBalance(native?.balance || '0');
      }
    } catch {
      // Silently fail, keep previous balance
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchBalance();
    // Refresh balance every 15 seconds
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  // Format the balance: show max 2 decimal places for display
  const formattedBalance = balance
    ? parseFloat(balance).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '---';

  return (
    <div style={styles.card}>
      {/* Balance section */}
      <p style={styles.label}>Balance</p>
      <div style={styles.balanceRow}>
        <span style={styles.amount}>
          {loading ? '...' : formattedBalance}
        </span>
        <span style={styles.currency}>XLM</span>
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        <button onClick={onSend} style={styles.sendButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
          Send
        </button>
        <button onClick={onReceive} style={styles.receiveButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          Receive
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: '100%',
    background: 'linear-gradient(135deg, #1e1e3a 0%, #2a1a4a 50%, #1a2a4a 100%)',
    borderRadius: '16px',
    padding: '2rem 1.5rem',
    border: '1px solid #3a3a6a',
    textAlign: 'center',
  },
  label: {
    color: '#8b8ba7',
    fontSize: '0.85rem',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: 0,
  },
  balanceRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '0.5rem',
    margin: '0.5rem 0 1.5rem',
  },
  amount: {
    fontSize: '2.75rem',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.02em',
  },
  currency: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#8b8ba7',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
  },
  sendButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.7rem 1.75rem',
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  receiveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.7rem 1.75rem',
    backgroundColor: 'transparent',
    color: '#a5b4fc',
    border: '1.5px solid #4a4a7a',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
