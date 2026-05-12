import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { config } from '../../shared/config.js';

// POST /orders/onramp  — quote + create MXN→USDC SPEI order
// POST /orders/offramp — quote + create USDC→MXN SPEI order
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const path   = event.requestContext.http.path;

  if (!userId) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  // Require approved KYC for all order operations
  const kyc = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableKycStatus,
    Key: { userId },
  }));
  if (kyc.Item?.['status'] !== 'approved') {
    return { statusCode: 403, body: JSON.stringify({ error: 'KYC required' }) };
  }

  const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;

  if (path.endsWith('/onramp')) {
    return handleOnramp(userId, body);
  }
  if (path.endsWith('/offramp')) {
    return handleOfframp(userId, body);
  }

  return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
};

async function handleOnramp(userId: string, body: Record<string, unknown>) {
  const { amount_mxn } = body as { amount_mxn: number };
  if (!amount_mxn || amount_mxn <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'amount_mxn required' }) };
  }

  const quoteRes = await fetch(`${config.etherfuse.apiUrl}/v1/quotes/onramp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.etherfuse.apiKey}`,
    },
    body: JSON.stringify({ amount_mxn, currency: 'MXN', target: 'USDC' }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!quoteRes.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Quote failed' }) };
  }

  const quote = await quoteRes.json() as { quote_id: string; usdc_amount: number; spei_clabe: string; expires_at: string };

  return {
    statusCode: 200,
    body: JSON.stringify({
      quoteId:    quote.quote_id,
      mxnAmount:  amount_mxn,
      usdcAmount: quote.usdc_amount,
      speClabe:   quote.spei_clabe,
      expiresAt:  quote.expires_at,
    }),
  };
}

async function handleOfframp(userId: string, body: Record<string, unknown>) {
  const { amount_usdc, clabe } = body as { amount_usdc: number; clabe: string };
  if (!amount_usdc || !clabe) {
    return { statusCode: 400, body: JSON.stringify({ error: 'amount_usdc and clabe required' }) };
  }

  const quoteRes = await fetch(`${config.etherfuse.apiUrl}/v1/quotes/offramp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.etherfuse.apiKey}`,
    },
    body: JSON.stringify({ amount_usdc, currency: 'USDC', target: 'MXN', destination_clabe: clabe }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!quoteRes.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Quote failed' }) };
  }

  const quote = await quoteRes.json() as { quote_id: string; mxn_amount: number; stellar_address: string; expires_at: string };

  return {
    statusCode: 200,
    body: JSON.stringify({
      quoteId:        quote.quote_id,
      usdcAmount:     amount_usdc,
      mxnAmount:      quote.mxn_amount,
      stellarAddress: quote.stellar_address, // SDK sends USDC here to trigger the offramp
      expiresAt:      quote.expires_at,
    }),
  };
}
