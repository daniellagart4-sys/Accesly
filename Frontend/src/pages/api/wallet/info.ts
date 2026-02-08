/**
 * GET /api/wallet/info
 *
 * Returns the authenticated user's wallet information.
 * If the user has no wallet, returns a 404.
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Verify authentication
    const user = await getAuthUser(request);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Look up the user's wallet
    const { data: wallet, error } = await supabaseAdmin
      .from('wallets')
      .select('contract_id, public_key, stellar_address, email, email_hash, created_at')
      .eq('user_id', user.id)
      .single();

    if (error || !wallet) {
      return new Response(
        JSON.stringify({ error: 'No wallet found for this user' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the recovery signer info (public key only, never the secret)
    const { data: signers } = await supabaseAdmin
      .from('recovery_signers')
      .select('signer_public_key, created_at')
      .eq(
        'wallet_id',
        // Need to get wallet id
        (
          await supabaseAdmin
            .from('wallets')
            .select('id')
            .eq('user_id', user.id)
            .single()
        ).data?.id || ''
      )
      .order('created_at', { ascending: false });

    return new Response(
      JSON.stringify({
        wallet: {
          contractId: wallet.contract_id,
          publicKey: wallet.public_key,
          stellarAddress: wallet.stellar_address,
          email: wallet.email,
          emailHash: wallet.email_hash,
          createdAt: wallet.created_at,
          recoverySigners: (signers || []).map((s) => ({
            publicKey: s.signer_public_key,
            createdAt: s.created_at,
          })),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Failed to get wallet info:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
