import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { kmsEncrypt } from '../../shared/kms.js';
import { hashEmail } from '../../shared/crypto.js';
import { config } from '../../shared/config.js';

/**
 * POST /createWallet
 *
 * Two modes, same route:
 *
 * Query mode (body is empty or omits stellarPublicKey):
 *   Returns the existing wallet for the authenticated user, or 404 if none.
 *
 * Create mode (body includes stellarPublicKey):
 *   Accepts client-generated MPC fragments. The server never sees the secret key.
 *   Body: { stellarPublicKey, serverFragment, emailFragment, emailSalt }
 *
 * MPC scheme (2-of-2, dual-recovery):
 *   normal   signing : F1 (device) XOR F2 (serverFragment, KMS-encrypted)  = secret
 *   recovery signing : K_email (PBKDF2 from email) XOR emailFragment = F1  → F1 XOR F2 = secret
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const email  = event.requestContext.authorizer.jwt.claims['email'] as string;

  if (!userId || !email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ---- Query mode ----
  const body = parseBody(event.body);
  if (!body?.stellarPublicKey) {
    return queryWallet(userId);
  }

  // ---- Create mode ----
  const { stellarPublicKey, serverFragment, emailFragment, emailSalt } = body;

  if (!stellarPublicKey || !serverFragment || !emailFragment || !emailSalt) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required fields: stellarPublicKey, serverFragment, emailFragment, emailSalt',
      }),
    };
  }

  if (!stellarPublicKey.startsWith('G') || stellarPublicKey.length !== 56) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid stellarPublicKey' }) };
  }

  // Idempotency — return existing wallet without erroring
  const existing = await queryWallet(userId);
  if (existing.statusCode === 200) return existing;

  // Encrypt client-provided F2 with KMS
  const serverFragmentBytes = Buffer.from(serverFragment, 'base64');
  const f2Encrypted = await kmsEncrypt(serverFragmentBytes);

  const emailHash = hashEmail(email).toString('hex');
  const now = new Date().toISOString();

  // Fund the Stellar address via relayer before writing to DB
  const relayerUrl = process.env['RELAYER_URL'];
  if (!relayerUrl) throw new Error('RELAYER_URL env var not set');

  const activateRes = await fetch(`${relayerUrl}/wallet/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stellar_address: stellarPublicKey }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!activateRes.ok) {
    const err = await activateRes.json().catch(() => ({}));
    throw new Error(`Relayer activation failed: ${JSON.stringify(err)}`);
  }

  // Atomic write: user_fragments + email_fragments + wallets
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
          Item: { userId, emailFragment, emailSalt, createdAt: now, updatedAt: now },
          ConditionExpression: 'attribute_not_exists(userId)',
        },
      },
      {
        Put: {
          TableName: config.dynamo.tableWallets,
          Item: {
            userId,
            stellarAddress: stellarPublicKey,
            publicKey: stellarPublicKey,
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

  return {
    statusCode: 201,
    body: JSON.stringify({
      wallet: {
        contractId: null,
        publicKey: stellarPublicKey,
        stellarAddress: stellarPublicKey,
        email,
        createdAt: now,
      },
    }),
  };
};

// ---- Helpers ----

async function queryWallet(userId: string): Promise<{ statusCode: number; body: string }> {
  const record = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableWallets,
    Key: { userId },
  }));

  if (!record.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Wallet not found' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      wallet: {
        contractId:    record.Item['contractId'] ?? null,
        publicKey:     record.Item['publicKey'] as string,
        stellarAddress:record.Item['stellarAddress'] as string,
        email:         record.Item['email'] as string ?? '',
        createdAt:     record.Item['createdAt'] as string,
      },
    }),
  };
}

function parseBody(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
