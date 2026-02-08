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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
