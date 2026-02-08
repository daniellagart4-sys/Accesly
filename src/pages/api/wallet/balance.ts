/**
 * GET /api/wallet/balance
 *
 * Returns the XLM balance for the authenticated user's wallet.
 * Queries the Stellar Horizon testnet API.
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import { getAccountBalance } from '../../../services/stellar';

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

    // Get the user's wallet to find their Stellar address
    const { data: wallet, error } = await supabaseAdmin
      .from('wallets')
      .select('stellar_address')
      .eq('user_id', user.id)
      .single();

    if (error || !wallet) {
      return new Response(
        JSON.stringify({ error: 'No wallet found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Query the Stellar network for the balance
    const balances = await getAccountBalance(wallet.stellar_address);

    return new Response(
      JSON.stringify({ balances }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Balance query failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch balance' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
