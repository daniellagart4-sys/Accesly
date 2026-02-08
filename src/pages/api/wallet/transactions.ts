/**
 * GET /api/wallet/transactions
 *
 * Returns the transaction history for the authenticated user's wallet.
 * Queries the Stellar Horizon testnet for recent payment operations.
 *
 * Optional query param: ?limit=20 (default 20, max 50)
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import { getTransactionHistory } from '../../../services/stellar';

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

    // Get the user's wallet
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

    // Parse the limit parameter (default 20, max 50)
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10), 1), 50);

    // Fetch transaction history from Horizon
    const transactions = await getTransactionHistory(wallet.stellar_address, limit);

    return new Response(
      JSON.stringify({ transactions }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Transaction history query failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch transactions' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
