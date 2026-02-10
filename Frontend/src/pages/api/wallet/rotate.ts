/**
 * POST /api/wallet/rotate
 *
 * Rotates the wallet's keypair (key rotation for security).
 *
 * Flow:
 * 1. Verify authentication (Supabase JWT)
 * 2. Get the user's wallet and contract ID
 * 3. Call SEP-30 recoverAccount (reconstructs old key, generates new key,
 *    rotates on-chain ownership, re-splits with Shamir)
 * 4. Return new wallet info
 *
 * This is an atomic operation: if on-chain rotation fails,
 * the old key remains active and pending shares are rolled back.
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import { recoverAccount } from '../../../services/sep30';

export const POST: APIRoute = async ({ request }) => {
  try {
    // --- 1. Verify authentication ---
    const user = await getAuthUser(request);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const email = user.email;
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'No email found in user profile' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 2. Get the user's wallet ---
    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('contract_id')
      .eq('user_id', user.id)
      .single();

    if (!wallet) {
      return new Response(
        JSON.stringify({ error: 'No wallet found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 3. Rotate keys via SEP-30 atomic recovery flow ---
    const result = await recoverAccount(wallet.contract_id, email);

    // --- 4. Return new wallet info ---
    return new Response(
      JSON.stringify({
        message: 'Keys rotated successfully',
        newPublicKey: result.newPublicKey,
        newStellarAddress: result.newStellarAddress,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Key rotation failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Key rotation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
