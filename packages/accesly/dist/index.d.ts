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
    type: 'sent' | 'received';
    amount: string;
    asset: string;
    counterparty: string;
    createdAt: string;
}
/** Parameters for sending a payment */
interface SendPaymentParams {
    destination: string;
    amount: string;
    memo?: string;
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
    /** Last error message, or null */
    error: string | null;
    /** Open the auth popup and connect */
    connect: () => Promise<void>;
    /** Disconnect and clear all state */
    disconnect: () => void;
    /** Send a payment */
    sendPayment: (params: SendPaymentParams) => Promise<{
        txHash: string;
    }>;
    /** Refresh the balance */
    refreshBalance: () => Promise<void>;
    /** Refresh wallet info */
    refreshWallet: () => Promise<void>;
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
 * useAccesly.ts - Public hook for accessing wallet state and actions.
 *
 * Usage:
 *   const { wallet, balance, connect, disconnect, sendPayment } = useAccesly();
 *
 * Must be used within an <AcceslyProvider>.
 */

declare function useAccesly(): AcceslyContextType;

export { type AcceslyConfig, type AcceslyContextType, AcceslyProvider, ConnectButton, type SendPaymentParams, type TransactionRecord, type WalletInfo, useAccesly };
