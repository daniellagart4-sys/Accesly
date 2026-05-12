#!/usr/bin/env node
// Creates the KMS CMK for encrypting user_fragments (F2)
// Run once: AWS_REGION=us-east-1 node scripts/setup-kms.mjs
// Outputs: KMS_KEY_ID to add to your .env

import { KMSClient, CreateKeyCommand, CreateAliasCommand, DescribeKeyCommand } from '@aws-sdk/client-kms';

const region = process.env.AWS_REGION ?? 'us-east-1';
const alias  = 'alias/accesly-user-fragments';
const client = new KMSClient({ region });

// Check if alias already exists
try {
  const desc = await client.send(new DescribeKeyCommand({ KeyId: alias }));
  const keyId = desc.KeyMetadata?.KeyId;
  console.log(`✓ KMS key already exists: ${keyId}`);
  console.log(`\nAdd to .env:\nKMS_KEY_ID=${keyId}`);
  process.exit(0);
} catch (err) {
  if (err.name !== 'NotFoundException') throw err;
}

// Create new CMK
const key = await client.send(new CreateKeyCommand({
  Description: 'Accesly user_fragments F2 encryption key',
  KeyUsage: 'ENCRYPT_DECRYPT',
  KeySpec: 'SYMMETRIC_DEFAULT',
  MultiRegion: false,
}));

const keyId = key.KeyMetadata?.KeyId;

await client.send(new CreateAliasCommand({
  AliasName: alias,
  TargetKeyId: keyId,
}));

console.log(`✓ KMS key created: ${keyId}`);
console.log(`\nAdd to .env:\nKMS_KEY_ID=${keyId}`);
