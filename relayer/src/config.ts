import 'dotenv/config';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// M-5: compute network once, derive all dependent values from it
const network = optional('STELLAR_NETWORK', 'testnet') as 'testnet' | 'mainnet';

// I-4: validate cron expression at startup
const replenishmentCron = optional('REPLENISHMENT_CRON', '*/5 * * * *');
const cronField = '(?:\\*(?:\\/\\d+)?|[0-9,\\-]+(?:\\/\\d+)?)';
if (!new RegExp(`^${cronField}\\s+${cronField}\\s+${cronField}\\s+${cronField}\\s+${cronField}$`).test(replenishmentCron)) {
  throw new Error(`Invalid REPLENISHMENT_CRON expression: "${replenishmentCron}"`);
}

export const config = {
  port: parseInt(optional('PORT', '3001')),
  encryptionKey: required('ENCRYPTION_KEY'),

  aws: {
    region: optional('AWS_REGION', 'us-east-1'),
    cognitoUserPoolId: required('COGNITO_USER_POOL_ID'),
  },

  stellar: {
    network,
    networkPassphrase: required('STELLAR_NETWORK_PASSPHRASE'),
    horizonUrl: network === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org',
    fundSecret: required('RELAYER_FUND_SECRET'),
    usdcIssuer: network === 'mainnet'
      ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
      : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },

  // M-1: all table names configurable via env
  dynamo: {
    tableRelayerTxs:  optional('DYNAMO_TABLE_RELAYER_TXS',  'relayer_transactions'),
    tableUsage:       optional('DYNAMO_TABLE_USAGE',         'usage_tracking'),
    tableSwaps:       optional('DYNAMO_TABLE_SWAPS',         'fund_account_swaps'),
    tableChannels:    optional('DYNAMO_TABLE_CHANNELS',      'channel_accounts'),
    tableAppConfigs:  optional('DYNAMO_TABLE_APP_CONFIGS',   'app_configs'),
    tableWallets:     optional('DYNAMO_TABLE_WALLETS',       'wallets'),
    tableMonitorState: optional('DYNAMO_TABLE_MONITOR_STATE', 'monitor_state'),
  },

  cors: {
    allowedOrigins: optional('CORS_ALLOWED_ORIGINS', 'https://app.accesly.io').split(',').map(o => o.trim()),
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
    cron: replenishmentCron,
  },
} as const;
