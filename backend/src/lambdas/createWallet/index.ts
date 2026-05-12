import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { Keypair } from '@stellar/stellar-sdk';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { kmsEncrypt } from '../../shared/kms.js';
import { splitKey, pbkdf2Encrypt, hashEmail } from '../../shared/crypto.js';
import { config } from '../../shared/config.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const email  = event.requestContext.authorizer.jwt.claims['email'] as string;

  if (!userId || !email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Idempotency — return existing wallet if already created
  const existing = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableWallets,
    Key: { userId },
  }));
  if (existing.Item) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        stellarAddress: existing.Item['stellarAddress'],
        publicKey: existing.Item['publicKey'],
        contractId: existing.Item['contractId'],
      }),
    };
  }

  // 1. Generate Ed25519 keypair (Stellar keypair)
  const keypair = Keypair.random();
  const secretBytes = Buffer.from(keypair.rawSecretKey());

  // 2. MPC split: F1 (device), F2 (KMS/DynamoDB), F3 (email/DynamoDB)
  const [f1, f2, f3] = splitKey(secretBytes);

  // 3. Encrypt F2 with KMS
  const f2Encrypted = await kmsEncrypt(f2);

  // 4. Encrypt F3 with PBKDF2 derived from email
  const { ciphertext: f3Ciphertext, salt: f3Salt } = pbkdf2Encrypt(f3, email);

  // 5. Hash email for on-chain contract init
  const emailHash = hashEmail(email).toString('hex');

  const now = new Date().toISOString();

  // 6. Fund the Stellar address via relayer /wallet/activate (before writing to DB)
  const relayerUrl = process.env['RELAYER_URL'];
  if (!relayerUrl) throw new Error('RELAYER_URL env var not set');

  const activateRes = await fetch(`${relayerUrl}/wallet/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stellar_address: keypair.publicKey() }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!activateRes.ok) {
    const err = await activateRes.json().catch(() => ({}));
    throw new Error(`Relayer activation failed: ${JSON.stringify(err)}`);
  }

  // 7. Atomic write: user_fragments + email_fragments + wallets in a single transaction
  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: config.dynamo.tableUserFragments,
          Item: { userId, f2Encrypted, createdAt: now, updatedAt: now },
          ConditionExpression: 'attribute_not_exists(userId)',
        },
      },
      {
        Put: {
          TableName: config.dynamo.tableEmailFragments,
          Item: { userId, f3Ciphertext, f3Salt, createdAt: now, updatedAt: now },
          ConditionExpression: 'attribute_not_exists(userId)',
        },
      },
      {
        Put: {
          TableName: config.dynamo.tableWallets,
          Item: {
            userId,
            stellarAddress: keypair.publicKey(),
            publicKey: Buffer.from(keypair.rawPublicKey()).toString('hex'),
            emailHash,
            contractId: null,
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(userId)',
        },
      },
    ],
  }));

  // 8. Return F1 to device — device stores it passkey-protected, server never sees it again
  return {
    statusCode: 201,
    body: JSON.stringify({
      stellarAddress: keypair.publicKey(),
      publicKey: Buffer.from(keypair.rawPublicKey()).toString('hex'),
      f1: Buffer.from(f1).toString('base64'),
      emailHash,
    }),
  };
};
