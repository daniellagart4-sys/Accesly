#!/usr/bin/env node
// Builds, zips, and deploys all Lambda functions to AWS
// Run: AWS_REGION=us-east-1 AWS_ACCOUNT_ID=xxx node scripts/deploy-lambdas.mjs

import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from '@aws-sdk/client-lambda';
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { execSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { zip } from 'node:zlib';
import { promisify } from 'node:util';

const __dir    = dirname(fileURLToPath(import.meta.url));
const rootDir  = join(__dir, '..');
const region   = process.env.AWS_REGION ?? 'us-east-1';
const accountId = process.env.AWS_ACCOUNT_ID;

if (!accountId) throw new Error('AWS_ACCOUNT_ID required');

const lambda = new LambdaClient({ region });
const iam    = new IAMClient({ region });

const ROLE_NAME = 'accesly-lambda-role';
const LAMBDAS = [
  'createWallet',
  'getFragment2',
  'sep30Handler',
  'manageTTL',
  'etherfuseKYC',
  'etherfuseOrder',
  'etherfuseWebhook',
  'distributeYield',
];

// ---------------------------------------------------------------------------
// 1. Ensure Lambda execution role exists
// ---------------------------------------------------------------------------
let roleArn;
try {
  const r = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
  roleArn = r.Role?.Arn;
  console.log(`✓ Lambda role exists: ${roleArn}`);
} catch {
  const trust = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: 'sts:AssumeRole',
    }],
  });

  const created = await iam.send(new CreateRoleCommand({
    RoleName: ROLE_NAME,
    AssumeRolePolicyDocument: trust,
    Description: 'Accesly Lambda execution role',
  }));
  roleArn = created.Role?.Arn;

  // Attach basic execution policy
  await iam.send(new AttachRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
  }));

  // Inline policy: DynamoDB + KMS
  await iam.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: 'accesly-lambda-inline',
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:DeleteItem','dynamodb:Query','dynamodb:Scan','dynamodb:TransactWriteItems'],
          Resource: `arn:aws:dynamodb:${region}:${accountId}:table/*`,
        },
        {
          Effect: 'Allow',
          Action: ['kms:Encrypt','kms:Decrypt','kms:GenerateDataKey'],
          Resource: '*',
        },
      ],
    }),
  }));

  console.log(`✓ Lambda role created: ${roleArn}`);
  // Wait for role propagation
  console.log('  Waiting 10s for IAM propagation...');
  await new Promise(r => setTimeout(r, 10_000));
}

// ---------------------------------------------------------------------------
// 2. Build TypeScript
// ---------------------------------------------------------------------------
console.log('\nBuilding TypeScript...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
console.log('✓ Build complete');

// ---------------------------------------------------------------------------
// 3. Deploy each Lambda
// ---------------------------------------------------------------------------
for (const name of LAMBDAS) {
  process.stdout.write(`\nDeploying ${name}... `);

  // Zip the handler + shared files
  const distDir  = join(rootDir, 'dist');
  const zipPath  = join(rootDir, `dist/${name}.zip`);

  execSync(
    `cd ${distDir} && zip -r ${zipPath} lambdas/${name}/ shared/ node_modules/ 2>/dev/null || true`,
    { stdio: 'pipe' }
  );

  // Copy node_modules into dist for bundling
  execSync(`cp -r ${rootDir}/node_modules ${distDir}/node_modules 2>/dev/null || true`, { stdio: 'pipe' });
  execSync(`cd ${distDir} && zip -r ${zipPath} lambdas/${name}/ shared/ node_modules/`, { stdio: 'pipe' });

  const zipBuffer = readFileSync(zipPath);

  const envVars = {
    AWS_REGION_NAME:           region,
    COGNITO_USER_POOL_ID:      process.env.COGNITO_USER_POOL_ID ?? '',
    KMS_KEY_ID:                process.env.KMS_KEY_ID ?? '',
    STELLAR_NETWORK:           process.env.STELLAR_NETWORK ?? 'testnet',
    STELLAR_NETWORK_PASSPHRASE: process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
    SOROBAN_CONTRACT_FACTORY:  process.env.SOROBAN_CONTRACT_FACTORY ?? '',
    RELAYER_URL:               process.env.RELAYER_URL ?? '',
    ETHERFUSE_API_URL:         process.env.ETHERFUSE_API_URL ?? 'https://api.etherfuse.com',
    ETHERFUSE_API_KEY:         process.env.ETHERFUSE_API_KEY ?? '',
    ETHERFUSE_WEBHOOK_SECRET:  process.env.ETHERFUSE_WEBHOOK_SECRET ?? '',
    SES_FROM_EMAIL:            process.env.SES_FROM_EMAIL ?? 'noreply@accesly.io',
    RECOVERY_ENABLED:          'false',
  };

  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: name }));
    // Update existing
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: name,
      ZipFile: zipBuffer,
    }));
    process.stdout.write('updated ✓\n');
  } catch {
    // Create new
    await lambda.send(new CreateFunctionCommand({
      FunctionName: name,
      Runtime: 'nodejs22.x',
      Role: roleArn,
      Handler: `lambdas/${name}/index.handler`,
      Code: { ZipFile: zipBuffer },
      Timeout: 30,
      MemorySize: 256,
      Environment: { Variables: envVars },
    }));
    process.stdout.write('created ✓\n');
  }
}

console.log('\n✓ All Lambdas deployed.');
console.log('\nNext: re-run setup-api-gateway.mjs to wire routes → Lambdas');
