#!/usr/bin/env node
// Creates API Gateway HTTP API v2 with Cognito JWT authorizer
// Run: AWS_REGION=us-east-1 COGNITO_USER_POOL_ID=us-east-1_xxx node scripts/setup-api-gateway.mjs

import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateRouteCommand,
  CreateIntegrationCommand,
  CreateStageCommand,
  GetApisCommand,
} from '@aws-sdk/client-apigatewayv2';

import {
  LambdaClient,
  AddPermissionCommand,
  GetFunctionCommand,
} from '@aws-sdk/client-lambda';

const region    = process.env.AWS_REGION ?? 'us-east-1';
const poolId    = process.env.COGNITO_USER_POOL_ID;
const accountId = process.env.AWS_ACCOUNT_ID;

if (!poolId) throw new Error('COGNITO_USER_POOL_ID required');
if (!accountId) throw new Error('AWS_ACCOUNT_ID required');

const apigw  = new ApiGatewayV2Client({ region });
const lambda = new LambdaClient({ region });

// ---------------------------------------------------------------------------
// 1. Create or find existing HTTP API
// ---------------------------------------------------------------------------
const existing = await apigw.send(new GetApisCommand({}));
let api = existing.Items?.find(a => a.Name === 'accesly-backend');

if (api) {
  console.log(`✓ API exists: ${api.ApiId}`);
} else {
  const created = await apigw.send(new CreateApiCommand({
    Name: 'accesly-backend',
    ProtocolType: 'HTTP',
    CorsConfiguration: {
      AllowOrigins: ['https://app.accesly.io', 'https://accesly.vercel.app'],
      AllowMethods: ['GET', 'POST', 'OPTIONS'],
      AllowHeaders: ['Authorization', 'Content-Type', 'X-App-Id'],
      MaxAge: 300,
    },
  }));
  api = created;
  console.log(`✓ API created: ${api.ApiId}`);
}

const apiId = api.ApiId;

// ---------------------------------------------------------------------------
// 2. Cognito JWT authorizer
// ---------------------------------------------------------------------------
const authorizer = await apigw.send(new CreateAuthorizerCommand({
  ApiId: apiId,
  AuthorizerType: 'JWT',
  IdentitySource: ['$request.header.Authorization'],
  Name: 'cognito-authorizer',
  JwtConfiguration: {
    Audience: [process.env.COGNITO_APP_CLIENT_ID ?? ''],
    Issuer: `https://cognito-idp.${region}.amazonaws.com/${poolId}`,
  },
}));
console.log(`✓ Authorizer: ${authorizer.AuthorizerId}`);

// ---------------------------------------------------------------------------
// 3. Lambda integrations + routes
// ---------------------------------------------------------------------------
const routes = [
  // Wallet
  { method: 'POST', path: '/wallet/create',    lambda: 'createWallet',    auth: true  },
  { method: 'GET',  path: '/wallet/fragment2', lambda: 'getFragment2',    auth: true  },
  // SEP-30 recovery
  { method: 'POST', path: '/sep30/recover',    lambda: 'sep30Handler',    auth: true  },
  // KYC
  { method: 'POST', path: '/kyc/start',        lambda: 'etherfuseKYC',    auth: true  },
  { method: 'GET',  path: '/kyc/status',       lambda: 'etherfuseKYC',    auth: true  },
  // Orders
  { method: 'POST', path: '/orders/onramp',    lambda: 'etherfuseOrder',  auth: true  },
  { method: 'POST', path: '/orders/offramp',   lambda: 'etherfuseOrder',  auth: true  },
  // Webhook — no JWT, HMAC-protected
  { method: 'POST', path: '/webhooks/etherfuse', lambda: 'etherfuseWebhook', auth: false },
];

const integrationCache = new Map();

for (const route of routes) {
  const fnName = route.lambda;
  const fnArn  = `arn:aws:lambda:${region}:${accountId}:function:${fnName}`;

  // Get or create integration per Lambda
  if (!integrationCache.has(fnName)) {
    const integration = await apigw.send(new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: fnArn,
      PayloadFormatVersion: '2.0',
      TimeoutInMillis: 29000,
    }));
    integrationCache.set(fnName, integration.IntegrationId);

    // Grant API Gateway permission to invoke Lambda
    try {
      await lambda.send(new AddPermissionCommand({
        FunctionName: fnName,
        StatementId:  `apigw-${apiId}-${fnName}`,
        Action:       'lambda:InvokeFunction',
        Principal:    'apigateway.amazonaws.com',
        SourceArn:    `arn:aws:execute-api:${region}:${accountId}:${apiId}/*`,
      }));
    } catch (err) {
      if (!err.message?.includes('already exists')) throw err;
    }
  }

  await apigw.send(new CreateRouteCommand({
    ApiId: apiId,
    RouteKey: `${route.method} ${route.path}`,
    Target: `integrations/${integrationCache.get(fnName)}`,
    AuthorizationType: route.auth ? 'JWT' : 'NONE',
    AuthorizerId: route.auth ? authorizer.AuthorizerId : undefined,
  }));

  console.log(`✓ ${route.method} ${route.path} → ${fnName} [auth:${route.auth}]`);
}

// ---------------------------------------------------------------------------
// 4. Deploy $default stage with throttling
// ---------------------------------------------------------------------------
await apigw.send(new CreateStageCommand({
  ApiId: apiId,
  StageName: '$default',
  AutoDeploy: true,
  DefaultRouteSettings: {
    ThrottlingBurstLimit: 100,   // max concurrent requests
    ThrottlingRateLimit:  50,    // requests/second global
  },
}));

console.log(`\n✓ Stage deployed`);
console.log(`\nAPI endpoint: https://${apiId}.execute-api.${region}.amazonaws.com`);
console.log(`\nAdd to .env:\nAPI_GATEWAY_ID=${apiId}\nAPI_GATEWAY_URL=https://${apiId}.execute-api.${region}.amazonaws.com`);
