import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { config } from './config.js';

const kms = new KMSClient({ region: config.aws.region });

export async function kmsEncrypt(plaintext: Uint8Array): Promise<string> {
  const res = await kms.send(new EncryptCommand({
    KeyId: config.aws.kmsKeyId,
    Plaintext: plaintext,
  }));
  if (!res.CiphertextBlob) throw new Error('KMS encrypt returned no ciphertext');
  return Buffer.from(res.CiphertextBlob).toString('base64');
}

export async function kmsDecrypt(ciphertextB64: string): Promise<Uint8Array> {
  const res = await kms.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(ciphertextB64, 'base64'),
    KeyId: config.aws.kmsKeyId,
  }));
  if (!res.Plaintext) throw new Error('KMS decrypt returned no plaintext');
  return res.Plaintext;
}
