/**
 * SEP-10 Web Authentication Endpoint
 *
 * GET  /api/sep10/auth?account=G...  → Returns a challenge transaction
 * POST /api/sep10/auth               → Verifies signed challenge, returns JWT
 *
 * This endpoint implements the SEP-10 standard for Stellar account authentication.
 * It's used by the SEP-30 recovery server and for interoperability with other
 * Stellar services (anchors, exchanges, etc.).
 *
 * CORS headers are included per SEP-10 spec requirements.
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md
 */

import type { APIRoute } from 'astro';
import { createChallenge, verifyChallenge } from '../../../services/sep10';

// SEP-10 requires CORS support
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * GET /api/sep10/auth?account=G...
 *
 * Creates a SEP-10 challenge transaction for the given Stellar account.
 * The client must sign this challenge to prove account ownership.
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const account = url.searchParams.get('account');

    // The account parameter is required (G... format Stellar address)
    if (!account) {
      return new Response(
        JSON.stringify({ error: 'Missing "account" query parameter' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Validate account format (must start with G and be 56 chars)
    if (!account.startsWith('G') || account.length !== 56) {
      return new Response(
        JSON.stringify({ error: 'Invalid Stellar account format' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Create the challenge transaction
    const challengeXdr = createChallenge(account);
    const networkPassphrase = import.meta.env.SOROBAN_NETWORK_PASSPHRASE;

    return new Response(
      JSON.stringify({
        transaction: challengeXdr,
        network_passphrase: networkPassphrase,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('SEP-10 challenge creation failed:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to create challenge',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/sep10/auth
 *
 * Verifies a signed SEP-10 challenge transaction.
 * If valid, returns a JWT token that can be used for SEP-30 operations.
 *
 * Body: { "transaction": "<signed_xdr_base64>" }
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse the request body
    const body = await request.json();
    const signedTransaction = body.transaction;

    if (!signedTransaction) {
      return new Response(
        JSON.stringify({ error: 'Missing "transaction" in request body' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Verify the signed challenge and issue a JWT
    const { token } = verifyChallenge(signedTransaction);

    return new Response(
      JSON.stringify({ token }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('SEP-10 verification failed:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Challenge verification failed',
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
};

/**
 * OPTIONS /api/sep10/auth
 *
 * CORS preflight handler (required by SEP-10 spec).
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};
