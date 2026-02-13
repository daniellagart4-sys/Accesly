/**
 * POST /api/wallet/sign
 *
 * Signs an arbitrary XDR transaction using the user's custodial key.
 * Optionally submits the signed transaction to the Stellar network.
 *
 * Flow:
 * 1. Verify authentication (JWT)
 * 2. Parse and validate XDR input
 * 3. Retrieve wallet and Shamir shares
 * 4. Reconstruct secret key
 * 5. Security validations (source, blocked operations)
 * 6. Sign the transaction
 * 7. Optionally submit to Horizon
 *
 * Required header: Authorization: Bearer <supabase_jwt>
 * Body: { "xdr": "<base64 XDR>", "submit": false }
 */

import type { APIRoute } from 'astro';
import {
  Keypair,
  TransactionBuilder,
  Transaction,
  Networks,
} from '@stellar/stellar-sdk';
import { getAuthUser, supabaseAdmin } from '../../../services/supabase';
import { reconstructKey } from '../../../services/shamir';
import type { StoredShares } from '../../../services/shamir';

const NETWORK_PASSPHRASE = import.meta.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

/**
 * Validate that a transaction does not contain dangerous operations.
 * Blocked:
 *  - accountMerge (destroys the account)
 *  - setOptions that modify masterWeight, signers, or thresholds
 */
function validateOperations(tx: Transaction): { valid: boolean; reason?: string } {
  for (const op of tx.operations) {
    if (op.type === 'accountMerge') {
      return { valid: false, reason: 'accountMerge operations are not allowed' };
    }

    if (op.type === 'setOptions') {
      const opts = op as any;
      if (opts.masterWeight !== undefined) {
        return { valid: false, reason: 'Modifying masterWeight is not allowed' };
      }
      if (opts.signer !== undefined) {
        return { valid: false, reason: 'Modifying signers is not allowed' };
      }
      if (opts.lowThreshold !== undefined || opts.medThreshold !== undefined || opts.highThreshold !== undefined) {
        return { valid: false, reason: 'Modifying thresholds is not allowed' };
      }
    }
  }
  return { valid: true };
}

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
    const { xdr, submit = false } = body;

    if (!xdr || typeof xdr !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "xdr" field' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 3. Parse the XDR ---
    let tx: Transaction;
    try {
      const parsed = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
      if (!(parsed instanceof Transaction)) {
        return new Response(
          JSON.stringify({ error: 'FeeBumpTransaction is not supported' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      tx = parsed;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid XDR transaction' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 4. Retrieve wallet ---
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

    // --- 5. Validate source account matches user's wallet ---
    if (tx.source !== wallet.stellar_address) {
      return new Response(
        JSON.stringify({ error: 'Transaction source does not match your wallet address' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 6. Validate operations (block dangerous ones) ---
    const validation = validateOperations(tx);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: `Blocked operation: ${validation.reason}` }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- 7. Get Shamir shares and reconstruct key ---
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

    const secret = await reconstructKey(signer as StoredShares);
    const keypair = Keypair.fromSecret(secret);

    // --- 8. Sign the transaction ---
    tx.sign(keypair);
    const signedXdr = tx.toXDR();

    // --- 9. Optionally submit ---
    if (submit) {
      const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `tx=${encodeURIComponent(signedXdr)}`,
      });

      const submitData = await submitRes.json();

      if (!submitRes.ok) {
        const errorDetail = submitData.extras?.result_codes?.operations?.join(', ') || submitData.title;
        return new Response(
          JSON.stringify({ error: `Transaction submission failed: ${errorDetail}`, signedXdr }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ signedXdr, txHash: submitData.hash }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return only the signed XDR
    return new Response(
      JSON.stringify({ signedXdr }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sign transaction failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Transaction signing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
