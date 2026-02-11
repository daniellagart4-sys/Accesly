/**
 * POST /api/developers/update-origins
 *
 * Updates the allowed CORS origins for the developer's app.
 * Requires Supabase auth (Bearer token).
 *
 * Request body: { origins: string[] }
 * Response: { origins: string[] }
 */

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY
);

export const POST: APIRoute = async ({ request }) => {
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

  // Parse and validate origins
  const body = await request.json().catch(() => null);
  const origins: string[] = body?.origins;

  if (!Array.isArray(origins)) {
    return new Response(
      JSON.stringify({ error: 'origins must be an array of URL strings' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate each origin is a valid URL
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid origin URL: ${origin}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Update allowed origins
  const { data, error } = await supabaseAdmin
    .from('developers')
    .update({ allowed_origins: origins })
    .eq('user_id', user.id)
    .select('allowed_origins')
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: 'No developer app found or update failed.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ origins: data.allowed_origins }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
