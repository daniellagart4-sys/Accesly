/**
 * supabase.ts - Server-side Supabase client.
 *
 * Uses the SERVICE_ROLE key which bypasses Row Level Security (RLS).
 * This client should ONLY be used in API routes (server-side),
 * never exposed to the browser.
 */

import { createClient } from '@supabase/supabase-js';

// Admin client: bypasses RLS, full access to all tables.
// Used by API endpoints to manage wallets, keys, and identities.
const supabaseAdmin = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extract and verify the authenticated user from an incoming request.
 * Reads the Authorization header (Bearer token) and validates it with Supabase.
 *
 * @param request - The incoming HTTP request
 * @returns The authenticated user object, or null if not authenticated
 */
export async function getAuthUser(request: Request) {
  const authHeader = request.headers.get('Authorization');

  // Expect "Bearer <jwt_token>" format
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  // Validate the JWT with Supabase and get the user
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export { supabaseAdmin };
