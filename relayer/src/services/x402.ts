import { incrementIfUnderLimit, getUsage, getAppConfig } from '../db/tables.js';
import type { UsageOperation } from '../db/tables.js';

export const PRICING: Record<UsageOperation, number> = {
  walletCreates: 0.05,
  transactions:  0.01,
  queries:       0.001,
  kycCalls:      0.10,
  recoveryCalls: 0,
};

const DEFAULT_LIMITS: Record<UsageOperation, number> = {
  walletCreates: 100,
  transactions:  1000,
  queries:       10000,
  kycCalls:      50,
  recoveryCalls: Infinity,
};

export interface UsageCheck {
  withinFree: boolean;
  chargeUsdc: number;
  current: number;
  limit: number;
}

export async function checkAndTrack(appId: string, operation: UsageOperation): Promise<UsageCheck> {
  const appConfig = await getAppConfig(appId);

  const limits: Record<UsageOperation, number> = {
    walletCreates: appConfig?.monthlyWalletCreates ?? DEFAULT_LIMITS.walletCreates,
    transactions:  appConfig?.monthlyTransactions  ?? DEFAULT_LIMITS.transactions,
    queries:       appConfig?.monthlyQueries       ?? DEFAULT_LIMITS.queries,
    kycCalls:      appConfig?.monthlyKyc           ?? DEFAULT_LIMITS.kycCalls,
    recoveryCalls: DEFAULT_LIMITS.recoveryCalls,
  };

  const limit = limits[operation];

  // H-4: atomic check-and-increment — enforced in DynamoDB, no race condition
  const { allowed, current } = await incrementIfUnderLimit(appId, operation, limit);

  return {
    withinFree: allowed,
    chargeUsdc: allowed ? 0 : PRICING[operation],
    current,
    limit,
  };
}

export { getUsage, type UsageOperation };
