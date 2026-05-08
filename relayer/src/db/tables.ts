import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { dynamo } from './dynamo.js';
import { config } from '../config.js';
import { decrypt } from '../crypto.js';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TxStatus = 'pending' | 'processing' | 'submitted' | 'confirmed' | 'failed';
export type FeeStrategy = 'developer_pays' | 'user_pays';
export type SwapStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface RelayerTx {
  txId: string;
  appId: string;
  userId?: string;
  innerXdr: string;
  feeBumpXdr?: string;
  txHash?: string;
  status: TxStatus;
  feeStrategy: FeeStrategy;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppConfig {
  appId: string;
  feeStrategy: FeeStrategy;
  fundAccountPublicKey?: string;
  fundAccountEncryptedSecret?: string;
  fundAccountEncryptionIv?: string;
  fundAccountEncryptionTag?: string;
  allowedTokens: string[];
  slippagePercentage: number;
  minBalanceThresholdXlm: number;
  monthlyWalletCreates: number;
  monthlyTransactions: number;
  monthlyQueries: number;
  monthlyKyc: number;
  plan: 'free' | 'growth' | 'enterprise';
}

export interface ChannelAccount {
  channelId: string;
  appId: string;
  stellarAddress: string;
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  isAvailable: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// relayer_transactions
// ---------------------------------------------------------------------------

export async function createRelayerTx(params: {
  appId: string;
  userId?: string;
  innerXdr: string;
  feeStrategy: FeeStrategy;
}): Promise<string> {
  const txId = uuidv4();
  const now = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: config.dynamo.tableRelayerTxs,
    Item: {
      txId,
      appId: params.appId,
      userId: params.userId,
      innerXdr: params.innerXdr,
      feeStrategy: params.feeStrategy,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    },
  }));

  return txId;
}

export async function updateRelayerTx(
  txId: string,
  update: {
    status?: TxStatus;
    feeBumpXdr?: string;
    txHash?: string;
    errorMessage?: string;
    attempts?: number;
  }
): Promise<void> {
  const expressions: string[] = ['#updatedAt = :updatedAt'];
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };

  if (update.status)        { expressions.push('#status = :status');           names['#status'] = 'status';   values[':status'] = update.status; }
  if (update.feeBumpXdr)    { expressions.push('feeBumpXdr = :feeBumpXdr');    values[':feeBumpXdr'] = update.feeBumpXdr; }
  if (update.txHash)        { expressions.push('txHash = :txHash');            values[':txHash'] = update.txHash; }
  if (update.errorMessage)  { expressions.push('errorMessage = :errorMessage'); values[':errorMessage'] = update.errorMessage; }
  if (update.attempts !== undefined) { expressions.push('attempts = :attempts'); values[':attempts'] = update.attempts; }

  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableRelayerTxs,
    Key: { txId },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function getRelayerTx(txId: string): Promise<RelayerTx | null> {
  const result = await dynamo.send(
    new GetCommand({ TableName: config.dynamo.tableRelayerTxs, Key: { txId } })
  );
  return (result.Item as RelayerTx) ?? null;
}

// ---------------------------------------------------------------------------
// app_configs — read-only, written by the other dev's createApp Lambda
// ---------------------------------------------------------------------------

export async function getAppConfig(appId: string): Promise<AppConfig | null> {
  const result = await dynamo.send(
    new GetCommand({ TableName: config.dynamo.tableAppConfigs, Key: { appId } })
  );
  return (result.Item as AppConfig) ?? null;
}

// H-2: decrypt fund account secret when loading from DB
export async function getFundSecret(appConfig: AppConfig): Promise<string> {
  if (
    appConfig.fundAccountEncryptedSecret &&
    appConfig.fundAccountEncryptionIv &&
    appConfig.fundAccountEncryptionTag
  ) {
    return decrypt(
      appConfig.fundAccountEncryptedSecret,
      appConfig.fundAccountEncryptionIv,
      appConfig.fundAccountEncryptionTag
    );
  }
  // Fall back to relayer default fund account
  return config.stellar.fundSecret;
}

// ---------------------------------------------------------------------------
// usage_tracking — H-4: atomic check-and-increment via DynamoDB condition
// ---------------------------------------------------------------------------

export type UsageOperation = 'walletCreates' | 'transactions' | 'queries' | 'kycCalls' | 'recoveryCalls';

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function usagePk(appId: string, yearMonth: string): string {
  return `${appId}#${yearMonth}`;
}

export async function incrementUsage(appId: string, operation: UsageOperation): Promise<void> {
  const pk = usagePk(appId, currentYearMonth());

  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableUsage,
    Key: { pk },
    UpdateExpression: `ADD #op :one SET appId = if_not_exists(appId, :appId), yearMonth = if_not_exists(yearMonth, :ym)`,
    ExpressionAttributeNames: { '#op': operation },
    ExpressionAttributeValues: {
      ':one': 1,
      ':appId': appId,
      ':ym': currentYearMonth(),
    },
  }));
}

