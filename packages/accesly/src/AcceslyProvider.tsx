import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { AcceslyClient, AcceslyApiError } from './AcceslyClient';
import { openCognitoPopup, parseCognitoIdToken } from './auth';
import {
  registerPasskey,
  storeF1,
  loadF1,
  clearF1,
  hasWebAuthn,
} from './webauthn';
import {
  generateFragment,
  xorFragments,
  publicKeyFromFragments,
  signXdr,
  buildPaymentXdr,
  zeroBytes,
} from './mpc';
import type {
  AcceslyConfig,
  AcceslyContextType,
  WalletInfo,
  AssetBalance,
  TransactionRecord,
  SendPaymentParams,
  SwapParams,
  SwapEstimate,
  SignResult,
  StoredSession,
} from './types';

export const AcceslyContext = createContext<AcceslyContextType | null>(null);

const DEFAULT_API_URL = 'https://7xteb2jknk.execute-api.us-east-1.amazonaws.com';

export function AcceslyProvider({
  children,
  ...config
}: AcceslyConfig & { children: ReactNode }) {
  const apiUrl   = config.apiUrl   ?? DEFAULT_API_URL;
  const network  = config.network  ?? 'testnet';
  const callbackUrl = config.cognitoCallbackUrl
    ?? (typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : '');

  const client = useMemo(
    () =>
      new AcceslyClient({
        appId:      config.appId,
        apiUrl,
        relayerUrl: config.relayerUrl,
        network,
      }),
    [config.appId, apiUrl, config.relayerUrl, network]
  );

  const [wallet,       setWallet]       = useState<WalletInfo | null>(null);
  const [balance,      setBalance]      = useState<string | null>(null);
  const [assetBalances,setAssetBalances]= useState<AssetBalance[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // ---- Session restore on mount ----
  useEffect(() => {
    const session = client.loadSession();
    if (session) {
      restoreSession(session);
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // ---- Auto-refresh balance every 15s while connected ----
  useEffect(() => {
    if (!wallet) return;
    void fetchBalance(wallet.stellarAddress);
    const id = setInterval(() => void fetchBalance(wallet.stellarAddress), 15_000);
    return () => clearInterval(id);
  }, [wallet]);

  // ---- Helpers ----

  async function restoreSession(_session: StoredSession) {
    setError(null);
    try {
      const data = await client.getWalletInfo();
      setWallet(data.wallet);
      config.onConnect?.(data.wallet);
    } catch (err: unknown) {
      const e = err as AcceslyApiError;
      if (e instanceof AcceslyApiError && e.status === 401) {
        client.clearSession();
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchBalance(stellarAddress: string) {
    try {
      const { xlm, assets } = await client.getBalance(stellarAddress);
      setBalance(xlm);
      setAssetBalances(assets);
    } catch {
      // keep previous balance on transient Horizon errors
    }
  }

  /**
   * Reconstruct the secret from F1 (device) and F2 (server), sign the XDR,
   * then zero F1 and F2 from memory immediately.
   */
  async function mpcSign(xdrBase64: string): Promise<string> {
    const session = client.loadSession();
    if (!session) throw new Error('Not authenticated');

    const [f1, f2] = await Promise.all([
      loadF1(session.credentialId),
      client.getFragment2(),
    ]);

    try {
      return signXdr(xdrBase64, f1, f2, network);
    } finally {
      zeroBytes(f1);
      zeroBytes(f2);
    }
  }

  // ---- Public actions ----

  const connect = useCallback(async () => {
    setError(null);
    try {
      if (!hasWebAuthn()) {
        throw new Error('This device does not support passkeys (WebAuthn). Please use a compatible browser.');
      }

      // 1. Cognito Hosted UI login
      const tokens = await openCognitoPopup(
        config.cognitoDomain,
        config.cognitoClientId,
        callbackUrl
      );
      const { sub: userId, email } = parseCognitoIdToken(tokens.idToken);

      // Temporarily store tokens so apiFetch can use them while we create the wallet
      const tempSession: StoredSession = {
        tokens,
        userId,
        email,
        credentialId: '',        // filled in below
        stellarAddress: '',      // filled in below after wallet creation
      };
      client.saveSession(tempSession);

      setLoading(true);

      // 2. Check if wallet already exists
      try {
        const data = await client.getWalletInfo();
        // Existing user — wallet found on the server.
        // A returning user on the same device has a credentialId persisted under a
        // separate key (survives token expiry). If it's missing, they're on a new device
        // and need recovery to obtain F1.
        const storedCredentialId = localStorage.getItem('accesly_credential');
        if (!storedCredentialId) {
          client.clearSession();
          throw new Error(
            'Wallet found but no passkey on this device. Please use account recovery to sign in.'
          );
        }
        client.saveSession({
          tokens,
          userId,
          email,
          credentialId: storedCredentialId,
          stellarAddress: data.wallet.stellarAddress,
        });
        setWallet(data.wallet);
        config.onConnect?.(data.wallet);
        return;
      } catch (err: unknown) {
        const e = err as AcceslyApiError;
        if (!(e instanceof AcceslyApiError) || e.status !== 404) throw err;
      }

      // 3. New user — create wallet with MPC fragments
      setCreating(true);

      // Generate F2 (server fragment) and F1 = secret XOR F2 client-side
      const secret = generateFragment();   // 32-byte Ed25519 seed
      const f2     = generateFragment();   // server fragment
      const f1     = xorFragments(secret, f2);

      // Derive Stellar public key before zeroing secret
      const stellarPublicKey = publicKeyFromFragments(f1, f2);
      zeroBytes(secret);

      // Register passkey and store F1 on device
      const { credentialId } = await registerPasskey(userId, email);
      await storeF1(credentialId, f1);
      zeroBytes(f1);
      // Persist credentialId separately so it survives token expiry
      localStorage.setItem('accesly_credential', credentialId);

      // Derive email recovery fragment: F1_recovered = F1 XOR K_email
      // K_email = PBKDF2(email || salt, 100k iters) so server can't compute it
      const emailSaltBytes = generateFragment();
      const emailSalt = btoa(String.fromCharCode(...emailSaltBytes));
      // Compute recovery fragment = F1 XOR K_email so server stores it for later recovery.
      // We reload F1 from IndexedDB to get a fresh copy (the earlier f1 was zeroed).
      const f1ForRecovery = await loadF1(credentialId);
      const emailFragmentBytes = await deriveEmailFragment(f1ForRecovery, email, emailSaltBytes);
      zeroBytes(f1ForRecovery);
      const emailFragment = btoa(String.fromCharCode(...emailFragmentBytes));
      zeroBytes(emailSaltBytes);
      zeroBytes(emailFragmentBytes);

      // F2 → server (will be KMS-encrypted by Lambda)
      const serverFragment = btoa(String.fromCharCode(...f2));
      zeroBytes(f2);

      const { wallet: newWallet } = await client.createWallet({
        stellarPublicKey,
        serverFragment,
        emailFragment,
        emailSalt,
      });

      // Persist full session
      client.saveSession({
        tokens,
        userId,
        email,
        credentialId,
        stellarAddress: newWallet.stellarAddress,
      });

      setWallet(newWallet);
      config.onConnect?.(newWallet);
    } catch (err: unknown) {
      const e = err as Error;
      if (e.message !== 'Authentication cancelled') {
        setError(e.message);
      }
    } finally {
      setCreating(false);
      setLoading(false);
    }
  }, [client, config, callbackUrl, network]);

  const disconnect = useCallback(() => {
    const session = client.loadSession();
    if (session?.credentialId) {
      void clearF1(session.credentialId);
    }
    client.clearSession();
    setWallet(null);
    setBalance(null);
    setAssetBalances([]);
    setError(null);
    config.onDisconnect?.();
  }, [client, config]);

  const sendPayment = useCallback(
    async (params: SendPaymentParams): Promise<{ txHash: string }> => {
      const session = client.loadSession();
      if (!session?.stellarAddress) throw new Error('Wallet not connected');

      const sequence = await client.getAccountSequence(session.stellarAddress);

      const xdrBase64 = buildPaymentXdr({
        sourceAddress: session.stellarAddress,
        sequence,
        destination:  params.destination,
        amount:       params.amount,
        assetCode:    params.assetCode ?? 'XLM',
        assetIssuer:  params.assetIssuer,
        memo:         params.memo,
        network,
      });

      const signedXdr = await mpcSign(xdrBase64);
      return client.relaySignedXdr(signedXdr);
    },
    [client, network]
  );

  const estimateSwap = useCallback(
    (fromAsset: string, toAsset: string, amount: string): Promise<SwapEstimate> =>
      client.estimateSwap(fromAsset, toAsset, amount),
    [client]
  );

  const swap = useCallback(
    async (_params: SwapParams): Promise<{ txHash: string }> => {
      // TODO: build path-payment XDR using @stellar/stellar-base PathPaymentStrictSend op,
      // sign with mpcSign, then relay. Requires extending buildPaymentXdr to handle swap ops.
      throw new Error('swap: not yet implemented in SDK v1');
    },
    []
  );

  const rotateKeys = useCallback(async () => {
    return client.rotateKeys();
  }, [client]);

  const getTransactions = useCallback(
    async (limit = 20): Promise<TransactionRecord[]> => {
      const session = client.loadSession();
      if (!session?.stellarAddress) return [];
      return client.getTransactions(session.stellarAddress, limit);
    },
    [client]
  );

  const refreshBalance = useCallback(async () => {
    const session = client.loadSession();
    if (session?.stellarAddress) await fetchBalance(session.stellarAddress);
  }, [client]);

  const refreshWallet = useCallback(async () => {
    const session = client.loadSession();
    if (session) await restoreSession(session);
  }, [client]);

  const signTransaction = useCallback(
    async (xdr: string): Promise<SignResult> => {
      const signedXdr = await mpcSign(xdr);
      return { signedXdr };
    },
    [client, network]
  );

  const signAndSubmit = useCallback(
    async (xdr: string): Promise<SignResult> => {
      const signedXdr = await mpcSign(xdr);
      const { txHash } = await client.relaySignedXdr(signedXdr);
      return { signedXdr, txHash };
    },
    [client, network]
  );

  const contextValue: AcceslyContextType = {
    loading,
    creating,
    wallet,
    balance,
    assetBalances,
    error,
    connect,
    disconnect,
    sendPayment,
    estimateSwap,
    swap,
    rotateKeys,
    getTransactions,
    refreshBalance,
    refreshWallet,
    signTransaction,
    signAndSubmit,
  };

  return (
    <AcceslyContext.Provider value={contextValue}>
      {children}
    </AcceslyContext.Provider>
  );
}

// ---- Email recovery fragment derivation ----
// Computes K_email = PBKDF2(email, salt, 100k, SHA-256) then returns F1 XOR K_email.
// The server stores this; during recovery the user re-derives K_email from their email
// and XORs with what the server returns to recover F1.
async function deriveEmailFragment(
  f1: Uint8Array,
  email: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(email),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer, iterations: 100_000 },
    keyMaterial,
    256
  );
  const kEmail = new Uint8Array(bits);
  // Recovery fragment = F1 XOR K_email.
  // During recovery: user re-derives K_email from their email → XOR with server-stored fragment → F1.
  const result = new Uint8Array(f1.length);
  for (let i = 0; i < f1.length; i++) result[i] = f1[i] ^ kEmail[i];
  kEmail.fill(0);
  return result;
}
