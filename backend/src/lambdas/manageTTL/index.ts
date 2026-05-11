import type { ScheduledHandler } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { config } from '../../shared/config.js';

const SOROBAN_RPC = config.stellar.rpcUrl;
const TTL_WARNING_DAYS = 7;
const TTL_EXTEND_LEDGERS = 535_680; // ~30 days at 5s/ledger

// EventBridge cron: runs every 24h
// Extends TTL of persistent storage for all active Soroban Smart Accounts
export const handler: ScheduledHandler = async () => {
  let cursor: string | undefined;
  let extended = 0;
  let warned = 0;

  do {
    const res = await dynamo.send(new ScanCommand({
      TableName: config.dynamo.tableWallets,
      ProjectionExpression: 'userId, contractId',
      ExclusiveStartKey: cursor ? { userId: cursor } : undefined,
      Limit: 100,
    }));

    for (const item of res.Items ?? []) {
      const contractId = item['contractId'] as string | null;
      if (!contractId) continue;

      try {
        const ttlInfo = await getLedgerTTL(contractId);

        if (ttlInfo.expiresInDays < TTL_WARNING_DAYS) {
          console.warn(`[manageTTL] TTL warning: contract ${contractId} expires in ${ttlInfo.expiresInDays} days`);
          warned++;
        }

        await extendTTL(contractId);
        extended++;
      } catch (err) {
        console.error(`[manageTTL] Failed for ${contractId}:`, err);
      }
    }

    cursor = res.LastEvaluatedKey?.['userId'] as string | undefined;
  } while (cursor);

  console.log(`[manageTTL] Done. Extended: ${extended}, Warnings: ${warned}`);
};

async function getLedgerTTL(contractId: string): Promise<{ expiresInDays: number }> {
  const res = await fetch(SOROBAN_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getLedgerEntries',
      params: { keys: [contractId] },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json() as { result?: { entries?: Array<{ liveUntilLedgerSeq: number }> } };
  const entry = data.result?.entries?.[0];
  if (!entry) return { expiresInDays: 0 };
  // Approximate: ~5s per ledger → 17_280 ledgers/day
  const ledgersRemaining = entry.liveUntilLedgerSeq;
  return { expiresInDays: Math.floor(ledgersRemaining / 17_280) };
}

async function extendTTL(contractId: string): Promise<void> {
  // Uses Stellar SDK bumpContractDataFootprintExpiration via RPC
  // Stub: real implementation requires signing a tx with a funded account
  // TODO: sign with a dedicated TTL-manager keypair stored in SSM Parameter Store
  console.log(`[manageTTL] Would extend TTL for ${contractId} by ${TTL_EXTEND_LEDGERS} ledgers`);
}
