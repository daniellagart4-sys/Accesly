/**
 * POST /api/developers/register
 *
 * Registers a new developer app and returns an API key.
 * Requires Supabase auth (Bearer token).
 *
 * Request body: { appName: string }
 * Response: { appId: "acc_xxxxxxxxxxxx", appName: string }
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

  // Parse request body
  const body = await request.json().catch(() => null);
  const appName = body?.appName?.trim();

  if (!appName || appName.length < 2 || appName.length > 50) {
    return new Response(
      JSON.stringify({ error: 'appName is required (2-50 characters)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if user already has a developer app
  const { data: existing } = await supabaseAdmin
    .from('developers')
    .select('app_id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return new Response(
      JSON.stringify({
        error: 'You already have a developer app',
        appId: existing.app_id,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate unique API key: acc_ + 24 random hex chars
  const appId = `acc_${crypto.randomBytes(12).toString('hex')}`;

  // Insert developer record
  const { data, error } = await supabaseAdmin.from('developers').insert({
    user_id: user.id,
    app_name: appName,
    app_id: appId,
    allowed_origins: [],
  }).select('app_id, app_name, allowed_origins, created_at').single();

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to register app', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ app: data }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
