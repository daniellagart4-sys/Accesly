import type {
  CognitoTokens,
  WalletInfo,
  TransactionRecord,
  SwapEstimate,
  SwapParams,
  SendPaymentParams,
  StoredSession,
} from './types';

const SESSION_KEY = 'accesly_session';
const DEFAULT_API_URL = 'https://7xteb2jknk.execute-api.us-east-1.amazonaws.com';

const HORIZON_URL: Record<'testnet' | 'mainnet', string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

export class AcceslyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AcceslyApiError';
    this.status = status;
  }
}

export class AcceslyClient {
  readonly appId: string;
  readonly apiUrl: string;
  readonly relayerUrl: string;
  readonly network: 'testnet' | 'mainnet';

  constructor(opts: {
    appId: string;
    apiUrl?: string;
    relayerUrl: string;
    network?: 'testnet' | 'mainnet';
  }) {
    this.appId    = opts.appId;
    this.apiUrl   = opts.apiUrl ?? DEFAULT_API_URL;
    this.relayerUrl = opts.relayerUrl;
    this.network  = opts.network ?? 'testnet';
  }

  // ---- Session storage ----

  saveSession(session: StoredSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  loadSession(): StoredSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as StoredSession; } catch { return null; }
  }

  clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  hasSession(): boolean {
    return this.loadSession() !== null;
  }

  // ---- HTTP helpers ----

  private async apiFetch<T>(
    path: string,
    options: RequestInit = {},
    retry = true
  ): Promise<T> {
    const session = this.loadSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-accesly-key': this.appId,
      ...(session ? { Authorization: `Bearer ${session.tokens.idToken}` } : {}),
    };

    const res = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });

    if (res.status === 401 && retry && session?.tokens.refreshToken) {
      const refreshed = await this.tryRefreshTokens(session.tokens);
      if (refreshed) return this.apiFetch<T>(path, options, false);
      this.clearSession();
      throw new AcceslyApiError('Session expired. Please reconnect.', 401);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = (data['error'] ?? data['message'] ?? `Request failed: ${res.status}`) as string;
      throw new AcceslyApiError(msg, res.status);
    }

    return res.json() as Promise<T>;
  }

  private async tryRefreshTokens(tokens: CognitoTokens): Promise<boolean> {
    try {
      const session = this.loadSession();
      if (!session) return false;
      // Cognito PKCE public client refresh — no client_secret
      const cognitoDomain = (session as StoredSession & { cognitoDomain?: string }).cognitoDomain;
      if (!cognitoDomain) return false;
      const res = await fetch(`https://${cognitoDomain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: session.tokens.accessToken, // stored clientId via session extension
          refresh_token: tokens.refreshToken,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json() as {
        access_token: string;
        id_token: string;
        expires_in: number;
      };
      this.saveSession({
        ...session,
        tokens: {
          ...tokens,
          accessToken: data.access_token,
          idToken: data.id_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  // ---- Wallet lifecycle ----

  async getWalletInfo(): Promise<{ wallet: WalletInfo }> {
    return this.apiFetch('/wallet/info');
  }

  /**
   * Create a new wallet. Called on first login after passkey registration.
   *
   * serverFragment: base64-encoded F2 (generated client-side, stored server-side encrypted by KMS)
   * emailFragment:  base64-encoded F1 XOR K_email — stored server-side for recovery
   * emailSalt:      base64-encoded random salt used in PBKDF2(email, salt) to derive K_email
   * stellarPublicKey: G... address derived from the reconstructed Ed25519 seed
   */
  async createWallet(params: {
    stellarPublicKey: string;
    serverFragment: string;
    emailFragment: string;
    emailSalt: string;
  }): Promise<{ wallet: WalletInfo }> {
    return this.apiFetch('/createWallet', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ---- Fragment 2 retrieval ----

  /**
   * Fetch F2 from the server.
   * The Lambda decrypts with KMS and returns the raw bytes (base64-encoded).
   * Requires a valid Cognito JWT in the Authorization header.
   */
  async getFragment2(): Promise<Uint8Array> {
    const res = await this.apiFetch<{ fragment: string }>('/getFragment2');
    return Uint8Array.from(atob(res.fragment), c => c.charCodeAt(0));
  }

  // ---- Balance & history via Stellar Horizon ----

  async getBalance(stellarAddress: string): Promise<{
    xlm: string;
    assets: Array<{ code: string; issuer: string; balance: string }>;
  }> {
    const url = `${HORIZON_URL[this.network]}/accounts/${stellarAddress}`;
    const res = await fetch(url);
    if (res.status === 404) return { xlm: '0', assets: [] };
    if (!res.ok) throw new AcceslyApiError('Failed to fetch balance from Horizon', res.status);

    const data = await res.json() as {
      balances: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>;
    };

    let xlm = '0';
    const assets: Array<{ code: string; issuer: string; balance: string }> = [];

    for (const b of data.balances ?? []) {
      if (b.asset_type === 'native') {
        xlm = b.balance;
      } else {
        assets.push({ code: b.asset_code!, issuer: b.asset_issuer!, balance: b.balance });
      }
    }

    return { xlm, assets };
  }

  async getAccountSequence(stellarAddress: string): Promise<string> {
    const url = `${HORIZON_URL[this.network]}/accounts/${stellarAddress}`;
    const res = await fetch(url);
    if (!res.ok) throw new AcceslyApiError('Failed to fetch account from Horizon', res.status);
    const data = await res.json() as { sequence: string };
    return data.sequence;
  }

  async getTransactions(stellarAddress: string, limit = 20): Promise<TransactionRecord[]> {
    const url = `${HORIZON_URL[this.network]}/accounts/${stellarAddress}/operations?limit=${limit}&order=desc`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { _embedded?: { records: unknown[] } };
    return (data._embedded?.records ?? []).map(op => parseHorizonOp(op as HorizonOp, stellarAddress));
  }

  // ---- DEX swap estimate via Stellar Horizon ----

  async estimateSwap(
    fromAsset: string,
    toAsset: string,
    amount: string,
    assetIssuers: Record<string, string> = {}
  ): Promise<SwapEstimate> {
    const horizon = HORIZON_URL[this.network];

    const params = new URLSearchParams({ source_amount: amount });

    if (fromAsset === 'XLM') {
      params.set('source_asset_type', 'native');
    } else {
      params.set('source_asset_type', 'credit_alphanum4');
      params.set('source_asset_code', fromAsset);
      params.set('source_asset_issuer', assetIssuers[fromAsset] ?? '');
    }

    if (toAsset === 'XLM') {
      params.set('destination_asset_type', 'native');
    } else {
      params.set('destination_asset_type', 'credit_alphanum4');
      params.set('destination_asset_code', toAsset);
      params.set('destination_asset_issuer', assetIssuers[toAsset] ?? '');
    }

    const res = await fetch(`${horizon}/paths/strict-send?${params}`);
    if (!res.ok) throw new AcceslyApiError('Swap estimate failed', res.status);

    const data = await res.json() as { _embedded?: { records: Array<{ destination_amount: string; path: SwapParams['path'] }> } };
    const best = data._embedded?.records?.[0];
    if (!best) throw new AcceslyApiError('No swap path found for this pair', 404);

    return { destinationAmount: best.destination_amount, path: best.path ?? [] };
  }

  // ---- Relay signed XDR to EC2 relayer ----

  async relaySignedXdr(signedXdr: string): Promise<{ txHash: string }> {
    const res = await fetch(`${this.relayerUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xdr: signedXdr }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new AcceslyApiError((data['error'] as string) ?? 'Relay failed', res.status);
    }
    return res.json() as Promise<{ txHash: string }>;
  }

  // ---- Key rotation (stub — requires backend support) ----

  async rotateKeys(): Promise<{ newStellarAddress: string }> {
    return this.apiFetch('/wallet/rotate', { method: 'POST' });
  }
}

// ---- Horizon response parsing ----

interface HorizonOp {
  id: string;
  type: string;
  created_at: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  from?: string;
  to?: string;
}

function parseHorizonOp(op: HorizonOp, myAddress: string): TransactionRecord {
  if (op.type === 'payment') {
    return {
      id: op.id,
      type: op.from === myAddress ? 'sent' : 'received',
      amount: op.amount ?? '0',
      asset: op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? 'UNKNOWN'),
      counterparty: op.from === myAddress ? (op.to ?? '') : (op.from ?? ''),
      createdAt: op.created_at,
    };
  }
  // Other operation types (create_account, etc.) shown as received
  return {
    id: op.id,
    type: 'received',
    amount: '0',
    asset: 'XLM',
    counterparty: '',
    createdAt: op.created_at,
  };
}
