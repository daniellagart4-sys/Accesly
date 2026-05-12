#!/usr/bin/env node
// Creates the 4 new DynamoDB tables for issues #17-19 and #21
// Run: AWS_REGION=us-east-1 node scripts/setup-tables.mjs

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const region   = process.env.AWS_REGION ?? 'us-east-1';
const endpoint = process.env.DYNAMO_ENDPOINT; // set for local dev

const client = new DynamoDBClient({
  region,
  ...(endpoint ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {}),
});

const tables = [
  // Issue #17 — user_fragments (F2, KMS-encrypted)
  {
    TableName: process.env.DYNAMO_TABLE_USER_FRAGMENTS ?? 'user_fragments',
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  // Issue #18 — email_fragments (F3, PBKDF2-encrypted)
  {
    TableName: process.env.DYNAMO_TABLE_EMAIL_FRAGMENTS ?? 'email_fragments',
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  // Issue #19 — user_kyc_status
  {
    TableName: process.env.DYNAMO_TABLE_KYC_STATUS ?? 'user_kyc_status',
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  // Issue #21 — yield_positions (userId + appId composite key)
  {
    TableName: process.env.DYNAMO_TABLE_YIELD_POSITIONS ?? 'yield_positions',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'appId',  KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'appId',  AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

for (const table of tables) {
  try {
    await client.send(new DescribeTableCommand({ TableName: table.TableName }));
    console.log(`✓ ${table.TableName} — already exists`);
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
    await client.send(new CreateTableCommand(table));
    console.log(`✓ ${table.TableName} — created`);
  }
}

console.log('\nAll tables ready.');
