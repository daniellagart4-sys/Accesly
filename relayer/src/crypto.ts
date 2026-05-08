import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config.js';

const ALGORITHM = 'aes-256-gcm';

export function encrypt(plaintext: string): { cipherHex: string; ivHex: string; tagHex: string } {
  const key = Buffer.from(config.encryptionKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    cipherHex: encrypted.toString('hex'),
    ivHex: iv.toString('hex'),
    tagHex: tag.toString('hex'),
  };
}

export function decrypt(cipherHex: string, ivHex: string, tagHex: string): string {
  const key = Buffer.from(config.encryptionKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const cipher = Buffer.from(cipherHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
}
