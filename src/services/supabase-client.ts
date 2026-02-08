/**
 * supabase-client.ts - Browser-side Supabase client.
 *
 * Uses the ANON key which respects Row Level Security (RLS).
 * Safe to use in React components and browser code.
 */

import { createClient } from '@supabase/supabase-js';

// Browser client: respects RLS, limited access based on auth state.
// Used by React components for Google OAuth login and session management.
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);
