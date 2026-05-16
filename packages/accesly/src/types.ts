// ---- Auth ----

/** Tokens returned by Cognito after OAuth2 code exchange */
export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch
}

/** Persisted session stored in localStorage after successful auth */
export interface StoredSession {
  tokens: CognitoTokens;
  credentialId: string;   // base64 WebAuthn credential ID for F1 retrieval
  userId: string;         // Cognito sub
  email: string;
  stellarAddress: string; // G... address of the smart account
}

// ---- Config ----

/** Configuration passed to <AcceslyProvider> */
export interface AcceslyConfig {
  /** Developer app ID (issued by Accesly, e.g. "acc_xxxxx") */
  appId: string;
  /** Cognito User Pool Client ID */
  cognitoClientId: string;
  /**
   * Cognito Hosted UI domain.
   * Example: "accesly.auth.us-east-1.amazoncognito.com"
   */
  cognitoDomain: string;
  /**
   * Full URL of your /auth/callback page that calls exchangeCognitoCode().
   * Defaults to window.location.origin + '/auth/callback'
   */
  cognitoCallbackUrl?: string;
  /**
   * Accesly relayer base URL.
   * Example: "https://relayer.accesly.xyz"
   */
  relayerUrl: string;
  /** Accesly API Gateway base URL. Defaults to the deployed endpoint. */
  apiUrl?: string;
  /** Stellar network. Defaults to "testnet". */
  network?: 'testnet' | 'mainnet';
  /** UI theme. Defaults to "dark". */
  theme?: 'dark' | 'light';
  /** Called when a wallet is connected. */
  onConnect?: (wallet: WalletInfo) => void;
  /** Called when the wallet is disconnected. */
  onDisconnect?: () => void;
}

// ---- Wallet ----

/** Wallet info returned after connecting */
export interface WalletInfo {
  contractId: string;
  publicKey: string;       // Ed25519 public key (Stellar G... address)
  stellarAddress: string;
  email: string;
  createdAt: string;
  recoverySigners?: Array<{ publicKey: string; createdAt: string }>;
}

// ---- Transactions ----

export interface TransactionRecord {
  id: string;
  type: 'sent' | 'received' | 'swap';
  amount: string;
  asset: string;
  counterparty: string;
  createdAt: string;
  fromAmount?: string;
  fromAsset?: string;
}

export interface AssetBalance {
  code: string;
  issuer: string;
  balance: string;
}

export interface SendPaymentParams {
  destination: string;
  amount: string;
  memo?: string;
  assetCode?: string;    // Defaults to "XLM"
  assetIssuer?: string;  // Required when assetCode is not "XLM"
}

export interface SwapPathAsset {
  code: string;
  issuer: string | null;
}

export interface SwapEstimate {
  destinationAmount: string;
  path: SwapPathAsset[];
}

export interface SwapParams {
  fromAsset: string;
  toAsset: string;
  amount: string;
  minReceive: string;
  path?: SwapPathAsset[];
}

export interface SignResult {
  signedXdr: string;
  txHash?: string;
}

// ---- Context ----

export interface AcceslyContextType {
  loading: boolean;
  creating: boolean;
  wallet: WalletInfo | null;
  balance: string | null;
  assetBalances: AssetBalance[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendPayment: (params: SendPaymentParams) => Promise<{ txHash: string }>;
  estimateSwap: (fromAsset: string, toAsset: string, amount: string) => Promise<SwapEstimate>;
  swap: (params: SwapParams) => Promise<{ txHash: string }>;
  rotateKeys: () => Promise<{ newStellarAddress: string }>;
  getTransactions: (limit?: number) => Promise<TransactionRecord[]>;
  refreshBalance: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<SignResult>;
  signAndSubmit: (xdr: string) => Promise<SignResult>;
}
