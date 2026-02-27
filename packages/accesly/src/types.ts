/**
 * types.ts - Public TypeScript types for the Accesly SDK.
 */

/** Configuration for AcceslyProvider */
export interface AcceslyConfig {
  /** Your developer API key (starts with "acc_") */
  appId: string;
  /** Base URL of the Accesly backend. Defaults to https://accesly.vercel.app */
  baseUrl?: string;
  /** Stellar network. Defaults to "testnet" */
  network?: 'testnet' | 'mainnet';
  /** UI theme. Defaults to "dark" */
  theme?: 'dark' | 'light';
  /** Called when a wallet is connected */
  onConnect?: (wallet: WalletInfo) => void;
  /** Called when the wallet is disconnected */
  onDisconnect?: () => void;
}

/** Wallet information returned after connecting */
export interface WalletInfo {
  contractId: string;
  publicKey: string;
  stellarAddress: string;
  email: string;
  emailHash: string;
  createdAt: string;
  recoverySigners?: Array<{ publicKey: string; createdAt: string }>;
}

/** A single transaction record */
export interface TransactionRecord {
  id: string;
  type: 'sent' | 'received' | 'swap';
  amount: string;
  asset: string;
  counterparty: string;
  createdAt: string;
  // Populated only for type === 'swap'
  fromAmount?: string;
  fromAsset?: string;
}

/** Auth tokens received from the popup */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
}

/** A non-XLM asset balance on the wallet */
export interface AssetBalance {
  code: string;    // e.g. "USDC", "EURC"
  issuer: string;  // issuer Stellar address
  balance: string; // balance string
}

/** Parameters for sending a payment */
export interface SendPaymentParams {
  destination: string;
  amount: string;
  memo?: string;
  /** Asset code to send. Defaults to "XLM" if omitted. */
  assetCode?: string;
  /** Asset issuer address. Required when assetCode is not "XLM". */
  assetIssuer?: string;
}

/** Parameters for swapping assets via the Stellar DEX */
export interface SwapParams {
  /** Asset to sell: "XLM" | "USDC" | "EURC" */
  fromAsset: string;
  /** Asset to buy: "XLM" | "USDC" | "EURC" */
  toAsset: string;
  /** Exact amount to sell */
  amount: string;
  /** Minimum amount to receive (slippage protection) */
  minReceive: string;
}

/** Result from signing a transaction */
export interface SignResult {
  signedXdr: string;
  txHash?: string;
}

/** The public context provided by useAccesly hook */
export interface AcceslyContextType {
  /** Whether the initial auth check is in progress */
  loading: boolean;
  /** Whether a wallet is being created for a new user */
  creating: boolean;
  /** The connected wallet info, or null if not connected */
  wallet: WalletInfo | null;
  /** Current XLM balance string, or null */
  balance: string | null;
  /** Non-XLM asset balances (USDC, EURC, etc.) */
  assetBalances: AssetBalance[];
  /** Last error message, or null */
  error: string | null;
  /** Open the auth popup and connect */
  connect: () => Promise<void>;
  /** Disconnect and clear all state */
  disconnect: () => void;
  /** Send a payment (XLM, USDC, or EURC) */
  sendPayment: (params: SendPaymentParams) => Promise<{ txHash: string }>;
  /** Swap assets using the Stellar DEX */
  swap: (params: SwapParams) => Promise<{ txHash: string }>;
  /** Rotate wallet keys (generates new keypair, updates contract) */
  rotateKeys: () => Promise<{ newStellarAddress: string }>;
  /** Get transaction history */
  getTransactions: (limit?: number) => Promise<TransactionRecord[]>;
  /** Refresh the balance */
  refreshBalance: () => Promise<void>;
  /** Refresh wallet info */
  refreshWallet: () => Promise<void>;
  /** Sign a transaction XDR without submitting */
  signTransaction: (xdr: string) => Promise<SignResult>;
  /** Sign and submit a transaction XDR */
  signAndSubmit: (xdr: string) => Promise<SignResult>;
}
