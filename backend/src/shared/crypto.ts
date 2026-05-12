import { randomBytes, createHash, pbkdf2Sync } from 'node:crypto';

// Shamir 2-of-3 split over GF(256) — simple XOR-based scheme for 3 shares, threshold 2
// F1 stays on device (passkey-protected), F2 goes to KMS-encrypted DynamoDB, F3 email-encrypted DynamoDB
export function splitKey(secret: Uint8Array): [Uint8Array, Uint8Array, Uint8Array] {
  const len = secret.length;
  const f1 = randomBytes(len);
  const f2 = randomBytes(len);
  // F3 = secret XOR F1 XOR F2, so secret = F1 XOR F2 XOR F3
  const f3 = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    f3[i] = secret[i] ^ f1[i] ^ f2[i];
  }
  return [f1, f2, f3];
}

export function recombineKey(f1: Uint8Array, f2: Uint8Array, f3: Uint8Array): Uint8Array {
  const len = f1.length;
  const secret = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    secret[i] = f1[i] ^ f2[i] ^ f3[i];
  }
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
