import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@mastergame/shared';

let _client: SupabaseClient<Database> | null = null;

// service_role client bypasses RLS. Server only; callers must first use requireAdmin().
// Create lazily so builds without runtime environment values can complete.
export function getAdminClient(): SupabaseClient<Database> {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  _client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
