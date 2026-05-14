import { Keypair, Transaction, Networks, Account, TransactionBuilder, Asset, Operation } from '@stellar/stellar-base';

export const NETWORK_PASSPHRASES = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
} as const;

// XOR two equal-length byte arrays. Caller is responsible for zeroing the result.
export function xorFragments(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error(`Fragment length mismatch: ${a.length} vs ${b.length}`);
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

// Overwrite buffer with zeros to remove key material from memory.
export function zeroBytes(buf: Uint8Array): void {
  buf.fill(0);
}

// Generate 32 crypto-random bytes for a new key fragment.
export function generateFragment(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// Derive Stellar public key from two fragments without retaining the seed.
export function publicKeyFromFragments(f1: Uint8Array, f2: Uint8Array): string {
  const seed = xorFragments(f1, f2);
  try {
    return Keypair.fromRawEd25519Seed(Buffer.from(seed)).publicKey();
  } finally {
    zeroBytes(seed);
  }
}

/**
 * Sign a Stellar transaction XDR using MPC fragments.
 *
 * Reconstructs the Ed25519 seed via F1 XOR F2, signs, then immediately
 * zeros the seed from memory. Returns the signed XDR (base64).
 */
export function signXdr(
  xdrBase64: string,
  f1: Uint8Array,
  f2: Uint8Array,
  network: 'testnet' | 'mainnet' = 'testnet'
): string {
  const seed = xorFragments(f1, f2);
  try {
    const keypair = Keypair.fromRawEd25519Seed(Buffer.from(seed));
    const tx = new Transaction(xdrBase64, NETWORK_PASSPHRASES[network]);
    tx.sign(keypair);
    return tx.toEnvelope().toXDR('base64');
  } finally {
    zeroBytes(seed);
  }
}

/**
 * Build a payment transaction XDR without signing it.
 * Caller must load the account sequence from Horizon first.
 */
export function buildPaymentXdr(opts: {
  sourceAddress: string;
  sequence: string;
  destination: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  memo?: string;
  network: 'testnet' | 'mainnet';
  fee?: string;
}): string {
  const account = new Account(opts.sourceAddress, opts.sequence);
  const asset =
    opts.assetCode === 'XLM'
      ? Asset.native()
      : new Asset(opts.assetCode, opts.assetIssuer!);

  const builder = new TransactionBuilder(account, {
    fee: opts.fee ?? '100',
    networkPassphrase: NETWORK_PASSPHRASES[opts.network],
  }).addOperation(
    Operation.payment({ destination: opts.destination, asset, amount: opts.amount })
  );

  if (opts.memo) builder.addMemo({ value: opts.memo } as any);

  return builder.setTimeout(60).build().toEnvelope().toXDR('base64');
}
