/**
 * POST /api/wallet/send
 *
 * Sends XLM from the authenticated user's wallet to another Stellar address.
 *
 * Flow:
 * 1. Verify authentication
 * 2. Validate inputs (destination, amount)
 * 3. Retrieve and decrypt the wallet's secret key from Supabase
 * 4. Build, sign, and submit the payment transaction
 * 5. Return the transaction hash
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 * Body: { "destination": "G...", "amount": "10.5", "memo": "optional" }
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import { sendPayment } from '../../../services/stellar';
import { reconstructKey } from '../../../services/shamir';
import type { StoredShares } from '../../../services/shamir';

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
    const { destination, amount, memo } = body;

    if (!destination || !amount) {
      return new Response(
        JSON.stringify({ error: 'Missing "destination" or "amount"' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate destination format (G... address, 56 chars)
    if (!destination.startsWith('G') || destination.length !== 56) {
      return new Response(
        JSON.stringify({ error: 'Invalid destination address format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount is a positive number
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Amount must be a positive number' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 3. Retrieve the wallet and its encrypted secret key ---
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

    // Prevent sending to self
    if (destination === wallet.stellar_address) {
      return new Response(
        JSON.stringify({ error: 'Cannot send to your own address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the encrypted Shamir shares from recovery_signers
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

    // --- 4. Reconstruct the secret key from Shamir shares (2-of-3) ---
    const secret = await reconstructKey(signer as StoredShares);

    // --- 5. Send the payment ---
    const txHash = await sendPayment(secret, destination, amount, memo);

    return new Response(
      JSON.stringify({ txHash, message: 'Payment sent successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Send payment failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Payment failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
