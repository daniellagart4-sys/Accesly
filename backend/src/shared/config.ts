import 'dotenv/config';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  aws: {
    region: optional('AWS_REGION', 'us-east-1'),
    cognitoUserPoolId: required('COGNITO_USER_POOL_ID'),
    kmsKeyId: required('KMS_KEY_ID'),
  },

  stellar: {
    network: optional('STELLAR_NETWORK', 'testnet') as 'testnet' | 'mainnet',
    networkPassphrase: required('STELLAR_NETWORK_PASSPHRASE'),
    horizonUrl: optional('STELLAR_NETWORK', 'testnet') === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org',
    contractFactory: required('SOROBAN_CONTRACT_FACTORY'),
    rpcUrl: optional('STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org'),
  },

  dynamo: {
    tableUserFragments:  optional('DYNAMO_TABLE_USER_FRAGMENTS',  'user_fragments'),
    tableEmailFragments: optional('DYNAMO_TABLE_EMAIL_FRAGMENTS', 'email_fragments'),
    tableKycStatus:      optional('DYNAMO_TABLE_KYC_STATUS',      'user_kyc_status'),
    tableAppConfigs:     optional('DYNAMO_TABLE_APP_CONFIGS',     'app_configs'),
    tableYieldPositions: optional('DYNAMO_TABLE_YIELD_POSITIONS', 'yield_positions'),
    tableWallets:        optional('DYNAMO_TABLE_WALLETS',         'wallets'),
  },

  etherfuse: {
    apiUrl:    optional('ETHERFUSE_API_URL', 'https://api.etherfuse.com'),
    apiKey:    required('ETHERFUSE_API_KEY'),
    webhookSecret: required('ETHERFUSE_WEBHOOK_SECRET'),
  },

  ses: {
    fromEmail: optional('SES_FROM_EMAIL', 'acceslyoficial@gmail.com'),
  },
} as const;
