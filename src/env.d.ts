/// <reference types="astro/client" />

/**
 * Type definitions for all environment variables used in the project.
 * PUBLIC_ prefix = accessible in browser. Others = server-only.
 */
interface ImportMetaEnv {
  // Supabase (public = browser-accessible)
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;

  // Supabase (server-only)
  readonly SUPABASE_SERVICE_ROLE_KEY: string;

  // Stellar / Soroban
  readonly SOROBAN_RPC_URL: string;
  readonly SOROBAN_NETWORK_PASSPHRASE: string;
  readonly WASM_HASH: string;
  readonly STELLAR_SERVER_SECRET: string;

  // SEP-10
  readonly SEP10_SERVER_SECRET: string;
  readonly SEP10_HOME_DOMAIN: string;

  // Security
  readonly ENCRYPTION_KEY: string;
  readonly JWT_SECRET: string;

  // AWS KMS (Share 1 encryption)
  readonly AWS_ACCESS_KEY_ID: string;
  readonly AWS_SECRET_ACCESS_KEY: string;
  readonly AWS_REGION: string;
  readonly AWS_KMS_KEY_ARN: string;

  // Google Cloud KMS (Share 3 encryption / backup)
  readonly GCP_KMS_PROJECT_ID: string;
  readonly GCP_KMS_LOCATION: string;
  readonly GCP_KMS_KEY_RING: string;
  readonly GCP_KMS_KEY_NAME: string;
  readonly GCP_SERVICE_ACCOUNT_JSON: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
