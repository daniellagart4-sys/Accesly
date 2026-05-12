import type { ScheduledHandler } from 'aws-lambda';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { config } from '../../shared/config.js';

const ACCESLY_YIELD_ADDRESS = process.env['ACCESLY_YIELD_ADDRESS'] ?? '';
const YIELD_SPLIT = 0.5; // 50% to user, 50% to Accesly

// EventBridge cron: runs weekly
// Detects CETES rebase and distributes yield 50/50 user ↔ Accesly
export const handler: ScheduledHandler = async () => {
  let cursor: string | undefined;
  let distributed = 0;

  do {
    const res = await dynamo.send(new ScanCommand({
      TableName: config.dynamo.tableYieldPositions,
      ExclusiveStartKey: cursor ? { userId: cursor } : undefined,
      Limit: 50,
    }));

    for (const item of res.Items ?? []) {
      try {
        await processYieldForUser(item as YieldPosition);
        distributed++;
      } catch (err) {
        console.error(`[distributeYield] Failed for user ${item['userId']}:`, err);
      }
    }

    cursor = res.LastEvaluatedKey?.['userId'] as string | undefined;
  } while (cursor);

  console.log(`[distributeYield] Processed ${distributed} yield positions`);
};

async function processYieldForUser(position: YieldPosition) {
  // 1. Get current CETES token balance from Stellar
  const currentBalance = await getCetesBalance(position.stellarAddress);
  const yieldEarned = currentBalance - position.principalDeposited;

  if (yieldEarned <= 0) return;

  const userShare    = yieldEarned * YIELD_SPLIT;
  const acceslyShare = yieldEarned * (1 - YIELD_SPLIT);

  // 2. Trigger Stellar tx: transfer acceslyShare to ACCESLY_YIELD_ADDRESS
  // Actual tx is signed by user's Smart Account — requires SDK coordination
  // For now: record the pending distribution, SDK picks it up on next open
  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableYieldPositions,
    Key: { userId: position.userId, appId: position.appId },
    UpdateExpression: 'SET yieldAccumulatedTotal = :y, lastYieldDistributed = :d, pendingDistribution = :p',
    ExpressionAttributeValues: {
      ':y': (position.yieldAccumulatedTotal ?? 0) + yieldEarned,
      ':d': new Date().toISOString(),
      ':p': { userShare, acceslyShare, computedAt: new Date().toISOString() },
    },
  }));

  console.log(`[distributeYield] User ${position.userId}: yield ${yieldEarned.toFixed(6)} USDC (user: ${userShare.toFixed(6)}, accesly: ${acceslyShare.toFixed(6)})`);
}

async function getCetesBalance(stellarAddress: string): Promise<number> {
  const horizonUrl = config.stellar.horizonUrl;
  const res = await fetch(`${horizonUrl}/accounts/${stellarAddress}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return 0;
  const account = await res.json() as { balances: Array<{ asset_code: string; balance: string }> };
  const cetes = account.balances.find(b => b.asset_code === 'CETES');
  return cetes ? parseFloat(cetes.balance) : 0;
}

interface YieldPosition {
  userId: string;
  appId: string;
  stellarAddress: string;
  principalDeposited: number;
  yieldAccumulatedTotal?: number;
  lastYieldDistributed?: string;
}
