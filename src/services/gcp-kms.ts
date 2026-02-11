/**
 * gcp-kms.ts - Google Cloud KMS wrapper for encrypting/decrypting Shamir shares.
 *
 * Uses Google Cloud KMS symmetric encryption to protect Share 3
 * of the Shamir secret sharing scheme. Share 3 is the backup/recovery
 * share, used only when Share 1 (AWS) or Share 2 (AES local) fails.
 *
 * Having Share 3 on a different cloud provider (Google) than Share 1 (AWS)
 * ensures true multi-cloud resilience: no single provider compromise
 * can reconstruct the key.
 */

import { KeyManagementServiceClient } from '@google-cloud/kms';

// ---------------------------------------------------------------------------
// Configuration (loaded from environment variables)
// ---------------------------------------------------------------------------
const GCP_PROJECT_ID = import.meta.env.GCP_KMS_PROJECT_ID;
const GCP_LOCATION = import.meta.env.GCP_KMS_LOCATION;
const GCP_KEY_RING = import.meta.env.GCP_KMS_KEY_RING;
const GCP_KEY_NAME = import.meta.env.GCP_KMS_KEY_NAME;
const GCP_CREDENTIALS_JSON = import.meta.env.GCP_SERVICE_ACCOUNT_JSON;

// Lazy-initialized GCP KMS client
let _gcpClient: KeyManagementServiceClient | null = null;

function getGcpClient(): KeyManagementServiceClient {
  if (!_gcpClient) {
    if (!GCP_PROJECT_ID || !GCP_CREDENTIALS_JSON) {
      throw new Error('Google Cloud KMS environment variables not configured');
    }

    // Parse the service account JSON from the environment variable
    const credentials = JSON.parse(GCP_CREDENTIALS_JSON);

    _gcpClient = new KeyManagementServiceClient({
      credentials,
      projectId: GCP_PROJECT_ID,
    });
  }
  return _gcpClient;
}

/**
 * Build the full resource name for the KMS crypto key.
 * Format: projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}
 */
function getKeyName(): string {
  return `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/keyRings/${GCP_KEY_RING}/cryptoKeys/${GCP_KEY_NAME}`;
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt data using Google Cloud KMS.
 *
 * @param data - The raw bytes to encrypt (Shamir share)
 * @returns Base64-encoded ciphertext string (safe for DB storage)
 */
export async function gcpEncrypt(data: Uint8Array): Promise<string> {
  const client = getGcpClient();

  const [result] = await client.encrypt({
    name: getKeyName(),
    plaintext: Buffer.from(data),
  });

  if (!result.ciphertext) {
    throw new Error('Google Cloud KMS encrypt returned no ciphertext');
  }

  // Convert to base64 for safe storage
  return Buffer.from(result.ciphertext as Uint8Array).toString('base64');
}

/**
 * Decrypt data using Google Cloud KMS.
 *
 * @param ciphertextBase64 - Base64-encoded ciphertext (from gcpEncrypt)
 * @returns The original plaintext bytes (Shamir share)
 */
export async function gcpDecrypt(ciphertextBase64: string): Promise<Uint8Array> {
  const client = getGcpClient();

  const [result] = await client.decrypt({
    name: getKeyName(),
    ciphertext: Buffer.from(ciphertextBase64, 'base64'),
  });

  if (!result.plaintext) {
    throw new Error('Google Cloud KMS decrypt returned no plaintext');
  }

  return new Uint8Array(result.plaintext as Uint8Array);
}
