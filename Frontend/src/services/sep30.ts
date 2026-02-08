/**
 * sep30.ts - SEP-30 Account Recovery service.
 *
 * Our backend acts as a SEP-30 Recovery Server that:
 * - Stores encrypted signing keys in Supabase
 * - Verifies user identity via Google (Supabase Auth) or SEP-10
 * - Signs transactions on behalf of authenticated users
 * - Handles account recovery (key rotation via contract's update_owner)
 *
 * Architecture:
 * - Each wallet has a recovery signer (keypair) stored encrypted in DB
 * - Identity verification uses the user's Google email
 * - Recovery flow: re-authenticate → decrypt key → rotate ownership
 *
 * When migrating to a distributed KMS:
 * - Replace the encrypt/decrypt calls in this file with KMS API calls
 * - Add a second recovery server for true multi-party SEP-30 compliance
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0030.md
 */

import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { supabaseAdmin } from './supabase';
import { encrypt, decrypt } from './crypto';
import {
  generateWalletKeypair,
  rotateOwner,
  NETWORK_PASSPHRASE,
} from './stellar';

const ENCRYPTION_KEY = import.meta.env.ENCRYPTION_KEY;

// ---------------------------------------------------------------------------
// Account Registration (POST /accounts/:address)
// ---------------------------------------------------------------------------

/**
 * Register an account with the recovery server (SEP-30).
 *
 * Stores the wallet's signing key (encrypted) and associates it with
 * the user's identity (email) for future recovery.
 *
 * @param walletId - The wallet's UUID in our database
 * @param secret - The wallet's secret key (S... format)
 * @param email - The user's email (identity for recovery)
 * @returns The recovery signer's public key
 */
export async function registerAccount(
  walletId: string,
  secret: string,
  email: string
): Promise<{ signerPublicKey: string }> {
  // The signing key for recovery is the wallet's own keypair
  const keypair = Keypair.fromSecret(secret);

  // Encrypt the secret key before storing
  const { encrypted, iv, tag } = encrypt(secret, ENCRYPTION_KEY);

  // Store the encrypted signer key
  const { error: signerError } = await supabaseAdmin
    .from('recovery_signers')
    .insert({
      wallet_id: walletId,
      signer_public_key: keypair.publicKey(),
      encrypted_secret_key: encrypted,
      encryption_iv: iv,
      encryption_tag: tag,
    });

  if (signerError) {
    throw new Error(`Failed to store recovery signer: ${signerError.message}`);
  }

  // Register the identity (email) for this wallet
  const { error: identityError } = await supabaseAdmin
    .from('recovery_identities')
    .insert({
      wallet_id: walletId,
      role: 'owner',
      auth_method_type: 'email',
      auth_method_value: email.toLowerCase().trim(),
    });

  if (identityError) {
    throw new Error(`Failed to store recovery identity: ${identityError.message}`);
  }

  return { signerPublicKey: keypair.publicKey() };
}

// ---------------------------------------------------------------------------
// Account Info (GET /accounts/:address)
// ---------------------------------------------------------------------------

/** SEP-30 account info response shape */
interface Sep30AccountInfo {
  address: string;
  identities: Array<{
    role: string;
    authenticated?: boolean;
  }>;
  signers: Array<{
    key: string;
  }>;
}

/**
 * Get account information from the recovery server (SEP-30).
 *
 * Returns the registered identities and signer public keys.
 * Does NOT return secret keys.
 *
 * @param contractId - The Stellar contract address (C... format)
 * @param authenticatedEmail - The email of the currently authenticated user (for marking authenticated identities)
 * @returns SEP-30 account info
 */
export async function getAccountInfo(
  contractId: string,
  authenticatedEmail?: string
): Promise<Sep30AccountInfo> {
  // Find the wallet by contract ID
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('wallets')
    .select('id')
    .eq('contract_id', contractId)
    .single();

  if (walletError || !wallet) {
    throw new Error('Account not found');
  }

  // Get identities
  const { data: identities } = await supabaseAdmin
    .from('recovery_identities')
    .select('role, auth_method_type, auth_method_value')
    .eq('wallet_id', wallet.id);

  // Get signers (public keys only)
  const { data: signers } = await supabaseAdmin
    .from('recovery_signers')
    .select('signer_public_key, created_at')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false });

  return {
    address: contractId,
    identities: (identities || []).map((id) => ({
      role: id.role,
      // Mark as authenticated if the current user's email matches
      authenticated: !!(
        authenticatedEmail &&
        id.auth_method_type === 'email' &&
        id.auth_method_value === authenticatedEmail.toLowerCase().trim()
      ),
    })),
    signers: (signers || []).map((s) => ({
      key: s.signer_public_key,
    })),
  };
}

