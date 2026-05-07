import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../db/dynamo.js';
import { notify } from './slack.js';
import { config } from '../config.js';

// Last processed ledger sequence — avoids re-processing old events
let lastLedger = 0;

export async function runMonitorCycle(): Promise<void> {
  try {
    // Get all deployed contract IDs from wallets table
    // NOTE: the wallets table lives in the other dev's DB — this may need adjustment
    // depending on where wallet/contract data is stored in the final architecture
    const contractIds = await fetchContractIds();
    if (!contractIds.length) return;

    const events = await fetchContractEvents(contractIds);

    for (const event of events) {
      await handleEvent(event, contractIds);
    }
  } catch (err) {
    console.error('[monitor] Cycle failed:', err);
  }
}

async function fetchContractIds(): Promise<string[]> {
  // TODO: adjust table name once the other dev confirms where wallets/contracts are stored
  try {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: 'wallets',
        ProjectionExpression: 'contractId',
        FilterExpression: 'attribute_exists(contractId)',
      })
    );
    return (result.Items ?? []).map((i: any) => i.contractId).filter(Boolean);
  } catch {
    // Table might not exist yet — fail silently
    return [];
  }
}

async function fetchContractEvents(contractIds: string[]): Promise<any[]> {
  const params = new URLSearchParams({ order: 'asc', limit: '200' });
  if (lastLedger > 0) params.set('cursor', `${lastLedger}-0`);

  const res = await fetch(`${config.stellar.horizonUrl}/contracts/events?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  const records: any[] = data._embedded?.records ?? [];

  if (records.length > 0) {
    const last = records[records.length - 1].ledger;
    if (last > lastLedger) lastLedger = last;
  }

  return records.filter((r) => contractIds.includes(r.contract_id));
}

async function handleEvent(event: any, _contractIds: string[]): Promise<void> {
  const topics: string[] = (event.topic ?? []).map((t: any) => String(t).toLowerCase());
  const contractId: string = event.contract_id;
  const txHash: string = event.transaction_hash;

  if (topics.some((t) => t.includes('update_owner') || t.includes('key_rotated'))) {
    await notify(
      `Key rotation on contract \`${contractId}\`\nTx: \`${txHash}\``,
      'warning'
    );
  } else if (topics.some((t) => t.includes('recovery'))) {
    await notify(
      `Recovery attempt on contract \`${contractId}\`\nTx: \`${txHash}\``,
      'critical'
    );
  } else if (topics.some((t) => t.includes('wallet_created'))) {
    await notify(
      `New wallet deployed: contract \`${contractId}\`\nTx: \`${txHash}\``,
      'info'
    );
  }

  await pushMetric(topics[0] ?? 'unknown', contractId);
}

async function pushMetric(eventType: string, contractId: string): Promise<void> {
  if (!config.cloudwatch.enabled) return;

  try {
    const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
    const cw = new CloudWatchClient({ region: config.aws.region });

    await cw.send(
      new PutMetricDataCommand({
        Namespace: 'Accesly/Relayer',
        MetricData: [
          {
            MetricName: 'ContractEvent',
            Dimensions: [
              { Name: 'EventType', Value: eventType },
              { Name: 'ContractId', Value: contractId.slice(0, 20) },
            ],
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (err) {
    console.warn('[monitor] CloudWatch push failed:', err);
  }
}
