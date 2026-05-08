import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';

const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = { region: config.aws.region };
if (process.env['DYNAMO_ENDPOINT']) {
  clientConfig.endpoint = process.env['DYNAMO_ENDPOINT'];
  clientConfig.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
}

const client = new DynamoDBClient(clientConfig);

export const dynamo = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});
