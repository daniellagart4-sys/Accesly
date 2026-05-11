import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../../shared/dynamo.js';
import { kmsDecrypt } from '../../shared/kms.js';
import { config } from '../../shared/config.js';

// Returns F2 decrypted so the SDK can reconstruct the key client-side:
// secret = F1 XOR F2 XOR F3, where F1 is on device and F3 is for recovery only
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;

  if (!userId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const record = await dynamo.send(new GetCommand({
    TableName: config.dynamo.tableUserFragments,
    Key: { userId },
  }));

  if (!record.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Fragment not found' }) };
  }

  const f2 = await kmsDecrypt(record.Item['f2Encrypted'] as string);

  return {
    statusCode: 200,
    body: JSON.stringify({
      f2: Buffer.from(f2).toString('base64'),
    }),
  };
};
