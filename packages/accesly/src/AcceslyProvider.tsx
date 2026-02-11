/**
 * AcceslyProvider.tsx - Main SDK provider component.
 *
 * Wraps the application and provides wallet state to all children.
 * Handles auth token management, wallet loading, and balance refresh.
 *
 * Usage:
 *   <AcceslyProvider appId="acc_xxxxx">
 *     <App />
 *   </AcceslyProvider>
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { AcceslyClient, AcceslyApiError } from './AcceslyClient';
import { openAuthPopup } from './auth';
import type {
  AcceslyConfig,
  AcceslyContextType,
  WalletInfo,
  TransactionRecord,
  SendPaymentParams,
} from './types';

/** Internal context - use the useAccesly hook to access it */
export const AcceslyContext = createContext<AcceslyContextType | null>(null);

const DEFAULT_BASE_URL = 'https://accesly.vercel.app';

export function AcceslyProvider({
  children,
  ...config
}: AcceslyConfig & { children: ReactNode }) {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  // Create a stable client instance
  const client = useMemo(
    () => new AcceslyClient(config.appId, baseUrl),
    [config.appId, baseUrl]
  );

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Check for existing session on mount ---
  useEffect(() => {
    if (client.hasSession()) {
      loadWallet();
    } else {
      setLoading(false);
    }
  }, [client]);

  // --- Auto-refresh balance every 15s when connected ---
  useEffect(() => {
    if (!wallet) return;
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [wallet]);

  /** Load wallet info from the backend. Creates wallet if first login. */
  async function loadWallet() {
    setError(null);
    try {
      const data = await client.getWalletInfo();
      setWallet(data.wallet);
      config.onConnect?.(data.wallet);
    } catch (err: any) {
      // If 404, user has no wallet yet — create one (first login)
      if (err instanceof AcceslyApiError && err.status === 404) {
        await createWallet();
        return;
      }
      // If session expired, clear tokens and let user reconnect
      if (err instanceof AcceslyApiError && err.status === 401) {
        client.clearTokens();
        setWallet(null);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /** Create a new wallet for the user */
  async function createWallet() {
    setCreating(true);
    setError(null);
    try {
      await client.createWallet();
      // Fetch the full wallet info after creation
      const data = await client.getWalletInfo();
      setWallet(data.wallet);
      config.onConnect?.(data.wallet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
      setLoading(false);
    }
  }

  /** Fetch current XLM balance */
  async function fetchBalance() {
    try {
      const data = await client.getBalance();
      const native = data.balances.find((b) => b.asset === 'native');
      setBalance(native?.balance || '0');
    } catch {
      // Silently fail, keep previous balance
    }
  }

  /** Open auth popup, get tokens, load wallet */
  const connect = useCallback(async () => {
    setError(null);
    try {
      const tokens = await openAuthPopup(baseUrl, config.appId);
      client.setTokens(tokens);
      setLoading(true);
      await loadWallet();
    } catch (err: any) {
      if (err.message !== 'Authentication cancelled') {
        setError(err.message);
      }
    }
  }, [baseUrl, config.appId, client]);

  /** Disconnect: clear tokens and state */
  const disconnect = useCallback(() => {
    client.clearTokens();
    setWallet(null);
    setBalance(null);
    setError(null);
    config.onDisconnect?.();
  }, [client, config.onDisconnect]);

  /** Send a payment */
  const sendPayment = useCallback(
    async (params: SendPaymentParams) => {
      return client.sendPayment(params);
    },
    [client]
  );

  /** Rotate wallet keys */
  const rotateKeys = useCallback(async () => {
    return client.rotateKeys();
  }, [client]);

  /** Get transaction history */
  const getTransactions = useCallback(
    async (limit = 20) => {
      const data = await client.getTransactions(limit);
      return data.transactions;
    },
    [client]
  );

  /** Refresh balance on demand */
  const refreshBalance = useCallback(async () => {
    await fetchBalance();
  }, [client]);

  /** Refresh wallet info on demand */
  const refreshWallet = useCallback(async () => {
    await loadWallet();
  }, [client]);

  const contextValue: AcceslyContextType = {
    loading,
    creating,
    wallet,
    balance,
    error,
    connect,
    disconnect,
    sendPayment,
    rotateKeys,
    getTransactions,
    refreshBalance,
    refreshWallet,
  };

  return (
    <AcceslyContext.Provider value={contextValue}>
      {children}
    </AcceslyContext.Provider>
  );
}
