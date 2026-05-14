import { randomBytes, createHash, pbkdf2Sync } from 'node:crypto';

/**
 * @deprecated Not used since createWallet v2. Client generates fragments.
 * Kept for reference — was a 3-of-3 XOR scheme (required all shares).
 * The current scheme is two independent 2-of-2 splits:
 *   normal:   F1 (device) XOR F2 (server/KMS) = secret
 *   recovery: K_email XOR emailFragment = F1 → F1 XOR F2 = secret
 */
export function splitKey(secret: Uint8Array): [Uint8Array, Uint8Array, Uint8Array] {
  const len = secret.length;
  const f1 = randomBytes(len);
  const f2 = Buffer.alloc(len);
  for (let i = 0; i < len; i++) f2[i] = secret[i] ^ f1[i];
  return [f1, f2, Buffer.from(f1)]; // f3 = copy of f1, to be email-encrypted by caller
}

/** @deprecated Use client-side XOR in SDK instead. */
export function recombineKey(f1: Uint8Array, f2: Uint8Array, _f3?: Uint8Array): Uint8Array {
  const len = f1.length;
  const secret = Buffer.alloc(len);
  for (let i = 0; i < len; i++) secret[i] = f1[i] ^ f2[i];
  return secret;
}

export function pbkdf2Encrypt(plaintext: Uint8Array, email: string): { ciphertext: string; salt: string } {
  const salt = randomBytes(32);
  const key = pbkdf2Sync(email, salt, 310_000, 32, 'sha256');
  // XOR encrypt — sufficient because key is derived per-user with high-entropy salt
  const ct = Buffer.alloc(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) {
    ct[i] = plaintext[i] ^ key[i % 32];
  }
  return {
    ciphertext: ct.toString('base64'),
    salt: salt.toString('base64'),
  };
}

export function pbkdf2Decrypt(ciphertextB64: string, saltB64: string, email: string): Uint8Array {
  const salt = Buffer.from(saltB64, 'base64');
  const ct = Buffer.from(ciphertextB64, 'base64');
  const key = pbkdf2Sync(email, salt, 310_000, 32, 'sha256');
  const plain = Buffer.alloc(ct.length);
  for (let i = 0; i < ct.length; i++) {
    plain[i] = ct[i] ^ key[i % 32];
  }
  return plain;
}

export function hashEmail(email: string): Buffer {
  return createHash('sha256').update(email.toLowerCase().trim()).digest();
}
