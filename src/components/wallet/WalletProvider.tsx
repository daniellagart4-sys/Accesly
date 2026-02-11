/**
 * WalletProvider.tsx - Global wallet state context.
 *
 * Manages authentication (Supabase), wallet info, and balance.
 * Provides connect/disconnect and refresh functions to all children.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase-client';

export interface WalletInfo {
  contractId: string;
  publicKey: string;
  stellarAddress: string;
  email: string;
  emailHash: string;
  createdAt: string;
  recoverySigners?: Array<{ publicKey: string; createdAt: string }>;
}

interface WalletContextType {
  session: Session | null;
  wallet: WalletInfo | null;
  balance: string | null;
  loading: boolean;
  creating: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshWallet: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Auth state ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Load wallet when session appears ---
  useEffect(() => {
    if (session) {
      loadWallet(session);
    } else {
      setWallet(null);
      setBalance(null);
      setError(null);
    }
  }, [session]);

  // --- Auto-refresh balance every 15s ---
  useEffect(() => {
    if (!session || !wallet) return;
    fetchBalance(session);
    const interval = setInterval(() => fetchBalance(session), 15000);
    return () => clearInterval(interval);
  }, [session, wallet]);

  async function loadWallet(sess: Session) {
    setError(null);
    try {
      let res = await fetch('/api/wallet/info', {
        headers: { Authorization: `Bearer ${sess.access_token}` },
      });

      // First login - create wallet automatically
      if (res.status === 404) {
        setCreating(true);
        const createRes = await fetch('/api/wallet/create', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sess.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!createRes.ok && createRes.status !== 409) {
          const data = await createRes.json();
          setError(data.error || 'Failed to create wallet');
          setCreating(false);
          return;
        }

        // Re-fetch after creation
        res = await fetch('/api/wallet/info', {
          headers: { Authorization: `Bearer ${sess.access_token}` },
        });
        setCreating(false);
      }

      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to load wallet');
      }
    } catch {
      setCreating(false);
      setError('Network error. Please try again.');
    }
  }

  async function fetchBalance(sess: Session) {
    try {
      const res = await fetch('/api/wallet/balance', {
        headers: { Authorization: `Bearer ${sess.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const native = data.balances.find((b: any) => b.asset === 'native');
        setBalance(native?.balance || '0');
      }
    } catch {
      // Silently fail, keep previous balance
    }
  }

  const connect = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }, []);

  const disconnect = useCallback(async () => {
    await supabase.auth.signOut();
    setWallet(null);
    setBalance(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (session) await fetchBalance(session);
  }, [session]);

  const refreshWallet = useCallback(async () => {
    if (session) await loadWallet(session);
  }, [session]);

  return (
    <WalletContext.Provider
      value={{
        session,
        wallet,
        balance,
        loading,
        creating,
        error,
        connect,
        disconnect,
        refreshBalance,
        refreshWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
