/**
 * POST /api/wallet/swap
 *
 * Swaps one asset for another using Stellar's built-in DEX (pathPaymentStrictSend).
 * Supported assets: XLM, USDC, EURC.
 * No counterparty needed — uses the DEX's existing liquidity pools.
 *
 * Flow:
 * 1. Verify authentication
 * 2. Validate inputs
 * 3. Retrieve and reconstruct the wallet's secret key
 * 4. Execute the swap via pathPaymentStrictSend
 * 5. Return the transaction hash
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 * Body: {
 *   "from_asset": "USDC",   // "XLM" | "USDC" | "EURC"
 *   "to_asset":   "EURC",
 *   "amount":     "10",     // exact amount to sell
 *   "min_receive":"9.9"     // minimum amount to receive (slippage protection)
 * }
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import { swapAssets } from '../../../services/stellar';
import type { SwapPathAsset } from '../../../services/stellar';
import { reconstructKey } from '../../../services/shamir';
import type { StoredShares } from '../../../services/shamir';

const SUPPORTED_ASSETS = ['XLM', 'USDC', 'EURC'];

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

    // --- 2. Parse and validate inputs ---
    const body = await request.json();
    const { from_asset, to_asset, amount, min_receive, path } = body;

    if (!from_asset || !to_asset || !amount || !min_receive) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: from_asset, to_asset, amount, min_receive' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPPORTED_ASSETS.includes(from_asset) || !SUPPORTED_ASSETS.includes(to_asset)) {
      return new Response(
        JSON.stringify({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (from_asset === to_asset) {
      return new Response(
        JSON.stringify({ error: 'from_asset and to_asset must be different' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'amount must be a positive number' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 3. Retrieve the wallet ---
    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('id, stellar_address')
      .eq('user_id', user.id)
      .single();

    if (!wallet) {
      return new Response(
        JSON.stringify({ error: 'No wallet found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the encrypted Shamir shares
    const { data: signer } = await supabaseAdmin
      .from('recovery_signers')
      .select('kms_share, local_share, gcp_share, key_hash')
      .eq('wallet_id', wallet.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!signer) {
      return new Response(
        JSON.stringify({ error: 'No signing key found' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 4. Reconstruct key and execute swap ---
    const secret = await reconstructKey(signer as StoredShares);

    const txHash = await swapAssets(
      secret,
      from_asset,
      to_asset,
      amount,
      min_receive,
      (path as SwapPathAsset[]) ?? [],
    );

    return new Response(
      JSON.stringify({ txHash, message: 'Swap executed successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Swap failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Swap failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
