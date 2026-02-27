/**
 * GET /api/wallet/swap-estimate
 *
 * Returns the estimated receive amount and optimal DEX path for a swap.
 * Queries Horizon's /paths/strict-send endpoint — no private key needed.
 *
 * Query params:
 *   from_asset  - "XLM" | "USDC" | "EURC"
 *   to_asset    - "XLM" | "USDC" | "EURC"
 *   amount      - exact amount to sell (e.g. "1")
 *
 * Response: { destinationAmount: string, path: [{code, issuer}] }
 */

import type { APIRoute } from 'astro';
import { estimateSwap } from '../../../services/stellar';

const SUPPORTED = ['XLM', 'USDC', 'EURC'];

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const from_asset = url.searchParams.get('from_asset');
  const to_asset   = url.searchParams.get('to_asset');
  const amount     = url.searchParams.get('amount');

  if (!from_asset || !to_asset || !amount) {
    return new Response(
      JSON.stringify({ error: 'Missing query params: from_asset, to_asset, amount' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!SUPPORTED.includes(from_asset) || !SUPPORTED.includes(to_asset)) {
    return new Response(
      JSON.stringify({ error: `Unsupported asset. Supported: ${SUPPORTED.join(', ')}` }),
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

  try {
    const estimate = await estimateSwap(from_asset, to_asset, amount);
    return new Response(
      JSON.stringify(estimate),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Estimate failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
