import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { Keypair, Networks, TransactionBuilder, Operation, BASE_FEE, Asset, Account } from '@stellar/stellar-sdk';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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

  // 6. Store F2 in user_fragments
  await dynamo.send(new PutCommand({
    TableName: config.dynamo.tableUserFragments,
    Item: {
      userId,
      f2Encrypted,
      createdAt: now,
      updatedAt: now,
    },
    ConditionExpression: 'attribute_not_exists(userId)',
  }));

  // 7. Store F3 in email_fragments
  await dynamo.send(new PutCommand({
    TableName: config.dynamo.tableEmailFragments,
    Item: {
      userId,
      f3Ciphertext,
      f3Salt,
      createdAt: now,
      updatedAt: now,
    },
    ConditionExpression: 'attribute_not_exists(userId)',
  }));

  // 8. Fund the Stellar address via relayer /wallet/activate
  const relayerUrl = process.env['RELAYER_URL'] ?? 'http://98.88.198.167:3001';
  const activateRes = await fetch(`${relayerUrl}/wallet/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': event.headers['authorization'] ?? '',
    },
    body: JSON.stringify({ stellar_address: keypair.publicKey() }),
  });
  if (!activateRes.ok) {
    const err = await activateRes.json().catch(() => ({}));
    throw new Error(`Relayer activation failed: ${JSON.stringify(err)}`);
  }

  // 9. Store wallet record (contractId TBD — Soroban deploy async or pre-deployed factory)
  await dynamo.send(new PutCommand({
    TableName: config.dynamo.tableWallets,
    Item: {
      userId,
      stellarAddress: keypair.publicKey(),
      publicKey: Buffer.from(keypair.rawPublicKey()).toString('hex'),
      emailHash,
      contractId: null, // populated after Soroban deploy (issue #22 extension)
      createdAt: now,
      updatedAt: now,
    },
    ConditionExpression: 'attribute_not_exists(userId)',
  }));

  // 10. Return F1 to the device — device stores it passkey-protected, server never sees it again
  return {
    statusCode: 201,
    body: JSON.stringify({
      stellarAddress: keypair.publicKey(),
      publicKey: Buffer.from(keypair.rawPublicKey()).toString('hex'),
      f1: Buffer.from(f1).toString('base64'), // device stores this
      emailHash,
    }),
  };
};
