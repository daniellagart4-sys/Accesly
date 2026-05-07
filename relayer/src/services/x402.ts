import { incrementUsage, getUsage, getAppConfig } from '../db/tables.js';
import type { UsageOperation } from '../db/tables.js';

// Pricing in USDC per call above the free tier
export const PRICING: Record<UsageOperation, number> = {
  walletCreates: 0.05,
  transactions: 0.01,
  queries: 0.001,
  kycCalls: 0.10,
  recoveryCalls: 0,
};

const DEFAULT_LIMITS: Record<UsageOperation, number> = {
  walletCreates: 100,
  transactions: 1000,
  queries: 10000,
  kycCalls: 50,
  recoveryCalls: Infinity,
};

export interface UsageCheck {
  withinFree: boolean;
  chargeUsdc: number;
  current: number;
  limit: number;
}

export async function checkAndTrack(appId: string, operation: UsageOperation): Promise<UsageCheck> {
  const [appConfig, usage] = await Promise.all([
    getAppConfig(appId),
    getUsage(appId),
  ]);

  const limits = {
    walletCreates: appConfig?.monthlyWalletCreates ?? DEFAULT_LIMITS.walletCreates,
    transactions: appConfig?.monthlyTransactions ?? DEFAULT_LIMITS.transactions,
    queries: appConfig?.monthlyQueries ?? DEFAULT_LIMITS.queries,
    kycCalls: appConfig?.monthlyKyc ?? DEFAULT_LIMITS.kycCalls,
    recoveryCalls: DEFAULT_LIMITS.recoveryCalls,
  };

  const current = (usage[operation] as number) ?? 0;
  const limit = limits[operation];
  const withinFree = current < limit;

  // Always track usage regardless
  await incrementUsage(appId, operation);

  return {
    withinFree,
    chargeUsdc: withinFree ? 0 : PRICING[operation],
    current,
    limit,
  };
}

export { getUsage, UsageOperation };
