/**
 * AcceslyClient.ts - HTTP client for the Accesly backend API.
 *
 * Handles:
 * - All wallet API calls (balance, send, create, etc.)
 * - Automatic token refresh on 401 responses
 * - API key injection in every request
 */

import type { WalletInfo, TransactionRecord, SendPaymentParams, AuthTokens } from './types';

const STORAGE_KEY = 'accesly_auth';
const DEFAULT_BASE_URL = 'https://accesly.vercel.app';

export class AcceslyClient {
  private baseUrl: string;
  private appId: string;

  constructor(appId: string, baseUrl?: string) {
    this.appId = appId;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  // ---------------------------------------------------------------------------
  // Token management (stored in localStorage)
  // ---------------------------------------------------------------------------

  /** Save auth tokens to localStorage */
  setTokens(tokens: AuthTokens): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  /** Get stored auth tokens */
  getTokens(): AuthTokens | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      return null;
    }
  }

  /** Clear stored auth tokens */
  clearTokens(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Check if we have a stored session */
  hasSession(): boolean {
    return this.getTokens() !== null;
  }

  // ---------------------------------------------------------------------------
  // HTTP layer
  // ---------------------------------------------------------------------------

  /**
   * Make an authenticated request to the Accesly API.
   * Automatically adds the API key and auth token.
   * Retries once with a refreshed token on 401.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {},
    retry = true
  ): Promise<T> {
    const tokens = this.getTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-accesly-key': this.appId,
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    // If unauthorized, try to refresh the token once
    if (res.status === 401 && retry && tokens?.refreshToken) {
      const refreshed = await this.refreshToken(tokens.refreshToken);
      if (refreshed) {
        return this.request<T>(path, options, false);
      }
      // Refresh failed - clear tokens
      this.clearTokens();
      throw new Error('Session expired. Please reconnect.');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.details || `Request failed: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  /** Refresh the access token using the refresh token */
  private async refreshToken(refreshToken: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      const tokens = this.getTokens();
      if (tokens) {
        this.setTokens({
          ...tokens,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Wallet API methods
  // ---------------------------------------------------------------------------

  /** Get wallet info for the authenticated user */
  async getWalletInfo(): Promise<{ wallet: WalletInfo }> {
    return this.request('/api/wallet/info');
  }

  /** Create a new wallet for the authenticated user */
  async createWallet(): Promise<{ wallet: WalletInfo }> {
    return this.request('/api/wallet/create', { method: 'POST' });
  }

  /** Get the wallet's balance */
  async getBalance(): Promise<{ balances: Array<{ asset: string; balance: string }> }> {
    return this.request('/api/wallet/balance');
  }

  /** Send a payment */
  async sendPayment(params: SendPaymentParams): Promise<{ txHash: string }> {
    return this.request('/api/wallet/send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /** Get transaction history */
  async getTransactions(limit = 20): Promise<{ transactions: TransactionRecord[] }> {
    return this.request(`/api/wallet/transactions?limit=${limit}`);
  }

  /** Rotate wallet keys */
  async rotateKeys(): Promise<{ newStellarAddress: string }> {
    return this.request('/api/wallet/rotate', { method: 'POST' });
  }
}
