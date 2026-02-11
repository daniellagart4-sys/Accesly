/**
 * POST /api/developers/regenerate-key
 *
 * Regenerates the API key for the authenticated developer's app.
 * The old key is immediately invalidated.
 * Requires Supabase auth (Bearer token).
 *
 * Response: { appId: "acc_xxxxxxxxxxxx" }
 */

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

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

  // Generate new API key
  const newAppId = `acc_${crypto.randomBytes(12).toString('hex')}`;

  // Update the developer's app_id
  const { data, error } = await supabaseAdmin
    .from('developers')
    .update({ app_id: newAppId })
    .eq('user_id', user.id)
    .select('app_id')
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: 'No developer app found or update failed.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ appId: data.app_id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
