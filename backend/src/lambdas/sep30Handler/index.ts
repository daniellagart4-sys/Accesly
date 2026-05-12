import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { pbkdf2Decrypt } from '../../shared/crypto.js';
import { config } from '../../shared/config.js';

// SEP-30 recovery flow:
// POST /sep30/recover — verifies ZK proof from stellar-zk-email, returns F3 decrypted
// The SDK then uses F1 (if available) + F3 to reconstruct the key on a new device

// /recover is disabled until stellar-zk-email on-chain verification is integrated (issue #24)
const RECOVERY_ENABLED = process.env['RECOVERY_ENABLED'] === 'true';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const path   = event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (method === 'POST' && path.endsWith('/recover')) {
    if (!RECOVERY_ENABLED) {
      return { statusCode: 503, body: JSON.stringify({ error: 'Recovery not yet available' }) };
    }
    return handleRecover(event);
  }

  return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
};

async function handleRecover(event: Parameters<APIGatewayProxyHandlerV2WithJWTAuthorizer>[0]) {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const email  = event.requestContext.authorizer.jwt.claims['email'] as string;

  if (!userId || !email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const body = JSON.parse(event.body ?? '{}') as { zkProof?: string };

  // TODO: verify stellar-zk-email ZK proof on-chain before releasing F3
  // For now: require zkProof field to be present (stub — replace with real verification)
  if (!body.zkProof) {
    return { statusCode: 400, body: JSON.stringify({ error: 'zkProof required' }) };
  }

  const record = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableEmailFragments,
    Key: { userId },
  }));

  if (!record.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Recovery data not found' }) };
  }

  const f3 = pbkdf2Decrypt(
    record.Item['f3Ciphertext'] as string,
    record.Item['f3Salt'] as string,
    email
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      f3: Buffer.from(f3).toString('base64'),
    }),
  };
}