// ---------------------------------------------------------------------------
// Transaction Signing (POST /accounts/:address/sign/:signer)
// ---------------------------------------------------------------------------

/**
 * Sign a transaction using the recovery signer's key (SEP-30).
 *
 * The client sends a transaction XDR, and we sign it with the
 * stored recovery key after verifying the user's identity.
 *
 * @param contractId - The contract address
 * @param signerPublicKey - The recovery signer's public key (must match stored signer)
 * @param txXdr - The transaction XDR (base64) to sign
 * @param userEmail - The authenticated user's email (for identity verification)
 * @returns The signed transaction XDR (base64)
 */
export async function signTransaction(
  contractId: string,
  signerPublicKey: string,
  txXdr: string,
  userEmail: string
): Promise<string> {
  // Find the wallet
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('wallets')
    .select('id')
    .eq('contract_id', contractId)
    .single();

  if (walletError || !wallet) {
    throw new Error('Account not found');
  }

  // Verify identity: check that the user's email is registered for this wallet
  const { data: identity } = await supabaseAdmin
    .from('recovery_identities')
    .select('id')
    .eq('wallet_id', wallet.id)
    .eq('auth_method_type', 'email')
    .eq('auth_method_value', userEmail.toLowerCase().trim())
    .single();

  if (!identity) {
    throw new Error('Identity not authorized for this account');
  }

  // Retrieve the encrypted signer key
  const { data: signer } = await supabaseAdmin
    .from('recovery_signers')
    .select('encrypted_secret_key, encryption_iv, encryption_tag')
    .eq('wallet_id', wallet.id)
    .eq('signer_public_key', signerPublicKey)
    .single();

  if (!signer) {
    throw new Error('Signer not found');
  }

  // Decrypt the secret key
  const secret = decrypt(
    signer.encrypted_secret_key,
    ENCRYPTION_KEY,
    signer.encryption_iv,
    signer.encryption_tag
  );

  // Sign the transaction
  const keypair = Keypair.fromSecret(secret);
  const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
  tx.sign(keypair);

  return tx.toXDR();
}

// ---------------------------------------------------------------------------
// Account Recovery
// ---------------------------------------------------------------------------

/**
 * Recover a wallet by rotating the owner key (SEP-30 recovery flow).
 *
 * This is triggered when a user authenticates via Google after losing
 * access to their device key. The flow:
 * 1. Verify the user's Google identity matches the recovery identity
 * 2. Decrypt the old secret key
 * 3. Generate a new keypair
 * 4. Call contract.update_owner() to rotate on-chain
 * 5. Update the encrypted key in Supabase
 *
 * @param contractId - The contract address (C... format)
 * @param userEmail - The authenticated user's email
 * @returns New wallet public key info
 */
