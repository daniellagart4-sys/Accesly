import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../db/dynamo.js';
import { getLastProcessedLedger, saveLastProcessedLedger } from '../db/tables.js';
import { notify } from './slack.js';
import { config } from '../config.js';

export async function runMonitorCycle(): Promise<void> {
  try {
    const contractIds = await fetchContractIds();
    if (!contractIds.length) return;

    // M-2: load cursor from DynamoDB, not in-process memory
    const lastLedger = await getLastProcessedLedger();
    const { events, newLastLedger } = await fetchContractEvents(contractIds, lastLedger);

    for (const event of events) {
      await handleEvent(event);
    }

    if (newLastLedger > lastLedger) {
      await saveLastProcessedLedger(newLastLedger);
    }
  } catch (err) {
    console.error('[monitor] Cycle failed:', err);
  }
}

async function fetchContractIds(): Promise<string[]> {
  // TODO: confirm table name with other dev once wallets table is defined in DynamoDB
  try {
    const ids: string[] = [];
    let lastKey: Record<string, any> | undefined;

    do {
      const result = await dynamo.send(new ScanCommand({
        TableName: config.dynamo.tableWallets,
        ProjectionExpression: 'contractId',
        FilterExpression: 'attribute_exists(contractId)',
        ExclusiveStartKey: lastKey,
      }));
      result.Items?.forEach((i) => { if (i['contractId']) ids.push(i['contractId'] as string); });
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return ids;
  } catch {
    return [];
  }
}

async function fetchContractEvents(
  contractIds: string[],
  lastLedger: number
): Promise<{ events: any[]; newLastLedger: number }> {
  // M-3: filter by contract_id in the query, not client-side
  const allEvents: any[] = [];
  let newLastLedger = lastLedger;

  for (const contractId of contractIds) {
    const params = new URLSearchParams({
      contract_id: contractId,
      order: 'asc',
      limit: '100',
    });
    if (lastLedger > 0) params.set('cursor', `${lastLedger}-0`);

    const res = await fetch(`${config.stellar.horizonUrl}/contracts/events?${params}`);
    if (!res.ok) continue;

    const data = await res.json();
    const records: any[] = data._embedded?.records ?? [];

    allEvents.push(...records);

    if (records.length > 0) {
      const last = records[records.length - 1].ledger;
      if (last > newLastLedger) newLastLedger = last;
    }
  }

  return { events: allEvents, newLastLedger };
}

async function handleEvent(event: any): Promise<void> {
  const topics: string[] = (event.topic ?? []).map((t: any) => String(t).toLowerCase());
  const contractId: string = event.contract_id;
  const txHash: string = event.transaction_hash;

  if (topics.some((t) => t.includes('update_owner') || t.includes('key_rotated'))) {
    await notify(`Key rotation on contract \`${contractId}\`\nTx: \`${txHash}\``, 'warning');
  } else if (topics.some((t) => t.includes('recovery'))) {
    await notify(`Recovery attempt on contract \`${contractId}\`\nTx: \`${txHash}\``, 'critical');
  } else if (topics.some((t) => t.includes('wallet_created'))) {
    await notify(`New wallet deployed: \`${contractId}\`\nTx: \`${txHash}\``, 'info');
  }

  await pushMetric(topics[0] ?? 'unknown', contractId);
}

async function pushMetric(eventType: string, contractId: string): Promise<void> {
  if (!config.cloudwatch.enabled) return;

  try {
    const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
    const cw = new CloudWatchClient({ region: config.aws.region });

    await cw.send(new PutMetricDataCommand({
      Namespace: 'Accesly/Relayer',
      MetricData: [{
        MetricName: 'ContractEvent',
        Dimensions: [
          { Name: 'EventType', Value: eventType },
          { Name: 'ContractId', Value: contractId.slice(0, 20) },
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
      }],
    }));
  } catch (err) {
    console.warn('[monitor] CloudWatch push failed:', err);
  }
}
