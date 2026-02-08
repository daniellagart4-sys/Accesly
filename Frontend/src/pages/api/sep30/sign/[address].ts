/**
 * SEP-30 Transaction Signing Endpoint
 *
 * POST /api/sep30/sign/:address
 *
 * Signs a transaction using the recovery signer's key.
 * The client sends a transaction XDR, and the server signs it
 * after verifying the user's identity.
 *
 * Also handles account recovery: generates a new keypair and
 * rotates the on-chain owner via update_owner().
 *
 * Authentication: Supabase Auth (Google JWT)
 * The :address parameter is the Soroban contract ID (C... format).
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0030.md
 */

import type { APIRoute } from 'astro';
import { getAuthUser, supabaseAdmin } from '../../../../services/supabase';
import { signTransaction, recoverAccount } from '../../../../services/sep30';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * POST /api/sep30/sign/:address
 *
 * Two modes of operation:
 *
 * 1. Sign transaction:
 *    Body: { "transaction": "<xdr_base64>", "signer": "G..." }
 *    Response: { "transaction": "<signed_xdr_base64>" }
 *
 * 2. Account recovery (key rotation):
 *    Body: { "action": "recover" }
 *    Response: { "newPublicKey": "hex", "newStellarAddress": "G..." }
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const address = params.address;
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Missing address parameter' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Authenticate the caller
    const user = await getAuthUser(request);
    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();

    // --- Mode 2: Account Recovery ---
    if (body.action === 'recover') {
      const result = await recoverAccount(address, user.email);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // --- Mode 1: Transaction Signing ---
    const { transaction: txXdr, signer } = body;

    if (!txXdr) {
      return new Response(
        JSON.stringify({ error: 'Missing "transaction" in request body' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // If no signer specified, use the most recent one
    let signerPublicKey = signer;
    if (!signerPublicKey) {
      // Look up the wallet to find the default signer
      const { data: wallet } = await supabaseAdmin
        .from('wallets')
        .select('id')
        .eq('contract_id', address)
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({ error: 'Account not found' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const { data: defaultSigner } = await supabaseAdmin
        .from('recovery_signers')
        .select('signer_public_key')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!defaultSigner) {
        return new Response(
          JSON.stringify({ error: 'No recovery signer found' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      signerPublicKey = defaultSigner.signer_public_key;
    }

    // Sign the transaction
    const signedTxXdr = await signTransaction(
      address,
      signerPublicKey,
      txXdr,
      user.email
    );

    return new Response(
      JSON.stringify({ transaction: signedTxXdr }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('SEP-30 signing failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not authorized') || message.includes('Identity') ? 403 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: CORS_HEADERS }
    );
  }
};

/**
 * OPTIONS - CORS preflight handler
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};
