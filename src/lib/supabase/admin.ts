import { createClient } from '@supabase/supabase-js';

/**
 * Secret-key client. Bypasses RLS entirely — server-only, never import this
 * into anything that ships to the browser. Used by the ingest jobs.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — ingest cannot run.',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
