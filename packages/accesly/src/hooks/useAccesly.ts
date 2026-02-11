/**
 * useAccesly.ts - Public hook for accessing wallet state and actions.
 *
 * Usage:
 *   const { wallet, balance, connect, disconnect, sendPayment } = useAccesly();
 *
 * Must be used within an <AcceslyProvider>.
 */

import { useContext } from 'react';
import { AcceslyContext } from '../AcceslyProvider';
import type { AcceslyContextType } from '../types';

export function useAccesly(): AcceslyContextType {
  const context = useContext(AcceslyContext);
  if (!context) {
    throw new Error(
      'useAccesly must be used within an <AcceslyProvider>. ' +
        'Wrap your app with <AcceslyProvider appId="acc_xxxxx">.'
    );
  }
  return context;
}
