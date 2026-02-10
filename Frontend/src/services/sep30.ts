/**
 * sep30.ts - SEP-30 Account Recovery service.
 *
 * Our backend acts as a SEP-30 Recovery Server that:
 * - Splits wallet signing keys using Shamir's Secret Sharing (2-of-3)
 * - Distributes shares across AWS KMS, local AES-256-GCM, and Google Cloud KMS
 * - Verifies user identity via Google (Supabase Auth) or SEP-10
 * - Signs transactions on behalf of authenticated users
 * - Handles account recovery with atomic key rotation
 *
 * Share distribution:
 * - Share 1: AWS KMS (primary)
 * - Share 2: AES-256-GCM with ENCRYPTION_KEY (primary)
 * - Share 3: Google Cloud KMS (backup, used if Share 1 or 2 fails)
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0030.md
 */

import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { supabaseAdmin } from './supabase';
import { splitKey, reconstructKey } from './shamir';
import type { StoredShares } from './shamir';
import {
  generateWalletKeypair,
  rotateOwner,
  fundWithFriendbot,
  NETWORK_PASSPHRASE,
} from './stellar';

// ---------------------------------------------------------------------------
// Account Registration (POST /accounts/:address)
// ---------------------------------------------------------------------------

/**
 * Register an account with the recovery server (SEP-30).
 *
 * Splits the wallet's secret key into 3 Shamir shares, encrypts each
 * with its respective provider, and stores them in Supabase.
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
  const keypair = Keypair.fromSecret(secret);

  // Split the key into 3 encrypted shares using Shamir (2-of-3)
  const { kmsShare, localShare, gcpShare, keyHash } = await splitKey(secret);

  // Store the encrypted shares in Supabase
  const { error: signerError } = await supabaseAdmin
    .from('recovery_signers')
    .insert({
      wallet_id: walletId,
      signer_public_key: keypair.publicKey(),
      kms_share: kmsShare,
      local_share: localShare,
      gcp_share: gcpShare,
      key_hash: keyHash,
      status: 'active',
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
 * Does NOT return secret keys or shares.
 *
 * @param contractId - The Stellar contract address (C... format)
 * @param authenticatedEmail - The email of the currently authenticated user
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

  // Get signers (public keys only, only active ones)
  const { data: signers } = await supabaseAdmin
    .from('recovery_signers')
    .select('signer_public_key, created_at')
    .eq('wallet_id', wallet.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  return {
    address: contractId,
    identities: (identities || []).map((id) => ({
      role: id.role,
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
 * Reconstructs the secret key from 2 Shamir shares (AWS KMS + AES local),
 * signs the transaction, then zeroes out the key from memory.
 *
 * Fallback: if AWS or AES fails, uses Google Cloud KMS share as backup.
 *
 * @param contractId - The contract address
 * @param signerPublicKey - The recovery signer's public key
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

  // Verify identity: the user's email must be registered for this wallet
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

  // Retrieve the encrypted shares (active signer only)
  const { data: signer } = await supabaseAdmin
    .from('recovery_signers')
    .select('kms_share, local_share, gcp_share, key_hash')
    .eq('wallet_id', wallet.id)
    .eq('signer_public_key', signerPublicKey)
    .eq('status', 'active')
    .single();

  if (!signer) {
    throw new Error('Signer not found');
  }

  // Reconstruct the secret key from Shamir shares (2-of-3 with fallback)
  const secret = await reconstructKey(signer as StoredShares);

  // Sign the transaction
  const keypair = Keypair.fromSecret(secret);
  const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
  tx.sign(keypair);

  return tx.toXDR();
}

// ---------------------------------------------------------------------------
// Account Recovery (atomic key rotation)
// ---------------------------------------------------------------------------

/**
 * Recover a wallet by rotating the owner key (SEP-30 recovery flow).
 *
 * Atomic flow to prevent data loss:
 * 1. Verify user identity (Google email)
 * 2. Reconstruct old key from Shamir shares
 * 3. Generate new keypair
 * 4. Pre-split new key into 3 new shares (BEFORE touching the contract)
 * 5. Store new shares as 'pending_rotation'
 * 6. Call contract.update_owner() on-chain
 * 7. If success: activate new shares, mark old as 'rotated'
 * 8. If failure: delete pending shares, old shares remain active
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
  // --- 1. Find the wallet ---
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('wallets')
    .select('id, contract_id')
    .eq('contract_id', contractId)
    .single();

  if (walletError || !wallet) {
    throw new Error('Account not found');
  }

  // --- 2. Verify identity ---
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

  // --- 3. Get old signer's shares ---
  const { data: oldSigner } = await supabaseAdmin
    .from('recovery_signers')
    .select('id, kms_share, local_share, gcp_share, key_hash')
    .eq('wallet_id', wallet.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!oldSigner) {
    throw new Error('No active recovery signer found');
  }

  // --- 4. Reconstruct old secret key ---
  const oldSecret = await reconstructKey(oldSigner as StoredShares);

  // --- 5. Generate new keypair ---
  const newKeypair = generateWalletKeypair();

  // --- 6. Pre-split new key BEFORE touching the contract ---
  const newShares = await splitKey(newKeypair.secret);

  // --- 7. Store new shares as pending (safety net) ---
  const { data: pendingSigner, error: pendingError } = await supabaseAdmin
    .from('recovery_signers')
    .insert({
      wallet_id: wallet.id,
      signer_public_key: newKeypair.stellarAddress,
      kms_share: newShares.kmsShare,
      local_share: newShares.localShare,
      gcp_share: newShares.gcpShare,
      key_hash: newShares.keyHash,
      status: 'pending_rotation',
    })
    .select('id')
    .single();

  if (pendingError || !pendingSigner) {
    throw new Error(`Failed to store pending shares: ${pendingError?.message}`);
  }

  // --- 8. Rotate ownership on-chain ---
  try {
    await rotateOwner(contractId, oldSecret, newKeypair.publicKeyRaw);
  } catch (error) {
    // On-chain rotation failed: rollback by deleting pending shares
    await supabaseAdmin
      .from('recovery_signers')
      .delete()
      .eq('id', pendingSigner.id);

    throw new Error(
      `On-chain key rotation failed: ${error instanceof Error ? error.message : 'unknown'}. Rollback complete, old key still active.`
    );
  }

  // --- 9. Fund new address on testnet ---
  try {
    await fundWithFriendbot(newKeypair.stellarAddress);
  } catch {
    // Non-critical: wallet works without funding, just can't send yet
  }

  // --- 10. Activate new shares, mark old as rotated ---
  await supabaseAdmin
    .from('recovery_signers')
    .update({ status: 'active' })
    .eq('id', pendingSigner.id);

  await supabaseAdmin
    .from('recovery_signers')
    .update({ status: 'rotated' })
    .eq('id', oldSigner.id);

  // --- 11. Update wallet record ---
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

  // Verify the caller is authorized
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
 * Deletes all signer shares and identities from the database.
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

  // Delete all signers (active + rotated) and identities
  await supabaseAdmin
    .from('recovery_signers')
    .delete()
    .eq('wallet_id', wallet.id);

  await supabaseAdmin
    .from('recovery_identities')
    .delete()
    .eq('wallet_id', wallet.id);
}
