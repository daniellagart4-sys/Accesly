/**
 * sep10.ts - SEP-10 Stellar Web Authentication service.
 *
 * Implements the challenge-response protocol for proving ownership
 * of a Stellar account. Used by SEP-30 recovery server and for
 * interoperability with other Stellar services (anchors, etc.).
 *
 * Flow:
 * 1. Client requests a challenge (GET /api/sep10/auth?account=G...)
 * 2. Server creates a challenge transaction with ManageData ops
 * 3. Client signs the challenge with their keypair
 * 4. Client submits signed challenge (POST /api/sep10/auth)
 * 5. Server verifies signatures and issues a JWT
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md
 */

import {
  Keypair,
  TransactionBuilder,
  Transaction,
  Operation,
  Account,
} from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SEP10_SECRET = import.meta.env.SEP10_SERVER_SECRET;
const HOME_DOMAIN = import.meta.env.SEP10_HOME_DOMAIN;
const JWT_SECRET = import.meta.env.JWT_SECRET;
const NETWORK_PASSPHRASE = import.meta.env.SOROBAN_NETWORK_PASSPHRASE;

// SEP-10 server keypair (signs challenges).
// Lazy-initialized to avoid crashing at import time if env var is missing.
let _sep10Keypair: Keypair | null = null;
function getSep10Keypair(): Keypair {
  if (!_sep10Keypair) {
    if (!SEP10_SECRET) throw new Error('SEP10_SERVER_SECRET not configured');
    _sep10Keypair = Keypair.fromSecret(SEP10_SECRET);
  }
  return _sep10Keypair;
}

// Challenge validity window (15 minutes, per SEP-10 spec)
const CHALLENGE_TTL_SECONDS = 900;

// JWT validity (24 hours)
const JWT_TTL_SECONDS = 86400;

// ---------------------------------------------------------------------------
// Challenge Creation
// ---------------------------------------------------------------------------

/**
 * Create a SEP-10 challenge transaction for a client account.
 *
 * The challenge is a Stellar transaction with:
 * - Source: server account
 * - Sequence: 0 (invalid, cannot be submitted to the network)
 * - TimeBounds: now to now+15min
 * - ManageData op with client account as source and random nonce
 * - ManageData op with web_auth_domain
 *
 * @param clientAccount - The Stellar account (G...) to authenticate
 * @returns XDR-encoded challenge transaction (base64)
 */
export function createChallenge(clientAccount: string): string {
  const now = Math.floor(Date.now() / 1000);

  // Use sequence "-1" so the transaction has sequence 0 (invalid)
  // This prevents the challenge from being submitted to the network
  const serverAccount = new Account(getSep10Keypair().publicKey(), '-1');

  // Generate a 48-byte random nonce, base64-encoded (per SEP-10 spec)
  const nonce = randomBytes(48).toString('base64');

  const tx = new TransactionBuilder(serverAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: {
      minTime: now,
      maxTime: now + CHALLENGE_TTL_SECONDS,
    },
  })
    // First op: client must sign this (ManageData with client as source)
    .addOperation(
      Operation.manageData({
        name: `${HOME_DOMAIN} auth`,
        value: nonce,
        source: clientAccount,
      })
    )
    // Second op: identifies the auth server domain
    .addOperation(
      Operation.manageData({
        name: 'web_auth_domain',
        value: HOME_DOMAIN,
      })
    )
    .build();

  // Server signs the challenge
  tx.sign(getSep10Keypair());

  return tx.toXDR();
}

// ---------------------------------------------------------------------------
// Challenge Verification
// ---------------------------------------------------------------------------

/**
 * Verify a signed SEP-10 challenge and issue a JWT if valid.
 *
 * Checks:
 * 1. Server signature is present and valid
 * 2. Challenge is not expired (within TimeBounds)
 * 3. Client signature is present and valid
 * 4. First operation has the correct structure
 *
 * @param signedTxXdr - The client-signed challenge transaction (XDR base64)
 * @returns Object with the authenticated account and a JWT token
 * @throws Error if verification fails
 */
export function verifyChallenge(signedTxXdr: string): {
  account: string;
  token: string;
} {
  // Deserialize the signed transaction (SEP-10 challenges are always Transaction, not FeeBumpTransaction)
  const parsed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  if (!(parsed instanceof Transaction)) {
    throw new Error('Expected a Transaction, not a FeeBumpTransaction');
  }
  const tx = parsed;

  // --- Verify time bounds ---
  const now = Math.floor(Date.now() / 1000);
  const timeBounds = tx.timeBounds;
  if (!timeBounds) {
    throw new Error('Challenge missing time bounds');
  }
  if (now < Number(timeBounds.minTime) || now > Number(timeBounds.maxTime)) {
    throw new Error('Challenge expired');
  }

  // --- Verify server signature ---
  const txHash = tx.hash();
  const hasServerSig = tx.signatures.some((sig) => {
    try {
      getSep10Keypair().verify(txHash, sig.signature());
      return true;
    } catch {
      return false;
    }
  });
  if (!hasServerSig) {
    throw new Error('Missing server signature on challenge');
  }

  // --- Extract client account from first operation ---
  const operations = tx.operations;
  if (operations.length < 1) {
    throw new Error('Challenge has no operations');
  }

  const firstOp = operations[0];
  if (firstOp.type !== 'manageData') {
    throw new Error('First operation must be manageData');
  }
  if (!firstOp.source) {
    throw new Error('First operation missing source account');
  }

  const clientAccount = firstOp.source;

  // --- Verify client signature ---
  const clientKeypair = Keypair.fromPublicKey(clientAccount);
  const hasClientSig = tx.signatures.some((sig) => {
    try {
      clientKeypair.verify(txHash, sig.signature());
      return true;
    } catch {
      return false;
    }
  });
  if (!hasClientSig) {
    throw new Error('Missing client signature on challenge');
  }

  // --- Issue JWT ---
  const token = jwt.sign(
    {
      iss: HOME_DOMAIN,
      sub: clientAccount,
      iat: now,
      exp: now + JWT_TTL_SECONDS,
    },
    JWT_SECRET
  );

  return { account: clientAccount, token };
}

// ---------------------------------------------------------------------------
// JWT Verification
// ---------------------------------------------------------------------------

/**
 * Verify a SEP-10 JWT token and extract the authenticated account.
 *
 * @param token - The JWT token to verify
 * @returns The Stellar account (G...) that was authenticated
 * @throws Error if the token is invalid or expired
 */
export function verifySep10Token(token: string): string {
  const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
  return decoded.sub;
}

export { getSep10Keypair, HOME_DOMAIN };
