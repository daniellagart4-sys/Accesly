/**
 * shamir.ts - Shamir's Secret Sharing for wallet key management.
 *
 * Splits a Stellar secret key into 3 shares (2-of-3 threshold):
 * - Share 1: Encrypted with AWS KMS
 * - Share 2: Encrypted with AES-256-GCM (local ENCRYPTION_KEY)
 * - Share 3: Encrypted with Google Cloud KMS (backup)
 *
 * Only 2 shares are needed to reconstruct the key. Share 3 acts
 * as a backup if either AWS KMS or the local encryption fails.
 *
 * Uses the `shamir-secret-sharing` library by Privy (audited by Cure53 & Zellic).
 */

import { split, combine } from 'shamir-secret-sharing';
import { createHash, timingSafeEqual } from 'node:crypto';
import { awsEncrypt, awsDecrypt } from './kms';
import { gcpEncrypt, gcpDecrypt } from './gcp-kms';
import { encrypt, decrypt } from './crypto';

const ENCRYPTION_KEY = import.meta.env.ENCRYPTION_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Encrypted shares + integrity hash, ready for DB storage */
export interface SplitKeyResult {
  kmsShare: string;    // Share 1: AWS KMS encrypted (base64)
  localShare: string;  // Share 2: AES-256-GCM encrypted (JSON string)
  gcpShare: string;    // Share 3: Google Cloud KMS encrypted (base64)
  keyHash: string;     // SHA-256 hash of the original key (hex) for integrity verification
}

/** Shape of shares stored in the database */
export interface StoredShares {
  kms_share: string;
  local_share: string;
  gcp_share: string;
  key_hash: string;
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/**
 * Split a Stellar secret key into 3 encrypted shares.
 *
 * The key is divided using Shamir's Secret Sharing (2-of-3 threshold),
 * then each share is encrypted with its respective provider before storage.
 * A SHA-256 hash of the original key is stored for integrity verification
 * during reconstruction.
 *
 * @param secretKey - The Stellar secret key (S... format) to protect
 * @returns Encrypted shares + integrity hash, ready for DB storage
 */
export async function splitKey(secretKey: string): Promise<SplitKeyResult> {
  // Convert the secret key to bytes for Shamir splitting
  const secretBytes = new TextEncoder().encode(secretKey);

  // Compute integrity hash BEFORE splitting (used to verify reconstruction)
  const keyHash = createHash('sha256').update(secretBytes).digest('hex');

  // Split into 3 shares with threshold of 2
  const shares = await split(secretBytes, 3, 2);

  // Encrypt each share with its respective provider
  const [kmsShare, gcpShare] = await Promise.all([
    awsEncrypt(shares[0]),   // Share 1 → AWS KMS
    gcpEncrypt(shares[2]),   // Share 3 → Google Cloud KMS
  ]);

  // Share 2 → AES-256-GCM (local encryption)
  const localEncrypted = encrypt(
    Buffer.from(shares[1]).toString('hex'),
    ENCRYPTION_KEY
  );
  const localShare = JSON.stringify(localEncrypted);

  // Zero out plaintext shares from memory
  shares[0].fill(0);
  shares[1].fill(0);
  shares[2].fill(0);
  secretBytes.fill(0);

  return { kmsShare, localShare, gcpShare, keyHash };
}

// ---------------------------------------------------------------------------
// Reconstruct
// ---------------------------------------------------------------------------

/**
 * Reconstruct a Stellar secret key from encrypted shares.
 *
 * Primary path: uses Share 1 (AWS KMS) + Share 2 (AES local).
 * Fallback: if either fails, uses Share 3 (Google Cloud KMS) as replacement.
 *
 * After reconstruction, verifies integrity with the stored SHA-256 hash.
 *
 * IMPORTANT: The caller MUST zero out the returned string after use.
 *
 * @param shares - The encrypted shares from the database
 * @returns The reconstructed Stellar secret key (S... format)
 * @throws Error if reconstruction or integrity verification fails
 */
export async function reconstructKey(shares: StoredShares): Promise<string> {
  let share1: Uint8Array | null = null;
  let share2: Uint8Array | null = null;
  let share3: Uint8Array | null = null;

  // Track which shares we successfully decrypted
  const decryptedShares: Uint8Array[] = [];
  const errors: string[] = [];

  // --- Attempt to decrypt Share 1 (AWS KMS) ---
  try {
    share1 = await awsDecrypt(shares.kms_share);
    decryptedShares.push(share1);
  } catch (err) {
    errors.push(`AWS KMS: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  // --- Attempt to decrypt Share 2 (AES local) ---
  try {
    const localData = JSON.parse(shares.local_share);
    const hexString = decrypt(
      localData.encrypted,
      ENCRYPTION_KEY,
      localData.iv,
      localData.tag
    );
    share2 = new Uint8Array(Buffer.from(hexString, 'hex'));
    decryptedShares.push(share2);
  } catch (err) {
    errors.push(`AES local: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  // --- If we don't have 2 shares yet, try Share 3 (Google Cloud KMS) ---
  if (decryptedShares.length < 2) {
    try {
      share3 = await gcpDecrypt(shares.gcp_share);
      decryptedShares.push(share3);
    } catch (err) {
      errors.push(`GCP KMS: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  // --- Need at least 2 shares to reconstruct ---
  if (decryptedShares.length < 2) {
    throw new Error(
      `Failed to decrypt enough shares (got ${decryptedShares.length}/2). Errors: ${errors.join('; ')}`
    );
  }

  // --- Reconstruct the secret key from any 2 shares ---
  const reconstructedBytes = await combine(decryptedShares.slice(0, 2));

  // --- Verify integrity with SHA-256 hash ---
  const reconstructedHash = createHash('sha256').update(reconstructedBytes).digest('hex');
  const expectedHash = Buffer.from(shares.key_hash, 'hex');
  const actualHash = Buffer.from(reconstructedHash, 'hex');

  if (!timingSafeEqual(expectedHash, actualHash)) {
    // Primary pair failed integrity check; try alternative combinations
    if (decryptedShares.length === 2 && !share3) {
      // We only had 2 shares and they failed. Try getting Share 3 for alt combo
      try {
        share3 = await gcpDecrypt(shares.gcp_share);
      } catch {
        throw new Error('Key reconstruction failed: integrity check failed and GCP backup unavailable');
      }

      // Try share1+share3 or share2+share3
      const altShare = share1 || share2;
      if (altShare) {
        const altReconstructed = await combine([altShare, share3]);
        const altHash = createHash('sha256').update(altReconstructed).digest('hex');
        const altHashBuf = Buffer.from(altHash, 'hex');

        if (timingSafeEqual(expectedHash, altHashBuf)) {
          const secretKey = new TextDecoder().decode(altReconstructed);
          cleanupShares(share1, share2, share3);
          return secretKey;
        }
        altReconstructed.fill(0);
      }
      throw new Error('Key reconstruction failed: all share combinations failed integrity check');
    }
    throw new Error('Key reconstruction failed: integrity check failed');
  }

  // --- Success: decode the secret key ---
  const secretKey = new TextDecoder().decode(reconstructedBytes);

  // --- Zero out all shares and intermediate buffers from memory ---
  cleanupShares(share1, share2, share3);
  reconstructedBytes.fill(0);

  return secretKey;
}

/**
 * Zero out share buffers to prevent secret material from lingering in memory.
 */
function cleanupShares(
  share1: Uint8Array | null,
  share2: Uint8Array | null,
  share3: Uint8Array | null
): void {
  if (share1) share1.fill(0);
  if (share2) share2.fill(0);
  if (share3) share3.fill(0);
}
