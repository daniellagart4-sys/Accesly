/**
 * POST /api/wallet/create
 *
 * Creates a new wallet for an authenticated Google user.
 *
 * Flow:
 * 1. Verify the user is authenticated (Supabase Auth JWT)
 * 2. Check if the user already has a wallet (prevent duplicates)
 * 3. Generate a new Ed25519 keypair (Stellar SDK)
 * 4. Hash the user's email (SHA-256 → 32 bytes)
 * 5. Deploy a new contract instance on Soroban
 * 6. Initialize the contract with owner public key + email hash
 * 7. Encrypt the secret key and store in Supabase
 * 8. Register with SEP-30 recovery server
 * 9. Return wallet info to the frontend
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import {
  generateWalletKeypair,
  hashEmail,
  deployContract,
  initContract,
  fundWithFriendbot,
} from '../../../services/stellar';
import { registerAccount } from '../../../services/sep30';

export const POST: APIRoute = async ({ request }) => {
  try {
    // --- 1. Verify authentication ---
    const user = await getAuthUser(request);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please sign in with Google.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const email = user.email;
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'No email found in user profile.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 2. Check for existing wallet ---
    const { data: existingWallet } = await supabaseAdmin
      .from('wallets')
      .select('id, contract_id, public_key, stellar_address')
      .eq('user_id', user.id)
      .single();

    if (existingWallet) {
      return new Response(
        JSON.stringify({
          error: 'Wallet already exists',
          wallet: {
            contractId: existingWallet.contract_id,
            publicKey: existingWallet.public_key,
            stellarAddress: existingWallet.stellar_address,
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 3. Generate wallet keypair ---
    const walletKeypair = generateWalletKeypair();

    // --- 3.5. Fund the wallet address on testnet via Friendbot ---
    // The Stellar address must be funded (activated) before it can be used.
    // Friendbot gives 10,000 test XLM and activates the account on-chain.
    await fundWithFriendbot(walletKeypair.stellarAddress);

    // --- 4. Hash email ---
    const emailHashBuffer = hashEmail(email);
    const emailHashHex = emailHashBuffer.toString('hex');

    // --- 5. Deploy new contract instance ---
    const contractId = await deployContract();

    // --- 6. Initialize the contract on-chain ---
    const txHash = await initContract(
      contractId,
      walletKeypair.publicKeyRaw,
      emailHashBuffer
    );

    // --- 7. Store wallet in Supabase ---
    const { data: wallet, error: insertError } = await supabaseAdmin
      .from('wallets')
      .insert({
        user_id: user.id,
        stellar_address: walletKeypair.stellarAddress,
        public_key: walletKeypair.publicKeyHex,
        email: email,
        email_hash: emailHashHex,
        contract_id: contractId,
      })
      .select('id')
      .single();

    if (insertError || !wallet) {
      throw new Error(`Failed to store wallet: ${insertError?.message}`);
    }

    // --- 8. Register with SEP-30 recovery server ---
    await registerAccount(wallet.id, walletKeypair.secret, email);

    // --- 9. Return wallet info ---
    return new Response(
      JSON.stringify({
        wallet: {
          contractId,
          publicKey: walletKeypair.publicKeyHex,
          stellarAddress: walletKeypair.stellarAddress,
          emailHash: emailHashHex,
          txHash,
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Wallet creation failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Wallet creation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
