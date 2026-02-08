/**
 * SEP-30 Account Recovery Server - Account Operations
 *
 * POST   /api/sep30/accounts/:address  → Register account for recovery
 * GET    /api/sep30/accounts/:address  → Get account info (signers, identities)
 * PUT    /api/sep30/accounts/:address  → Update recovery identities
 * DELETE /api/sep30/accounts/:address  → Remove account from recovery server
 *
 * Authentication: Supabase Auth (Google JWT) or SEP-10 JWT.
 * The :address parameter is the Soroban contract ID (C... format).
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0030.md
 */

import type { APIRoute } from 'astro';
import { getAuthUser } from '../../../../services/supabase';
import {
  getAccountInfo,
  updateIdentities,
  deleteAccount,
} from '../../../../services/sep30';

// SEP-30 requires CORS and JSON content type
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * GET /api/sep30/accounts/:address
 *
 * Returns the account's registered identities and signer public keys.
 * Per SEP-30 spec, marks identities as "authenticated" if the caller
 * matches that identity.
 */
export const GET: APIRoute = async ({ params, request }) => {
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
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // Get account info, marking authenticated identities
    const accountInfo = await getAccountInfo(address, user.email || undefined);

    return new Response(JSON.stringify(accountInfo), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // SEP-30: return 404 if account not found
    if (message === 'Account not found') {
      return new Response(
        JSON.stringify({ error: message }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * PUT /api/sep30/accounts/:address
 *
 * Update the recovery identities for an account.
 * Replaces all existing identities with the new ones.
 *
 * Body: {
 *   "identities": [
 *     {
 *       "role": "owner",
 *       "auth_methods": [
 *         { "type": "email", "value": "user@example.com" }
 *       ]
 *     }
 *   ]
 * }
 */
export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const address = params.address;
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Missing address parameter' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const user = await getAuthUser(request);
    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const { identities } = body;

    if (!identities || !Array.isArray(identities)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "identities" field' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await updateIdentities(address, identities, user.email);

    // Return updated account info
    const accountInfo = await getAccountInfo(address, user.email);
    return new Response(JSON.stringify(accountInfo), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not authorized') ? 401 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: CORS_HEADERS }
    );
  }
};

/**
 * DELETE /api/sep30/accounts/:address
 *
 * Remove an account from the recovery server.
 * Deletes all stored signers and identities.
 * Does NOT affect the on-chain smart contract.
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const address = params.address;
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Missing address parameter' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const user = await getAuthUser(request);
    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await deleteAccount(address, user.email);

    return new Response(
      JSON.stringify({ message: 'Account removed from recovery server' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not authorized') ? 401 : 500;
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
