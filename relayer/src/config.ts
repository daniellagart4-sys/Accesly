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
  port: parseInt(optional('PORT', '3001')),
  apiKey: required('RELAYER_API_KEY'),
  encryptionKey: required('ENCRYPTION_KEY'),

  aws: {
    region: optional('AWS_REGION', 'us-east-1'),
    cognitoUserPoolId: required('COGNITO_USER_POOL_ID'),
  },

  stellar: {
    network: optional('STELLAR_NETWORK', 'testnet') as 'testnet' | 'mainnet',
    networkPassphrase: required('STELLAR_NETWORK_PASSPHRASE'),
    horizonUrl:
      optional('STELLAR_NETWORK', 'testnet') === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org',
    fundSecret: required('RELAYER_FUND_SECRET'),
    usdcIssuer:
      optional('STELLAR_NETWORK', 'testnet') === 'mainnet'
        ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },

  dynamo: {
    tableRelayerTxs: optional('DYNAMO_TABLE_RELAYER_TXS', 'relayer_transactions'),
    tableUsage: optional('DYNAMO_TABLE_USAGE', 'usage_tracking'),
    tableSwaps: optional('DYNAMO_TABLE_SWAPS', 'fund_account_swaps'),
    tableChannels: optional('DYNAMO_TABLE_CHANNELS', 'channel_accounts'),
  },

  slack: {
    webhookUrl: optional('SLACK_WEBHOOK_URL', ''),
  },

  cloudwatch: {
    enabled: optional('CLOUDWATCH_ENABLED', 'false') === 'true',
  },

  monitor: {
    pollIntervalMs: parseInt(optional('MONITOR_POLL_INTERVAL_MS', '30000')),
  },

  replenishment: {
    cron: optional('REPLENISHMENT_CRON', '*/5 * * * *'),
  },
} as const;
