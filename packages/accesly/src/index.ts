/**
 * Accesly SDK - Account abstraction wallet for Stellar.
 *
 * Quick start:
 *
 *   import { AcceslyProvider, ConnectButton } from 'accesly';
 *
 *   function App() {
 *     return (
 *       <AcceslyProvider appId="acc_xxxxx">
 *         <ConnectButton />
 *       </AcceslyProvider>
 *     );
 *   }
 *
 * For custom UI, use the useAccesly hook:
 *
 *   import { useAccesly } from 'accesly';
 *
 *   function MyWallet() {
 *     const { wallet, balance, connect, disconnect, sendPayment } = useAccesly();
 *     // Build your own UI
 *   }
 */

// --- CSS keyframes injection ---
// Since the SDK uses inline styles, we inject required keyframes once
if (typeof document !== 'undefined') {
  const STYLE_ID = 'accesly-keyframes';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes accesly-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// --- Components ---
export { AcceslyProvider } from './AcceslyProvider';
export { ConnectButton } from './components/ConnectButton';

// --- Hooks ---
export { useAccesly } from './hooks/useAccesly';

// --- Types ---
export type {
  AcceslyConfig,
  WalletInfo,
  TransactionRecord,
  SendPaymentParams,
  SignResult,
  AcceslyContextType,
} from './types';