export async function recoverAccount(
  contractId: string,
  userEmail: string
): Promise<{
  newPublicKey: string;
  newStellarAddress: string;
}> {
  // Find the wallet
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('wallets')
    .select('id, contract_id')
    .eq('contract_id', contractId)
    .single();

  if (walletError || !wallet) {
    throw new Error('Account not found');
  }

  // Verify identity
  const { data: identity } = await supabaseAdmin
    .from('recovery_identities')
    .select('id')
    .eq('wallet_id', wallet.id)
    .eq('auth_method_type', 'email')
    .eq('auth_method_value', userEmail.toLowerCase().trim())
    .single();

  if (!identity) {
    throw new Error('Identity not authorized for recovery');
  }

  // Get the current (old) signer
  const { data: oldSigner } = await supabaseAdmin
    .from('recovery_signers')
    .select('id, encrypted_secret_key, encryption_iv, encryption_tag')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!oldSigner) {
    throw new Error('No recovery signer found');
  }

  // Decrypt the old secret key
  const oldSecret = decrypt(
    oldSigner.encrypted_secret_key,
    ENCRYPTION_KEY,
    oldSigner.encryption_iv,
    oldSigner.encryption_tag
  );

  // Generate a new keypair
  const newKeypair = generateWalletKeypair();

  // Rotate ownership on-chain: old key signs, new key becomes owner
  await rotateOwner(contractId, oldSecret, newKeypair.publicKeyRaw);

  // Encrypt the new secret key
  const { encrypted, iv, tag } = encrypt(newKeypair.secret, ENCRYPTION_KEY);

  // Update the signer in the database
  const { error: updateError } = await supabaseAdmin
    .from('recovery_signers')
    .update({
      signer_public_key: newKeypair.stellarAddress,
      encrypted_secret_key: encrypted,
      encryption_iv: iv,
      encryption_tag: tag,
    })
    .eq('id', oldSigner.id);

  if (updateError) {
    throw new Error(`Failed to update recovery signer: ${updateError.message}`);
  }

  // Update the wallet's public key
  await supabaseAdmin
    .from('wallets')
    .update({
      public_key: newKeypair.publicKeyHex,
      stellar_address: newKeypair.stellarAddress,
    })
    .eq('id', wallet.id);

  return {
    newPublicKey: newKeypair.publicKeyHex,
    newStellarAddress: newKeypair.stellarAddress,
  };
}

// ---------------------------------------------------------------------------
// Identity Update (PUT /accounts/:address)
// ---------------------------------------------------------------------------

/**
 * Update the recovery identities for an account (SEP-30).
 *
 * @param contractId - The contract address
 * @param identities - New identity entries to replace existing ones
 * @param userEmail - The authenticated user's email (for authorization)
 */
export async function updateIdentities(
  contractId: string,
  identities: Array<{
    role: string;
    auth_methods: Array<{ type: string; value: string }>;
  }>,
  userEmail: string
): Promise<void> {
  // Find the wallet
  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('id')
    .eq('contract_id', contractId)
    .single();

  if (!wallet) {
    throw new Error('Account not found');
  }

  // Verify the caller is authorized (current email must match an existing identity)
  const { data: existingIdentity } = await supabaseAdmin
    .from('recovery_identities')
    .select('id')
    .eq('wallet_id', wallet.id)
    .eq('auth_method_type', 'email')
    .eq('auth_method_value', userEmail.toLowerCase().trim())
    .single();

  if (!existingIdentity) {
    throw new Error('Not authorized to update identities');
  }

  // Delete old identities and insert new ones (full replacement per SEP-30)
  await supabaseAdmin
    .from('recovery_identities')
    .delete()
    .eq('wallet_id', wallet.id);

  const newIdentities = identities.flatMap((identity) =>
    identity.auth_methods.map((method) => ({
      wallet_id: wallet.id,
      role: identity.role,
      auth_method_type: method.type,
      auth_method_value: method.value.toLowerCase().trim(),
    }))
  );

  if (newIdentities.length > 0) {
    const { error } = await supabaseAdmin
      .from('recovery_identities')
      .insert(newIdentities);

    if (error) {
      throw new Error(`Failed to update identities: ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Account Deletion (DELETE /accounts/:address)
// ---------------------------------------------------------------------------

/**
 * Remove an account from the recovery server (SEP-30).
 * Deletes the signer keys and identities from the database.
 * Does NOT affect the on-chain contract.
 *
 * @param contractId - The contract address
 * @param userEmail - The authenticated user's email
 */
export async function deleteAccount(
  contractId: string,
  userEmail: string
): Promise<void> {
  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('id')
    .eq('contract_id', contractId)
    .single();

  if (!wallet) {
    throw new Error('Account not found');
  }

  // Verify authorization
  const { data: identity } = await supabaseAdmin
    .from('recovery_identities')
    .select('id')
    .eq('wallet_id', wallet.id)
    .eq('auth_method_type', 'email')
    .eq('auth_method_value', userEmail.toLowerCase().trim())
    .single();

  if (!identity) {
    throw new Error('Not authorized to delete account');
  }

  // Delete signers and identities (cascade would handle this, but be explicit)
  await supabaseAdmin
    .from('recovery_signers')
    .delete()
    .eq('wallet_id', wallet.id);

  await supabaseAdmin
    .from('recovery_identities')
    .delete()
    .eq('wallet_id', wallet.id);
}
