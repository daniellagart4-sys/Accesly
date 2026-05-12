import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../shared/config.js';
import { sendTransactionConfirmation } from '../../shared/ses.js';

// Public endpoint — no JWT auth — server-to-server from Etherfuse
// Validates HMAC signature before processing
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const signature = event.headers['x-etherfuse-signature'] ?? '';
  const rawBody = event.body ?? '';

  if (!verifySignature(rawBody, signature)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  const payload = JSON.parse(rawBody) as EtherfuseWebhookPayload;

  switch (payload.event_type) {
    case 'onramp.completed':
      await handleOnrampCompleted(payload);
      break;
    case 'offramp.completed':
      await handleOfframpCompleted(payload);
      break;
    case 'kyc.approved':
      await handleKycApproved(payload);
      break;
    case 'kyc.rejected':
      await handleKycRejected(payload);
      break;
    default:
      console.log(`[etherfuseWebhook] Unhandled event: ${payload.event_type}`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

function verifySignature(body: string, signature: string): boolean {
  const expected = createHmac('sha256', config.etherfuse.webhookSecret)
    .update(body)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function handleOnrampCompleted(payload: EtherfuseWebhookPayload) {
  const { email, amount_mxn, amount_usdc, transaction_id } = payload.data as {
    email: string; amount_mxn: string; amount_usdc: string; transaction_id: string;
  };
  console.log('[etherfuseWebhook] Onramp completed:', payload.data);

  if (email) {
    await sendTransactionConfirmation({
      email,
      type: 'onramp',
      amountMxn: amount_mxn,
      amountUsdc: amount_usdc,
      txId: transaction_id,
    });
  }
}

async function handleOfframpCompleted(payload: EtherfuseWebhookPayload) {
  const { email, amount_mxn, amount_usdc, transaction_id } = payload.data as {
    email: string; amount_mxn: string; amount_usdc: string; transaction_id: string;
  };
  console.log('[etherfuseWebhook] Offramp completed:', payload.data);

  if (email) {
    await sendTransactionConfirmation({
      email,
      type: 'offramp',
      amountMxn: amount_mxn,
      amountUsdc: amount_usdc,
      txId: transaction_id,
    });
  }
}

async function handleKycApproved(payload: EtherfuseWebhookPayload) {
  const { external_id } = payload.data as { external_id: string };
  const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  const { dynamo } = await import('../../shared/dynamo.js');
  const { config: cfg } = await import('../../shared/config.js');

  await dynamo.send(new UpdateCommand({
    TableName: cfg.dynamo.tableKycStatus,
    Key: { userId: external_id },
    UpdateExpression: 'SET #s = :s, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': 'approved', ':u': new Date().toISOString() },
  }));

  console.log(`[etherfuseWebhook] KYC approved for user ${external_id}`);
}

async function handleKycRejected(payload: EtherfuseWebhookPayload) {
  const { external_id, reason } = payload.data as { external_id: string; reason: string };
  const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  const { dynamo } = await import('../../shared/dynamo.js');
  const { config: cfg } = await import('../../shared/config.js');

  await dynamo.send(new UpdateCommand({
    TableName: cfg.dynamo.tableKycStatus,
    Key: { userId: external_id },
    UpdateExpression: 'SET #s = :s, rejectedReason = :r, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': 'rejected',
      ':r': reason,
      ':u': new Date().toISOString(),
    },
  }));
}

interface EtherfuseWebhookPayload {
  event_type: string;
  data: Record<string, unknown>;
}
