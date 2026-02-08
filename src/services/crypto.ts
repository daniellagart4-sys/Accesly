/**
 * crypto.ts - Encryption utilities for protecting secret keys.
 *
 * Uses AES-256-GCM (authenticated encryption) to encrypt/decrypt
 * wallet secret keys before storing them in Supabase.
 *
 * When migrating to SEP-30 with KMS, replace these functions
 * with calls to your cloud KMS provider.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Result of encrypting data: ciphertext + IV + auth tag (all hex-encoded) */
interface EncryptedData {
  encrypted: string; // AES-256-GCM ciphertext (hex)
  iv: string;        // 12-byte initialization vector (hex)
  tag: string;       // 16-byte GCM authentication tag (hex)
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The data to encrypt (e.g., a Stellar secret key "S...")
 * @param keyHex - 32-byte encryption key as a 64-char hex string
 * @returns EncryptedData with ciphertext, IV, and auth tag
 */
export function encrypt(plaintext: string, keyHex: string): EncryptedData {
  const key = Buffer.from(keyHex, 'hex');

  // 12-byte IV is recommended for GCM mode
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Auth tag ensures the ciphertext hasn't been tampered with
  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypt data that was encrypted with AES-256-GCM.
 *
 * @param encrypted - The ciphertext (hex)
 * @param keyHex - 32-byte encryption key as a 64-char hex string
 * @param ivHex - The initialization vector used during encryption (hex)
 * @param tagHex - The GCM authentication tag (hex)
 * @returns The original plaintext string
 * @throws Error if the key, IV, or tag is wrong (tampered data)
 */
export function decrypt(
  encrypted: string,
  keyHex: string,
  ivHex: string,
  tagHex: string
): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
