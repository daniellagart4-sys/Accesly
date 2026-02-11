/**
 * GET /api/developers/app
 *
 * Returns the developer app info for the authenticated user.
 * Requires Supabase auth (Bearer token).
 *
 * Response: { app: { app_id, app_name, allowed_origins, created_at, updated_at } }
 */

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY
);

export const GET: APIRoute = async ({ request }) => {
  // Validate auth token
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch the developer app for this user
  const { data, error } = await supabaseAdmin
    .from('developers')
    .select('app_id, app_name, allowed_origins, created_at, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: 'No developer app found. Register first.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ app: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
