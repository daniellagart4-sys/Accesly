import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { config } from '../../shared/config.js';

// POST /kyc/start  — inicia el flujo KYC con Etherfuse
// GET  /kyc/status — consulta estado actual del KYC del usuario
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const email  = event.requestContext.authorizer.jwt.claims['email'] as string;
  const path   = event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (!userId) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  if (method === 'POST' && path.endsWith('/start')) {
    return handleKycStart(userId, email);
  }
  if (method === 'GET' && path.endsWith('/status')) {
    return handleKycStatus(userId);
  }

  return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
};

async function handleKycStart(userId: string, email: string) {
  const existing = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableKycStatus,
    Key: { userId },
  }));

  if (existing.Item?.['status'] === 'approved') {
    return { statusCode: 200, body: JSON.stringify({ status: 'approved', alreadyVerified: true }) };
  }

  // Call Etherfuse KYC hosted flow — returns a redirect URL for the user
  const efRes = await fetch(`${config.etherfuse.apiUrl}/v1/kyc/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.etherfuse.apiKey}`,
    },
    body: JSON.stringify({
      external_id: userId,
      email,
      redirect_url: 'https://app.accesly.io/kyc/callback',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!efRes.ok) {
    const err = await efRes.text();
    console.error('[etherfuseKYC] Start failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'KYC provider error' }) };
  }

  const session = await efRes.json() as { id: string; kyc_url: string };

  await dynamo.send(new PutCommand({
    TableName: config.dynamo.tableKycStatus,
    Item: {
      userId,
      status: 'pending',
      etherfuseSessionId: session.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ kycUrl: session.kyc_url, sessionId: session.id }),
  };
}

async function handleKycStatus(userId: string) {
  const record = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableKycStatus,
    Key: { userId },
  }));

  if (!record.Item) {
    return { statusCode: 200, body: JSON.stringify({ status: 'not_started' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: record.Item['status'],
      updatedAt: record.Item['updatedAt'],
    }),
  };
}
