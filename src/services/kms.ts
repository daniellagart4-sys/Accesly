/**
 * kms.ts - AWS KMS wrapper for encrypting/decrypting Shamir shares.
 *
 * Uses AWS KMS symmetric encryption (AES-256) to protect Share 1
 * of the Shamir secret sharing scheme. The KMS key never leaves AWS;
 * we send data to KMS and it returns the encrypted/decrypted result.
 *
 * Direct encryption is used (not envelope) because Shamir shares
 * are well under the 4KB KMS limit.
 */

import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

// ---------------------------------------------------------------------------
// Configuration (loaded from environment variables)
// ---------------------------------------------------------------------------
const AWS_REGION = import.meta.env.AWS_REGION;
const AWS_KMS_KEY_ARN = import.meta.env.AWS_KMS_KEY_ARN;

// Lazy-initialized KMS client to avoid crashing if env vars are missing
let _kmsClient: KMSClient | null = null;

function getKmsClient(): KMSClient {
  if (!_kmsClient) {
    if (!AWS_REGION || !import.meta.env.AWS_ACCESS_KEY_ID) {
      throw new Error('AWS KMS environment variables not configured');
    }
    _kmsClient = new KMSClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: import.meta.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: import.meta.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _kmsClient;
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt data using AWS KMS.
 *
 * Sends the plaintext to AWS KMS, which encrypts it with the CMK
 * and returns the ciphertext. The plaintext never leaves our server
 * unencrypted (TLS in transit, KMS encrypts at rest).
 *
 * @param data - The raw bytes to encrypt (Shamir share)
 * @returns Base64-encoded ciphertext string (safe for DB storage)
 */
export async function awsEncrypt(data: Uint8Array): Promise<string> {
  const client = getKmsClient();

  const command = new EncryptCommand({
    KeyId: AWS_KMS_KEY_ARN,
    Plaintext: data,
  });

  const result = await client.send(command);

  if (!result.CiphertextBlob) {
    throw new Error('AWS KMS encrypt returned no ciphertext');
  }

  // Convert to base64 for safe storage in Supabase text columns
  return Buffer.from(result.CiphertextBlob).toString('base64');
}

/**
 * Decrypt data using AWS KMS.
 *
 * Sends the ciphertext to AWS KMS, which decrypts it with the CMK
 * and returns the plaintext.
 *
 * @param ciphertextBase64 - Base64-encoded ciphertext (from awsEncrypt)
 * @returns The original plaintext bytes (Shamir share)
 */
export async function awsDecrypt(ciphertextBase64: string): Promise<Uint8Array> {
  const client = getKmsClient();

  const command = new DecryptCommand({
    KeyId: AWS_KMS_KEY_ARN,
    CiphertextBlob: Buffer.from(ciphertextBase64, 'base64'),
  });

  const result = await client.send(command);

  if (!result.Plaintext) {
    throw new Error('AWS KMS decrypt returned no plaintext');
  }

  return new Uint8Array(result.Plaintext);
}
