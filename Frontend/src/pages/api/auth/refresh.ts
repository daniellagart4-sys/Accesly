/**
 * POST /api/auth/refresh
 *
 * Refreshes an expired access token using a refresh token.
 * Used by the SDK when the access token expires.
 * No API key required (uses refresh token for auth).
 *
 * Request body: { refreshToken: string }
 * Response: { accessToken: string, refreshToken: string, expiresAt: number }
 */

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const refreshToken = body?.refreshToken;

  if (!refreshToken || typeof refreshToken !== 'string') {
    return new Response(
      JSON.stringify({ error: 'refreshToken is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a temporary Supabase client to refresh the session
  const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    return new Response(
      JSON.stringify({ error: 'Failed to refresh token. Please re-authenticate.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