// H-4: atomic increment that enforces the limit in DynamoDB itself
export async function incrementIfUnderLimit(
  appId: string,
  operation: UsageOperation,
  limit: number
): Promise<{ allowed: boolean; current: number }> {
  const pk = usagePk(appId, currentYearMonth());

  // First ensure the row exists
  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableUsage,
    Key: { pk },
    UpdateExpression: `SET appId = if_not_exists(appId, :appId), yearMonth = if_not_exists(yearMonth, :ym), #op = if_not_exists(#op, :zero)`,
    ExpressionAttributeNames: { '#op': operation },
    ExpressionAttributeValues: { ':appId': appId, ':ym': currentYearMonth(), ':zero': 0 },
  }));

  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: config.dynamo.tableUsage,
      Key: { pk },
      UpdateExpression: `ADD #op :one`,
      ConditionExpression: '#op < :limit',
      ExpressionAttributeNames: { '#op': operation },
      ExpressionAttributeValues: { ':one': 1, ':limit': limit },
      ReturnValues: 'UPDATED_NEW',
    }));

    const current = (result.Attributes?.[operation] as number) ?? 0;
    return { allowed: true, current };
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      const current = await getUsageCount(pk, operation);
      return { allowed: false, current };
    }
    throw err;
  }
}

async function getUsageCount(pk: string, operation: UsageOperation): Promise<number> {
  const result = await dynamo.send(
    new GetCommand({ TableName: config.dynamo.tableUsage, Key: { pk } })
  );
  return (result.Item?.[operation] as number) ?? 0;
}

export async function getUsage(appId: string): Promise<Record<string, number>> {
  const result = await dynamo.send(
    new GetCommand({
      TableName: config.dynamo.tableUsage,
      Key: { pk: usagePk(appId, currentYearMonth()) },
    })
  );

  const defaults = { walletCreates: 0, transactions: 0, queries: 0, kycCalls: 0, recoveryCalls: 0, totalBilledUsdc: 0 };
  return { ...defaults, ...(result.Item ?? {}) };
}

// ---------------------------------------------------------------------------
// fund_account_swaps
// ---------------------------------------------------------------------------

export async function createSwapRecord(params: {
  appId?: string;
  fromAsset: string;
  fromAmount: number;
  toAsset: string;
  triggerType: 'auto' | 'manual';
}): Promise<string> {
  const swapId = uuidv4();
  await dynamo.send(new PutCommand({
    TableName: config.dynamo.tableSwaps,
    Item: {
      swapId,
      appId: params.appId,
      fromAsset: params.fromAsset,
      fromAmount: params.fromAmount,
      toAsset: params.toAsset,
      status: 'pending',
      triggerType: params.triggerType,
      createdAt: new Date().toISOString(),
    },
  }));
  return swapId;
}

export async function updateSwapRecord(
  swapId: string,
  update: { status: SwapStatus; txHash?: string; toAmount?: number }
): Promise<void> {
  const expressions = ['#status = :status'];
  const names: Record<string, string> = { '#status': 'status' };
  const values: Record<string, unknown> = { ':status': update.status };

  if (update.txHash)              { expressions.push('txHash = :txHash');   values[':txHash'] = update.txHash; }
  if (update.toAmount !== undefined) { expressions.push('toAmount = :toAmount'); values[':toAmount'] = update.toAmount; }

  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableSwaps,
    Key: { swapId },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// ---------------------------------------------------------------------------
// channel_accounts
// ---------------------------------------------------------------------------

export async function getAvailableChannel(appId: string): Promise<ChannelAccount | null> {
  const result = await dynamo.send(new ScanCommand({
    TableName: config.dynamo.tableChannels,
    FilterExpression: 'appId = :appId AND isAvailable = :yes',
    ExpressionAttributeValues: { ':appId': appId, ':yes': true },
    Limit: 1,
  }));
  return (result.Items?.[0] as ChannelAccount) ?? null;
}

export async function lockChannel(channelId: string): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableChannels,
    Key: { channelId },
    UpdateExpression: 'SET isAvailable = :no, lastUsedAt = :now',
    ConditionExpression: 'isAvailable = :yes',
    ExpressionAttributeValues: { ':no': false, ':yes': true, ':now': new Date().toISOString() },
  }));
}

export async function releaseChannel(channelId: string): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableChannels,
    Key: { channelId },
    UpdateExpression: 'SET isAvailable = :yes',
    ExpressionAttributeValues: { ':yes': true },
  }));
}

// ---------------------------------------------------------------------------
// monitor_state — M-2: persist ledger cursor across restarts
// ---------------------------------------------------------------------------

export async function getLastProcessedLedger(): Promise<number> {
  const result = await dynamo.send(
    new GetCommand({ TableName: config.dynamo.tableMonitorState, Key: { pk: 'ledger_cursor' } })
  );
  return (result.Item?.lastLedger as number) ?? 0;
}

export async function saveLastProcessedLedger(ledger: number): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: config.dynamo.tableMonitorState,
    Key: { pk: 'ledger_cursor' },
    UpdateExpression: 'SET lastLedger = :l',
    ExpressionAttributeValues: { ':l': ledger },
  }));
}
