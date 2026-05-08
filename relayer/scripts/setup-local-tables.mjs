import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const tables = [
  {
    TableName: 'relayer_transactions',
    KeySchema: [{ AttributeName: 'txId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'txId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'usage_tracking',
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'fund_account_swaps',
    KeySchema: [{ AttributeName: 'swapId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'swapId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'channel_accounts',
    KeySchema: [{ AttributeName: 'accountId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'accountId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'app_configs',
    KeySchema: [{ AttributeName: 'appId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'appId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'wallets',
    KeySchema: [{ AttributeName: 'walletId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'walletId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'monitor_state',
    KeySchema: [{ AttributeName: 'key', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'key', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

const { TableNames: existing } = await dynamo.send(new ListTablesCommand({}));

for (const table of tables) {
  if (existing.includes(table.TableName)) {
    console.log(`  skip  ${table.TableName} (already exists)`);
    continue;
  }
  await dynamo.send(new CreateTableCommand(table));
  console.log(`created  ${table.TableName}`);
}

// Seed a test app_config so /relay and /usage don't 403
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
const doc = DynamoDBDocumentClient.from(dynamo);
await doc.send(new PutCommand({
  TableName: 'app_configs',
  Item: {
    appId: 'test-app',
    feeStrategy: 'developer_pays',
    plan: 'free',
    monthlyTransactions: 1000,
    monthlyWalletCreates: 100,
    monthlyQueries: 10000,
    monthlyKyc: 50,
    allowedTokens: ['XLM', 'USDC'],
    slippagePercentage: 2,
  },
}));
console.log('seeded   app_configs (test-app)');
