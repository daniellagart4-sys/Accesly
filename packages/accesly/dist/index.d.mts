import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

/**
 * types.ts - Public TypeScript types for the Accesly SDK.
 */
/** Configuration for AcceslyProvider */
interface AcceslyConfig {
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
interface WalletInfo {
    contractId: string;
    publicKey: string;
    stellarAddress: string;
    email: string;
    emailHash: string;
    createdAt: string;
    recoverySigners?: Array<{
        publicKey: string;
        createdAt: string;
    }>;
}
/** A single transaction record */
interface TransactionRecord {
    id: string;
    type: 'sent' | 'received' | 'swap';
    amount: string;
    asset: string;
    counterparty: string;
    createdAt: string;
    fromAmount?: string;
    fromAsset?: string;
}
/** A non-XLM asset balance on the wallet */
interface AssetBalance {
    code: string;
    issuer: string;
    balance: string;
}
/** Parameters for sending a payment */
interface SendPaymentParams {
    destination: string;
    amount: string;
    memo?: string;
    /** Asset code to send. Defaults to "XLM" if omitted. */
    assetCode?: string;
    /** Asset issuer address. Required when assetCode is not "XLM". */
    assetIssuer?: string;
}
/** A single asset hop in a DEX swap path */
interface SwapPathAsset {
    code: string;
    issuer: string | null;
}
/** Estimate returned by /api/wallet/swap-estimate */
interface SwapEstimate {
    destinationAmount: string;
    path: SwapPathAsset[];
}
/** Parameters for swapping assets via the Stellar DEX */
interface SwapParams {
    /** Asset to sell: "XLM" | "USDC" | "EURC" */
    fromAsset: string;
    /** Asset to buy: "XLM" | "USDC" | "EURC" */
    toAsset: string;
    /** Exact amount to sell */
    amount: string;
    /** Minimum amount to receive (slippage protection) */
    minReceive: string;
    /** Intermediate DEX path from estimateSwap. Omit to let the backend find it. */
    path?: SwapPathAsset[];
}
/** Result from signing a transaction */
interface SignResult {
    signedXdr: string;
    txHash?: string;
}
/** The public context provided by useAccesly hook */
interface AcceslyContextType {
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
    sendPayment: (params: SendPaymentParams) => Promise<{
        txHash: string;
    }>;
    /** Get a swap estimate (exchange rate + DEX path) without executing */
    estimateSwap: (fromAsset: string, toAsset: string, amount: string) => Promise<SwapEstimate>;
    /** Swap assets using the Stellar DEX */
    swap: (params: SwapParams) => Promise<{
        txHash: string;
    }>;
    /** Rotate wallet keys (generates new keypair, updates contract) */
    rotateKeys: () => Promise<{
        newStellarAddress: string;
    }>;
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

declare function AcceslyProvider({ children, ...config }: AcceslyConfig & {
    children: ReactNode;
}): react_jsx_runtime.JSX.Element;

/**
 * ConnectButton.tsx - SDK drop-in wallet button.
 *
 * Renders a dynamic button that:
 * - Shows "Connect Wallet" when disconnected → opens ConnectModal
 * - Shows a pill with address + balance when connected → opens WalletPanel
 * - Handles loading/creating states with spinners
 *
 * Usage:
 *   <ConnectButton />
 */
declare function ConnectButton(): react_jsx_runtime.JSX.Element;

/**
 * SwapModal.tsx - Swap between XLM, USDC, and EURC using the Stellar DEX.
 *
 * Uses the useAccesly hook for estimateSwap and swap — no props beyond callbacks.
 *
 * Usage:
 *   import { SwapModal } from 'accesly';
 *   <SwapModal onClose={() => setOpen(false)} onSuccess={() => refresh()} />
 */
interface SwapModalProps {
    onClose: () => void;
    onSuccess?: () => void;
}
declare function SwapModal({ onClose, onSuccess }: SwapModalProps): react_jsx_runtime.JSX.Element;

/**
 * useAccesly.ts - Public hook for accessing wallet state and actions.
 *
 * Usage:
 *   const { wallet, balance, connect, disconnect, sendPayment } = useAccesly();
 *
 * Must be used within an <AcceslyProvider>.
 */

declare function useAccesly(): AcceslyContextType;

export { type AcceslyConfig, type AcceslyContextType, AcceslyProvider, type AssetBalance, ConnectButton, type SendPaymentParams, type SignResult, type SwapEstimate, SwapModal, type SwapParams, type SwapPathAsset, type TransactionRecord, type WalletInfo, useAccesly };
