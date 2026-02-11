/**
 * middleware.ts - Global request middleware.
 *
 * Handles:
 * 1. CORS headers for /api/* routes (allows cross-origin SDK calls)
 * 2. API key validation for cross-origin requests
 *
 * Same-origin requests (from the Accesly app itself) bypass API key checks.
 * Routes under /api/developers/* and /api/auth/* skip API key validation
 * since they use Supabase auth directly.
 */

import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Routes that skip API key validation (use Bearer token auth instead) */
const SKIP_API_KEY_PREFIXES = ['/api/developers', '/api/auth'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // Only apply CORS/API-key logic to /api/* routes
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  const origin = request.headers.get('origin') || '';
  const isCrossOrigin = origin !== '' && origin !== url.origin;

  // Handle CORS preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(origin),
    });
  }

  // For cross-origin requests, validate API key (except whitelisted routes)
  if (isCrossOrigin) {
    const skipValidation = SKIP_API_KEY_PREFIXES.some((prefix) =>
      url.pathname.startsWith(prefix)
    );

    if (!skipValidation) {
      const apiKey = request.headers.get('x-accesly-key');

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'Missing API key. Include x-accesly-key header.' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...buildCorsHeaders(origin),
            },
          }
        );
      }

      const valid = await validateApiKey(apiKey, origin);
      if (!valid) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key or origin not allowed.' }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              ...buildCorsHeaders(origin),
            },
          }
        );
      }
    }
  }

  // Execute the actual route handler
  const response = await next();

  // Attach CORS headers to the response for cross-origin requests
  if (isCrossOrigin) {
    const newHeaders = new Headers(response.headers);
    const cors = buildCorsHeaders(origin);
    for (const [key, value] of Object.entries(cors)) {
      newHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
});

/**
 * Build CORS headers allowing the given origin.
 * Permits common headers needed by the SDK.
 */
function buildCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-accesly-key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Validate an API key against the developers table.
 * Optionally checks if the request origin is in the allowed_origins list.
 * If allowed_origins is empty, any origin is permitted.
 */
async function validateApiKey(
  apiKey: string,
  origin: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('developers')
    .select('allowed_origins')
    .eq('app_id', apiKey)
    .single();

  if (error || !data) return false;

  // If no origins configured, allow all (developer hasn't restricted yet)
  const origins: string[] = data.allowed_origins || [];
  if (origins.length === 0) return true;

  // Check if the request origin is whitelisted
  return origins.includes(origin);
}
